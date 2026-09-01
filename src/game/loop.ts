/**
 * Fixed-timestep game loop.
 *
 * The simulation runs at a constant 60 Hz regardless of display refresh rate,
 * so a 144 Hz monitor does not make the capybara walk 2.4x faster. Rendering
 * still happens once per animation frame.
 */

const STEP = 1 / 60;
/** Cap on catch-up steps, so a backgrounded tab does not stall on resume. */
const MAX_STEPS = 5;

export interface Loop {
  start(): void;
  stop(): void;
}

export function createLoop(update: (dt: number) => void, render: () => void): Loop {
  let raf = 0;
  let last = 0;
  let accumulator = 0;
  let running = false;

  const frame = (now: number): void => {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const elapsed = (now - last) / 1000;
    last = now;
    // Guard against the huge delta produced by a tab regaining focus.
    accumulator += Math.min(elapsed, 0.25);

    let steps = 0;
    while (accumulator >= STEP && steps < MAX_STEPS) {
      update(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS) accumulator = 0;

    render();
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      last = performance.now();
      accumulator = 0;
      raf = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
