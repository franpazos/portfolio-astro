/**
 * All sound is synthesised with WebAudio — the game ships zero audio files.
 *
 * The digit blip is pitched by the *value* of the digit on a minor-pentatonic
 * scale, so a run does not just beep: it plays pi as a melody, and the same
 * stretch of digits always sounds the same. That turns out to be a real memory
 * aid, which is exactly the point of the game.
 */

/** A minor pentatonic spread over two octaves, indexed by digit 0-9. */
const SEMITONES = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const ROOT_HZ = 220; // A3

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Must be called from a real user gesture, or the context stays suspended. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);

    // One second of white noise, reused for footsteps and the splash.
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  private canPlay(): boolean {
    return !this.muted && this.ctx !== null && this.master !== null && this.ctx.state === "running";
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
    delay = 0,
  ): void {
    if (!this.canPlay()) return;
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);

    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(env);
    env.connect(this.master as GainNode);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private hiss(duration: number, gain: number, cutoff: number): void {
    if (!this.canPlay() || !this.noise) return;
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master as GainNode);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  /** Correct digit. `digit` sets the pitch, so the run plays pi back to you. */
  correct(digit: string): void {
    const value = Number.parseInt(digit, 10);
    const semi = SEMITONES[Number.isFinite(value) ? value : 0] ?? 0;
    const hz = ROOT_HZ * 2 ** (semi / 12);
    this.tone("square", hz, hz, 0.1, 0.5);
    this.tone("triangle", hz * 2, hz * 2, 0.06, 0.16);
  }

  footstep(): void {
    this.hiss(0.05, 0.1, 900);
  }

  wrong(): void {
    this.tone("sawtooth", 200, 60, 0.32, 0.55);
    this.tone("square", 140, 45, 0.3, 0.25);
  }

  /** A key pressed during the cooldown. Deliberately dull and unrewarding. */
  locked(): void {
    this.tone("square", 90, 80, 0.05, 0.16);
  }

  /** Cooldown over. Lets you resume by ear instead of watching the bar. */
  ready(): void {
    this.tone("triangle", 520, 520, 0.06, 0.3);
    this.tone("triangle", 780, 780, 0.07, 0.24, 0.05);
  }

  fall(): void {
    this.tone("sine", 420, 35, 0.85, 0.5);
    this.hiss(0.5, 0.14, 500);
  }

  win(): void {
    [0, 3, 5, 7, 12].forEach((semi, i) => {
      const hz = ROOT_HZ * 2 ** (semi / 12);
      this.tone("square", hz, hz, 0.18, 0.42, i * 0.11);
    });
  }
}
