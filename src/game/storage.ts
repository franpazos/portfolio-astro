/**
 * localStorage access. Wrapped because it throws outright in Safari private
 * mode and in some embedded webviews — a missing high score must never take
 * the game down with it.
 */

const BEST_KEY = "capy-runner:best";
const MUTED_KEY = "capy-runner:muted";

export function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBest(best: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* nothing we can do, and nothing worth breaking the run over */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}
