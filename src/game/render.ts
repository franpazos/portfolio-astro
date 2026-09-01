import {
  COOLDOWN_S,
  DECK_Y,
  PLANK_H,
  PLANK_W,
  PLATFORM_START,
  RUNNER_SCREEN_X,
  VIEW_H,
  VIEW_W,
  type GameState,
  bridgeEndX,
  gapAhead,
  plankDigit,
  speedOf,
} from "./state";
import {
  CAPY_HEIGHT_PX,
  CAPY_WIDTH_PX,
  DIGIT_H,
  DIGIT_W,
  PI_GLYPH,
  drawCapy,
  drawDigit,
  drawMatrix,
} from "./sprites";

/* ------------------------------- palette -------------------------------- */

const SKY_TOP = "#0b0416";
const SKY_HORIZON = "#3a0d4f";
const GROUND = "#08030f";
const MAGENTA = "#ff2e97";
const CYAN = "#00e5ff";
const VIOLET = "#7b2ff7";
const AMBER = "#ffd166";
const PLANK_FACE = "#2c0f4d";
const PLANK_SIDE = "#170727";

/* ------------------------------- layout --------------------------------- */

const HORIZON_Y = 205;
const SUN_X = 344;
/** Lifted so the pi carved into it stays above the bridge deck. */
const SUN_Y = 128;
const SUN_R = 44;
const CAPY_SCALE = 4;

const GRID_ROWS = 14;
const GRID_COL_SPACING = 84;

/** Digits stamped on the planks. Scale 3 puts them at 18x30 real pixels on a
 *  960px-wide canvas, which is the point at which they stop needing a squint. */
const PLANK_DIGIT_SCALE = 3;
/** Gap between planks, so the bridge reads as tiles rather than one long beam. */
const PLANK_GAP = 3;
const FACE_W = PLANK_W - PLANK_GAP;
const glyphW = DIGIT_W * PLANK_DIGIT_SCALE;
const glyphH = DIGIT_H * PLANK_DIGIT_SCALE;
const DIGIT_OFFSET_X = Math.round((FACE_W - glyphW) / 2);
const DIGIT_OFFSET_Y = Math.round((PLANK_H - 1 - glyphH) / 2);

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface Renderer {
  draw(s: GameState): void;
  /** Debris burst in screen coordinates, fired on death. */
  burst(screenX: number, y: number): void;
  reset(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const maybeCtx = canvas.getContext("2d", { alpha: false });
  if (!maybeCtx) throw new Error("2D canvas context unavailable");
  // Bound to a non-nullable type rather than relying on narrowing, which TS
  // will not carry into the closures declared further down.
  const ctx: CanvasRenderingContext2D = maybeCtx;

  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  ctx.imageSmoothingEnabled = false;

  const stars = makeStars(90);
  const sun = makeSun();
  let particles: Particle[] = [];
  let emberTimer = 0;
  let lastTime = 0;
  let walkPhase = 0;

  function draw(s: GameState): void {
    const dt = Math.max(0, Math.min(0.1, s.time - lastTime));
    lastTime = s.time;

    const camX = s.runnerX - RUNNER_SCREEN_X;
    const running = s.phase === "running";

    // Leg cadence tracks actual speed, so the walk never looks like skating.
    if (running) walkPhase += (speedOf(s) / PLANK_W) * dt * 1.6;

    stepParticles(dt);
    if (running) {
      emberTimer -= dt;
      if (emberTimer <= 0) {
        emberTimer = 0.12;
        spawnEmber();
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Screen shake, quantised to whole pixels so the pixel grid stays honest.
    if (s.shake > 0.01) {
      const amp = s.shake * 4;
      ctx.translate(
        Math.round((Math.random() - 0.5) * amp),
        Math.round((Math.random() - 0.5) * amp),
      );
    }

    drawSky();
    drawStars(s.time);
    ctx.drawImage(sun, Math.round(SUN_X - SUN_R), Math.round(SUN_Y - SUN_R));
    drawGround(s, camX);
    drawParticles();
    drawBridge(s, camX);
    drawRunner(s);
    drawCooldown(s);
  }

  /* ------------------------------- sky ---------------------------------- */

  function drawSky(): void {
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = g;
    ctx.fillRect(-8, -8, VIEW_W + 16, HORIZON_Y + 8);
  }

  function drawStars(time: number): void {
    for (const star of stars) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.6 + star.phase));
      ctx.fillStyle = `rgba(255,255,255,${(twinkle * 0.5).toFixed(3)})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  /* ------------------------------ ground -------------------------------- */

  function drawGround(s: GameState, camX: number): void {
    ctx.fillStyle = GROUND;
    ctx.fillRect(-8, HORIZON_Y, VIEW_W + 16, VIEW_H - HORIZON_Y + 8);

    const depth = VIEW_H - HORIZON_Y;
    ctx.lineWidth = 1;

    // Receding horizontals. Squaring t bunches them up at the horizon.
    const phase = (s.time * (speedOf(s) / PLANK_W) * 0.5) % 1;
    for (let i = 0; i < GRID_ROWS; i += 1) {
      const t = ((i + phase) % GRID_ROWS) / GRID_ROWS;
      const y = HORIZON_Y + depth * t * t;
      ctx.strokeStyle = `rgba(255,46,151,${(0.08 + t * 0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(VIEW_W, y + 0.5);
      ctx.stroke();
    }

    // Verticals converging on the vanishing point, sliding with the camera.
    const slide = ((camX * 0.4) % GRID_COL_SPACING + GRID_COL_SPACING) % GRID_COL_SPACING;
    ctx.strokeStyle = "rgba(0,229,255,0.22)";
    for (let k = -6; k <= 6; k += 1) {
      const bottomX = VIEW_W / 2 + k * GRID_COL_SPACING - slide;
      ctx.beginPath();
      ctx.moveTo(VIEW_W / 2, HORIZON_Y);
      ctx.lineTo(bottomX, VIEW_H);
      ctx.stroke();
    }

    // Horizon glow line.
    ctx.strokeStyle = "rgba(255,209,102,0.55)";
    ctx.beginPath();
    ctx.moveTo(0, HORIZON_Y + 0.5);
    ctx.lineTo(VIEW_W, HORIZON_Y + 0.5);
    ctx.stroke();
  }

  /* ------------------------------ bridge -------------------------------- */

  function drawBridge(s: GameState, camX: number): void {
    // Launch platform. Deliberately shallow: filling it down to the bottom of
    // the frame blanks out the grid behind it and the whole scene goes flat.
    const padLeft = PLATFORM_START - camX;
    const padRight = 0 - camX;
    if (padRight > 0 && padLeft < VIEW_W) {
      const padW = padRight - padLeft;
      ctx.fillStyle = PLANK_SIDE;
      ctx.fillRect(padLeft, DECK_Y, padW, PLANK_H + 4);
      ctx.fillStyle = PLANK_FACE;
      ctx.fillRect(padLeft, DECK_Y, padW, 6);

      // Struts, fading downwards, so it reads as a pier rather than a wall.
      ctx.fillStyle = PLANK_SIDE;
      for (let x = Math.ceil(padLeft / 26) * 26; x < padRight; x += 26) {
        for (let seg = 0; seg < 5; seg += 1) {
          ctx.globalAlpha = 0.75 - seg * 0.15;
          ctx.fillRect(x, DECK_Y + PLANK_H + 4 + seg * 7, 3, 5);
        }
      }
      ctx.globalAlpha = 1;

      neonLine(padLeft, DECK_Y, padRight, DECK_Y, VIOLET, 6);
    }

    const first = Math.max(0, Math.floor(camX / PLANK_W) - 1);
    const last = Math.min(s.plankCount - 1, Math.ceil((camX + VIEW_W) / PLANK_W));
    const newest = s.plankCount - 1;

    for (let i = first; i <= last; i += 1) {
      const sx = i * PLANK_W - camX;

      // Newest plank slams down; it should feel like you built it.
      let dy = 0;
      if (i === newest) {
        const age = s.time - s.lastPlankAt;
        if (age >= 0 && age < 0.16) dy = -Math.round((1 - age / 0.16) ** 2 * 9);
      }

      // Planks dissolve as they leave to the left, which is what feeds the embers.
      const fade = sx < 56 ? Math.max(0, sx / 56) : 1;
      ctx.globalAlpha = 0.15 + fade * 0.85;

      ctx.fillStyle = PLANK_SIDE;
      ctx.fillRect(sx, DECK_Y + dy + 3, FACE_W, PLANK_H);
      ctx.fillStyle = PLANK_FACE;
      ctx.fillRect(sx, DECK_Y + dy, FACE_W, PLANK_H - 1);

      const edge = i === newest ? CYAN : VIOLET;
      neonLine(sx, DECK_Y + dy, sx + FACE_W, DECK_Y + dy, edge, i === newest ? 8 : 4);

      const digit = plankDigit(i);
      if (digit !== null) {
        drawDigit(
          ctx,
          digit,
          sx + DIGIT_OFFSET_X,
          DECK_Y + dy + DIGIT_OFFSET_Y,
          PLANK_DIGIT_SCALE,
          i === newest ? "#ffffff" : CYAN,
        );
      } else {
        // Free starting planks get a dash instead of a digit.
        ctx.fillStyle = "rgba(0,229,255,0.5)";
        ctx.fillRect(sx + DIGIT_OFFSET_X, DECK_Y + dy + Math.floor(PLANK_H / 2) - 1, glyphW, 2);
      }
      ctx.globalAlpha = 1;
    }

    // The cliff edge: a bright cap on the last plank so the drop is unmissable.
    const endX = bridgeEndX(s) - camX;
    if (endX > -4 && endX < VIEW_W + 4) {
      const urgent = gapAhead(s) <= 2 && s.phase === "running";
      const blink = urgent ? 0.5 + 0.5 * Math.sin(s.time * 18) : 1;
      neonLine(endX - 1, DECK_Y - 4, endX - 1, DECK_Y + PLANK_H + 3, urgent ? MAGENTA : AMBER, 10, blink);
    }
  }

  /* ------------------------------ runner -------------------------------- */

  function drawRunner(s: GameState): void {
    const frozen = s.phase === "running" && s.cooldown > 0;
    // Flash on impact only. A full second of strobing white is exhausting, and
    // it hides the rattled face that carries the rest of the penalty.
    const flash = frozen && s.cooldown > COOLDOWN_S - FLASH_S;
    const panic = s.phase === "running" && (gapAhead(s) <= 2 || frozen);
    const footX = RUNNER_SCREEN_X;
    const footY = DECK_Y + s.fallY;

    if (s.phase === "falling" || s.phase === "over") {
      ctx.save();
      ctx.translate(footX, footY - (CAPY_HEIGHT_PX * CAPY_SCALE) / 2);
      ctx.rotate(s.fallRot);
      drawCapy(ctx, 0, (CAPY_HEIGHT_PX * CAPY_SCALE) / 2, {
        scale: CAPY_SCALE,
        walk: 0,
        panic: false,
        falling: true,
        flash: false,
        time: s.time,
      });
      ctx.restore();
      return;
    }

    // Contact shadow, so the capybara is planted on the plank rather than near it.
    const shadowW = Math.round(CAPY_WIDTH_PX * CAPY_SCALE * 0.75);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(footX - shadowW / 2, DECK_Y + 1, shadowW, 2);

    drawCapy(ctx, footX, footY, {
      scale: CAPY_SCALE,
      walk: s.phase === "ready" ? 0 : walkPhase,
      panic,
      falling: false,
      flash,
      time: s.time,
    });
  }

  /* ------------------------------ penalty ------------------------------- */

  const BAR_W = 54;
  const BAR_H = 7;
  /** Parked just above the capybara's head, wherever the deck happens to be. */
  const BAR_Y = DECK_Y - CAPY_HEIGHT_PX * CAPY_SCALE - 16;
  const MISTAKE_DIGIT_SCALE = 3;
  /** How long the white impact flash lasts, of the total freeze. */
  const FLASH_S = 0.4;

  /**
   * The wrong digit, struck through, above a bar that drains over the freeze.
   * Drawn right above the capybara because that is where the player is already
   * looking — a HUD element at the edge of the frame would go unnoticed in the
   * one second it matters.
   */
  function drawCooldown(s: GameState): void {
    if (s.phase !== "running" || s.cooldown <= 0 || !s.lastMistake) return;

    const remaining = Math.max(0, Math.min(1, s.cooldown / COOLDOWN_S));
    const x = Math.round(RUNNER_SCREEN_X - BAR_W / 2);

    const digitW = DIGIT_W * MISTAKE_DIGIT_SCALE;
    const digitH = DIGIT_H * MISTAKE_DIGIT_SCALE;
    const digitX = Math.round(RUNNER_SCREEN_X - digitW / 2);
    const digitY = BAR_Y - digitH - 8;

    ctx.fillStyle = "rgba(8,3,16,0.8)";
    ctx.fillRect(digitX - 7, digitY - 4, digitW + 14, digitH + 8);
    drawDigit(ctx, s.lastMistake.typed, digitX, digitY, MISTAKE_DIGIT_SCALE, MAGENTA);
    // Struck through in white: a magenta line over a magenta digit erases it,
    // and the player needs to see *which* digit was rejected.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(digitX - 5, digitY + Math.floor(digitH / 2) - 1, digitW + 10, 2);

    ctx.fillStyle = "rgba(8,3,16,0.85)";
    ctx.fillRect(x - 1, BAR_Y - 1, BAR_W + 2, BAR_H + 2);
    ctx.fillStyle = MAGENTA;
    ctx.fillRect(x, BAR_Y, Math.round(BAR_W * remaining), BAR_H);

    ctx.save();
    ctx.strokeStyle = CYAN;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, BAR_Y - 0.5, BAR_W + 1, BAR_H + 1);
    ctx.restore();
  }

  /* ----------------------------- particles ------------------------------ */

  /** Embers shed by the planks dissolving off the left edge. Screen space. */
  function spawnEmber(): void {
    if (particles.length > 140) return;
    particles.push({
      x: 10,
      y: DECK_Y + 2 + Math.random() * PLANK_H,
      vx: -12 - Math.random() * 18,
      vy: 12 + Math.random() * 26,
      life: 0.9,
      maxLife: 0.9,
      color: Math.random() < 0.5 ? VIOLET : CYAN,
    });
  }

  function burst(screenX: number, y: number): void {
    for (let i = 0; i < 34; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110;
      particles.push({
        x: screenX + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
        color: [MAGENTA, CYAN, AMBER][i % 3] as string,
      });
    }
  }

  function stepParticles(dt: number): void {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 150 * dt;
    }
    if (particles.some((p) => p.life <= 0)) particles = particles.filter((p) => p.life > 0);
  }

  function drawParticles(): void {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------ helpers ------------------------------- */

  function neonLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    blur: number,
    alpha = 1,
  ): void {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 + 0.5, y1 + 0.5);
    ctx.lineTo(x2 + 0.5, y2 + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function makeStars(count: number): Star[] {
    const out: Star[] = [];
    for (let i = 0; i < count; i += 1) {
      out.push({
        x: Math.floor(Math.random() * VIEW_W),
        y: Math.floor(Math.random() * (HORIZON_Y - 20)),
        size: Math.random() < 0.15 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return out;
  }

  /**
   * The sun never changes, so it is rendered once into an offscreen canvas.
   * The scanline bars and the pi glyph are punched out with `destination-out`
   * rather than painted over, so the starfield shows through the cuts.
   */
  function makeSun(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = SUN_R * 2;
    c.height = SUN_R * 2;
    const g = c.getContext("2d");
    if (!g) return c;

    const grad = g.createLinearGradient(0, 0, 0, SUN_R * 2);
    grad.addColorStop(0, AMBER);
    grad.addColorStop(0.45, "#ff6b4a");
    grad.addColorStop(1, MAGENTA);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(SUN_R, SUN_R, SUN_R, 0, Math.PI * 2);
    g.fill();

    g.globalCompositeOperation = "destination-out";
    let y = SUN_R * 0.62;
    let h = 1;
    while (y < SUN_R * 2) {
      g.fillRect(0, y, SUN_R * 2, h);
      y += h + 3.4;
      h += 0.75;
    }

    const scale = 4;
    const glyphW = (PI_GLYPH[0] as string).length * scale;
    const glyphH = PI_GLYPH.length * scale;
    drawMatrix(g, PI_GLYPH, Math.round(SUN_R - glyphW / 2), Math.round(SUN_R - glyphH / 2) - 6, scale);
    g.globalCompositeOperation = "source-over";

    return c;
  }

  return {
    draw,
    burst(screenX: number, y: number): void {
      burst(screenX, y);
    },
    reset(): void {
      particles = [];
      walkPhase = 0;
      lastTime = 0;
      emberTimer = 0;
    },
  };
}

export { CAPY_SCALE, HORIZON_Y };
