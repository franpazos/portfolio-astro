import { MAX_DIGITS, digitAt } from "./pi";

/* ------------------------------------------------------------------ *
 * Geometry & tuning. All values are in logical canvas pixels.
 * ------------------------------------------------------------------ */

export const VIEW_W = 480;
export const VIEW_H = 270;

/**
 * Planks are sized around the digit stamped on them, not the other way round:
 * the number on each plank is the thing the player reads constantly, so it gets
 * to set the geometry.
 */
export const PLANK_W = 30;
export const PLANK_H = 22;
/**
 * Top surface of the bridge. Kept well clear of the grid horizon: the thicker
 * deck needs visible void underneath it, or the bridge reads as sitting on the
 * ground and the whole threat of falling evaporates.
 */
export const DECK_Y = 152;

/** Planks handed out for free so the first digit isn't a coin flip. */
export const START_PLANKS = 4;
/** The runner starts back on the solid launch platform, not on a plank. */
export const START_X = -2 * PLANK_W;
/** World x where the launch platform begins. Purely cosmetic. */
export const PLATFORM_START = -420;

/** Where the capybara sits on screen; the world scrolls past it. */
export const RUNNER_SCREEN_X = 140;

/**
 * Pace is tuned in planks per second rather than pixels per second.
 *
 * Difficulty is really "how long do I get per digit", which is a function of
 * planks crossed, not pixels travelled. Tuning in pixels means any change to
 * plank width silently retunes the game — widening the planks to fit bigger
 * digits would have made it 36% easier. These numbers are the px-based values
 * the game was balanced at, divided by the plank width of the time.
 */
const BASE_PACE = 1.18; // planks/s at digit 0
const PACE_RAMP = 0.0173; // planks/s gained per correct digit
const MAX_PACE = 4.36; // planks/s ceiling

/**
 * Penalty for a wrong digit. A wrong key no longer ends the run — it freezes
 * input for this long while the capybara keeps walking, so the cost is ground
 * lost rather than an instant loss. Running out of bridge is the only failure.
 */
export const COOLDOWN_S = 1;

export type Phase = "ready" | "running" | "falling" | "over";
export type DeathReason = "void" | "complete";

export interface Death {
  reason: DeathReason;
  /** Digit position the run ended at. */
  at: number;
}

export interface Mistake {
  typed: string;
  expected: string;
  /** Digit position the mistake was made at. */
  at: number;
}

export interface GameState {
  phase: Phase;
  /** Correct digits typed so far. This is the score. */
  digitIndex: number;
  plankCount: number;
  /** Runner position in world px. Falls off when this passes the last plank. */
  runnerX: number;
  /** Seconds elapsed in the current run — drives every animation. */
  time: number;
  /** Planks crossed, used to fire footstep sounds. */
  planksCrossed: number;
  /** Wall-clock `time` the newest plank was laid, for its slam animation. */
  lastPlankAt: number;
  /** Seconds of input freeze left after a wrong digit. */
  cooldown: number;
  /** Wrong digits pressed this run. */
  mistakes: number;
  /** The most recent wrong digit, shown on the cooldown bar. */
  lastMistake: Mistake | null;
  fallY: number;
  fallVy: number;
  fallRot: number;
  death: Death | null;
  best: number;
  /** Decaying screen-shake amplitude. */
  shake: number;
}

export interface StepEvents {
  footstep: boolean;
  /** Fires on the frame the cooldown expires, so the player hears the all-clear. */
  recovered: boolean;
  died: DeathReason | null;
}

export function createState(best: number): GameState {
  return {
    phase: "ready",
    digitIndex: 0,
    plankCount: START_PLANKS,
    runnerX: START_X,
    time: 0,
    planksCrossed: Math.floor(START_X / PLANK_W),
    lastPlankAt: -99,
    cooldown: 0,
    mistakes: 0,
    lastMistake: null,
    fallY: 0,
    fallVy: 0,
    fallRot: 0,
    death: null,
    best,
    shake: 0,
  };
}

export function resetRun(s: GameState): void {
  const best = Math.max(s.best, s.digitIndex);
  Object.assign(s, createState(best));
}

export function startRun(s: GameState): void {
  if (s.phase !== "ready") return;
  s.phase = "running";
}

/** World x of the far edge of the bridge. */
export function bridgeEndX(s: GameState): number {
  return s.plankCount * PLANK_W;
}

/** Whole planks still ahead of the runner — the pressure gauge the HUD shows. */
export function gapAhead(s: GameState): number {
  return Math.max(0, Math.floor((bridgeEndX(s) - s.runnerX) / PLANK_W));
}

/** Walking speed in px/s, derived from the pace so geometry stays decoupled. */
export function speedOf(s: GameState): number {
  return Math.min(MAX_PACE, BASE_PACE + s.digitIndex * PACE_RAMP) * PLANK_W;
}

/** Which pi digit sits on plank `index`, or null for the free starting planks. */
export function plankDigit(index: number): string | null {
  if (index < START_PLANKS) return null;
  return digitAt(index - START_PLANKS);
}

export type SubmitResult = "correct" | "wrong" | "locked" | "ignored";

/**
 * Feed a keystroke in.
 *
 * A wrong digit costs a second of frozen input instead of the run: the target
 * digit does not advance, no plank is laid, and the capybara keeps walking the
 * whole time. Presses during the freeze are swallowed, so mashing cannot dig
 * you out of it.
 */
export function submitDigit(s: GameState, typed: string): SubmitResult {
  if (s.phase === "ready") startRun(s);
  if (s.phase !== "running") return "ignored";
  if (s.cooldown > 0) return "locked";

  const expected = digitAt(s.digitIndex);
  if (expected === null) {
    // Ran off the end of our digit table: that is a win, not a failure.
    finish(s);
    return "ignored";
  }

  if (typed !== expected) {
    s.cooldown = COOLDOWN_S;
    s.mistakes += 1;
    s.lastMistake = { typed, expected, at: s.digitIndex };
    s.shake = 0.8;
    return "wrong";
  }

  s.digitIndex += 1;
  s.plankCount += 1;
  s.lastPlankAt = s.time;

  if (s.digitIndex >= MAX_DIGITS) finish(s);
  return "correct";
}

/** Walked off the end of the bridge. The only way to lose. */
function fall(s: GameState): void {
  s.death = { reason: "void", at: s.digitIndex };
  s.best = Math.max(s.best, s.digitIndex);
  s.shake = 1;
  s.cooldown = 0;
  s.phase = "falling";
  s.fallVy = 0;
}

/** Typed every digit we have. */
function finish(s: GameState): void {
  s.death = { reason: "complete", at: s.digitIndex };
  s.best = Math.max(s.best, s.digitIndex);
  s.cooldown = 0;
  s.phase = "over";
}

/** Advance the simulation by `dt` seconds. Returns what the audio layer should play. */
export function step(s: GameState, dt: number): StepEvents {
  const events: StepEvents = { footstep: false, recovered: false, died: null };
  s.time += dt;
  s.shake = Math.max(0, s.shake - dt * 3.2);

  if (s.phase === "running") {
    if (s.cooldown > 0) {
      s.cooldown = Math.max(0, s.cooldown - dt);
      if (s.cooldown === 0) events.recovered = true;
    }

    // She walks through the penalty. That is the whole point of it.
    s.runnerX += speedOf(s) * dt;

    const crossed = Math.floor(s.runnerX / PLANK_W);
    if (crossed > s.planksCrossed) {
      s.planksCrossed = crossed;
      events.footstep = true;
    }

    if (s.runnerX > bridgeEndX(s)) {
      fall(s);
      events.died = "void";
    }
  } else if (s.phase === "falling") {
    s.fallVy += 620 * dt;
    s.fallY += s.fallVy * dt;
    s.fallRot += dt * 4.5;
    // Keep drifting forward a touch; a walker does not stop dead mid-air.
    s.runnerX += speedOf(s) * dt * 0.35;
    if (s.fallY > VIEW_H * 1.2) s.phase = "over";
  }

  return events;
}
