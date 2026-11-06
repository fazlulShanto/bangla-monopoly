import type { GameSound } from './gameSound';

type Tone = { frequency: number; at: number; duration: number };
type Cue = { wave: OscillatorType; volume: number; glide: number; tones: readonly Tone[] };
type ActiveTone = { oscillator: OscillatorNode; gain: GainNode };

const CUES = {
  roll: { wave: 'triangle', volume: 0.025, glide: 0.35, tones: [
    { frequency: 180, at: 0, duration: 0.055 },
    { frequency: 240, at: 0.055, duration: 0.055 },
    { frequency: 195, at: 0.11, duration: 0.055 },
    { frequency: 280, at: 0.165, duration: 0.065 },
  ] },
  turn: { wave: 'sine', volume: 0.018, glide: 1, tones: [
    { frequency: 659.25, at: 0, duration: 0.1 },
    { frequency: 880, at: 0.12, duration: 0.12 },
  ] },
  purchase: { wave: 'sine', volume: 0.02, glide: 1, tones: [
    { frequency: 523.25, at: 0, duration: 0.12 },
    { frequency: 659.25, at: 0.065, duration: 0.12 },
    { frequency: 783.99, at: 0.13, duration: 0.14 },
  ] },
  build: { wave: 'triangle', volume: 0.019, glide: 1, tones: [
    { frequency: 261.63, at: 0, duration: 0.11 },
    { frequency: 392, at: 0.11, duration: 0.17 },
  ] },
  hotel: { wave: 'triangle', volume: 0.018, glide: 1, tones: [
    { frequency: 392, at: 0, duration: 0.12 },
    { frequency: 523.25, at: 0.08, duration: 0.12 },
    { frequency: 659.25, at: 0.16, duration: 0.12 },
    { frequency: 783.99, at: 0.24, duration: 0.16 },
  ] },
  gain: { wave: 'sine', volume: 0.016, glide: 1, tones: [
    { frequency: 660, at: 0, duration: 0.1 },
    { frequency: 880, at: 0.07, duration: 0.14 },
  ] },
  pay: { wave: 'triangle', volume: 0.016, glide: 1, tones: [
    { frequency: 440, at: 0, duration: 0.11 },
    { frequency: 330, at: 0.09, duration: 0.14 },
  ] },
  jail: { wave: 'triangle', volume: 0.018, glide: 1, tones: [
    { frequency: 220, at: 0, duration: 0.15 },
    { frequency: 164.81, at: 0.13, duration: 0.19 },
  ] },
  bankrupt: { wave: 'sine', volume: 0.023, glide: 1, tones: [
    { frequency: 261.63, at: 0, duration: 0.16 },
    { frequency: 196, at: 0.13, duration: 0.18 },
    { frequency: 130.81, at: 0.27, duration: 0.23 },
  ] },
  win: { wave: 'sine', volume: 0.022, glide: 1, tones: [
    { frequency: 523.25, at: 0, duration: 0.13 },
    { frequency: 659.25, at: 0.1, duration: 0.14 },
    { frequency: 783.99, at: 0.22, duration: 0.16 },
    { frequency: 1046.5, at: 0.34, duration: 0.22 },
  ] },
  lose: { wave: 'sine', volume: 0.02, glide: 1, tones: [
    { frequency: 392, at: 0, duration: 0.17 },
    { frequency: 329.63, at: 0.14, duration: 0.18 },
    { frequency: 261.63, at: 0.28, duration: 0.24 },
  ] },
} satisfies Record<GameSound, Cue>;

export class GameAudio {
  private context: AudioContext | null = null;
  private active = new Set<ActiveTone>();

  unlock(): void {
    try {
      if (typeof AudioContext === 'undefined') return;
      if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional when the browser cannot open an output device. */ }
  }

  play(sound: GameSound): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    this.stop();
    try {
      const cue: Cue = CUES[sound];
      const now = context.currentTime + 0.005;
      for (const tone of cue.tones) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const active = { oscillator, gain };
        this.active.add(active);
        oscillator.onended = () => {
          this.active.delete(active);
          oscillator.disconnect();
          gain.disconnect();
        };
        const start = now + tone.at;
        const end = start + tone.duration;
        oscillator.type = cue.wave;
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(tone.frequency * cue.glide, end);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(cue.volume, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.01);
      }
    } catch { this.stop(); }
  }

  stop(): void {
    for (const { oscillator, gain } of this.active) {
      oscillator.onended = null;
      gain.disconnect();
      oscillator.disconnect();
      try { oscillator.stop(); } catch { /* A failed start leaves no running oscillator. */ }
    }
    this.active.clear();
  }

  close(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') {
      try { void context.close().catch(() => {}); } catch { /* Closing audio must not interrupt the game. */ }
    }
  }
}
