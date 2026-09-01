import { Sfx } from "./audio";
import { createLoop } from "./loop";
import { assertPiIntegrity, digitsFrom, formatSequence } from "./pi";
import { CAPY_SCALE, createRenderer } from "./render";
import { CAPY_HEIGHT_PX, assertSpritesWellFormed } from "./sprites";
import { loadBest, loadMuted, saveBest, saveMuted } from "./storage";
import {
  DECK_Y,
  RUNNER_SCREEN_X,
  type GameState,
  type Phase,
  createState,
  gapAhead,
  resetRun,
  step,
  submitDigit,
} from "./state";

const GAP_PIPS = 6;
const TAPE_WINDOW = 26;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing from the page`);
  return node as T;
}

export function boot(): void {
  if (import.meta.env.DEV) {
    assertPiIntegrity();
    assertSpritesWellFormed();
  }

  const stage = el<HTMLDivElement>("stage");
  const canvas = el<HTMLCanvasElement>("capy-canvas");
  const scoreOut = el("hud-score");
  const bestOut = el("hud-best");
  const tapeOut = el("hud-tape");
  const pipsOut = el("hud-pips");
  const overlayStart = el("overlay-start");
  const overlayOver = el("overlay-over");
  const overTitle = el("over-title");
  const overReason = el("over-reason");
  const overScore = el("over-score");
  const overBest = el("over-best");
  const overMistakes = el("over-mistakes");
  const overNext = el("over-next");
  const muteBtn = el<HTMLButtonElement>("mute");
  const keypad = el<HTMLDivElement>("keypad");

  const state: GameState = createState(loadBest());
  const renderer = createRenderer(canvas);
  const sfx = new Sfx(loadMuted());

  // Rendered by the page, not built here: JS-created nodes miss Astro's
  // scoped-style attribute and end up completely unstyled.
  const pips = Array.from(pipsOut.querySelectorAll<HTMLSpanElement>(".pip"));
  if (pips.length !== GAP_PIPS) {
    throw new Error(`expected ${GAP_PIPS} bridge pips in the page, found ${pips.length}`);
  }

  let prevPhase: Phase = state.phase;

  /* ------------------------------- input -------------------------------- */

  function press(digit: string): void {
    sfx.unlock();
    if (state.phase === "over") return;
    const result = submitDigit(state, digit);
    if (result === "correct") sfx.correct(digit);
    else if (result === "wrong") sfx.wrong();
    else if (result === "locked") sfx.locked();
  }

  function restart(): void {
    sfx.unlock();
    saveBest(state.best);
    resetRun(state);
    renderer.reset();
  }

  function toggleMute(): void {
    sfx.muted = !sfx.muted;
    saveMuted(sfx.muted);
    syncMuteButton();
    if (!sfx.muted) sfx.unlock();
  }

  function syncMuteButton(): void {
    muteBtn.textContent = sfx.muted ? "SOUND OFF" : "SOUND ON";
    muteBtn.setAttribute("aria-pressed", String(sfx.muted));
  }

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      press(event.key);
      return;
    }
    if (event.key === "m" || event.key === "M") {
      event.preventDefault();
      toggleMute();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      restart();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (state.phase === "over") restart();
      else sfx.unlock();
    }
  });

  // Pointer, not click: the keypad has to feel instant on a phone.
  keypad.addEventListener("pointerdown", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-digit]");
    if (!target) return;
    event.preventDefault();
    press(target.dataset.digit as string);
  });

  muteBtn.addEventListener("click", toggleMute);
  overlayOver.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-retry]")) restart();
  });

  /* ---------------------------- transitions ----------------------------- */

  function onPhaseChange(from: Phase, to: Phase): void {
    if (to === "falling") {
      renderer.burst(RUNNER_SCREEN_X, DECK_Y - (CAPY_HEIGHT_PX * CAPY_SCALE) / 2);
      sfx.fall();
      stage.classList.add("is-dying");
    }
    if (to === "over") {
      saveBest(state.best);
      if (state.death?.reason === "complete") sfx.win();
      showGameOver();
    }
    if (from === "over" || to === "ready") {
      stage.classList.remove("is-dying");
    }
  }

  function showGameOver(): void {
    const death = state.death;
    const complete = death?.reason === "complete";

    overTitle.textContent = complete ? "π MASTERED" : "GAME OVER";
    overScore.textContent = String(state.digitIndex);
    overBest.textContent = String(state.best);
    overMistakes.textContent = String(state.mistakes);

    if (complete) {
      overReason.textContent = "Every digit we have. That is genuinely absurd.";
    } else if (state.mistakes === 0) {
      overReason.textContent = "You ran out of bridge — without a single wrong digit.";
    } else {
      const cost = state.mistakes === 1 ? "one second" : `${state.mistakes} seconds`;
      overReason.innerHTML =
        `You ran out of bridge. Mistakes cost you <b class="bad">${cost}</b> of walking.`;
    }

    const next = death ? digitsFrom(death.at, 10) : "";
    overNext.textContent = next.length > 0 ? next : "—";
  }

  /* ------------------------------- frame -------------------------------- */

  function update(dt: number): void {
    const events = step(state, dt);
    if (events.footstep) sfx.footstep();
    if (events.recovered) sfx.ready();

    if (state.phase !== prevPhase) {
      const from = prevPhase;
      prevPhase = state.phase;
      onPhaseChange(from, state.phase);
    }
  }

  function render(): void {
    renderer.draw(state);
    syncHud();
  }

  function syncHud(): void {
    scoreOut.textContent = String(state.digitIndex);
    bestOut.textContent = String(state.best);

    const shown = formatSequence(digitsFrom(0, state.digitIndex));
    const clipped = shown.length > TAPE_WINDOW;
    tapeOut.textContent = clipped ? `…${shown.slice(-TAPE_WINDOW)}` : shown;

    const gap = state.phase === "running" || state.phase === "ready" ? gapAhead(state) : 0;
    const level = gap >= 4 ? "safe" : gap === 3 ? "warn" : "danger";
    pips.forEach((pip, i) => {
      pip.classList.toggle("on", i < Math.min(GAP_PIPS, gap));
      pip.dataset.level = level;
    });

    stage.classList.toggle("is-stunned", state.phase === "running" && state.cooldown > 0);

    overlayStart.hidden = state.phase !== "ready";
    overlayOver.hidden = state.phase !== "over";
  }

  syncMuteButton();
  // Paint the HUD once up front: waiting for the first animation frame leaves
  // the placeholder markup on screen, which is wrong whenever rAF is delayed
  // (a backgrounded tab, a slow first paint).
  syncHud();
  createLoop(update, render).start();
}

boot();
