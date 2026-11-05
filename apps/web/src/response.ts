export class GameConnectionError extends Error {
  constructor(message = 'Could not reach the game server. Your saved seat is safe. We will keep trying.', options?: ErrorOptions) {
    super(message, options);
  }
}

export async function readReply<T>(response: Response): Promise<T> {
  try {
    const reply: T = await response.json();
    return reply;
  } catch (cause) {
    throw new GameConnectionError(undefined, { cause });
  }
}
