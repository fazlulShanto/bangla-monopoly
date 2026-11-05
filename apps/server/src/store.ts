import { MongoClient, type Collection } from 'mongodb';
import { roomSchema, type RoomDocument } from './schema';

export interface RoomStore {
  readonly mode: 'mongo' | 'memory';
  get(code: string): Promise<RoomDocument | null>;
  findSession(hash: string): Promise<RoomDocument | null>;
  save(room: RoomDocument, previousRevision: number | null): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export class StorageConflict extends Error {
  constructor() { super('The saved room changed. Reconnect to refresh it.'); this.name = 'StorageConflict'; }
}

export class MongoRoomStore implements RoomStore {
  readonly mode = 'mongo';
  private constructor(private readonly client: MongoClient, private readonly rooms: Collection<RoomDocument>) {}

  static async connect(uri: string, database = 'deshi_tycoon'): Promise<MongoRoomStore> {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000, connectTimeoutMS: 7000 });
    try {
      await client.connect();
      await client.db(database).command({ ping: 1 });
      const rooms = client.db(database).collection<RoomDocument>('rooms');
      await rooms.createIndex({ 'seats.resumeHash': 1 });
      return new MongoRoomStore(client, rooms);
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  async get(code: string): Promise<RoomDocument | null> {
    const row = await this.rooms.findOne({ _id: code });
    return row ? roomSchema.parse(row) : null;
  }

  async findSession(hash: string): Promise<RoomDocument | null> {
    const row = await this.rooms.findOne({ 'seats.resumeHash': hash });
    return row ? roomSchema.parse(row) : null;
  }

  async save(room: RoomDocument, previousRevision: number | null): Promise<void> {
    if (previousRevision === null) {
      try { await this.rooms.insertOne(room); }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 11000) throw new StorageConflict();
        throw error;
      }
    } else {
      const result = await this.rooms.replaceOne({ _id: room._id, revision: previousRevision }, room);
      if (result.matchedCount !== 1) throw new StorageConflict();
    }
  }

  async ping(): Promise<boolean> {
    try { await this.client.db().command({ ping: 1 }); return true; } catch { return false; }
  }
  async close(): Promise<void> { await this.client.close(); }
}

export class MemoryRoomStore implements RoomStore {
  readonly mode = 'memory';
  private readonly rooms = new Map<string, RoomDocument>();
  async get(code: string): Promise<RoomDocument | null> { return structuredClone(this.rooms.get(code) ?? null); }
  async findSession(hash: string): Promise<RoomDocument | null> {
    return structuredClone([...this.rooms.values()].find(room => room.seats.some(seat => seat.resumeHash === hash)) ?? null);
  }
  async save(room: RoomDocument, previousRevision: number | null): Promise<void> {
    const saved = this.rooms.get(room._id);
    if ((previousRevision === null && saved) || (previousRevision !== null && saved?.revision !== previousRevision)) throw new StorageConflict();
    this.rooms.set(room._id, structuredClone(room));
  }
  async ping(): Promise<boolean> { return true; }
  async close(): Promise<void> {}
}
