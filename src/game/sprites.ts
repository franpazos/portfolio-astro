/**
 * Pixel art, stored as character matrices rather than image files.
 *
 * Keeping the sprites in source means no extra HTTP requests, no binary assets
 * in the repo, and the palette can be tweaked without opening an editor. Legs
 * are drawn procedurally instead of as extra frames — one body matrix plus a
 * bit of trigonometry gives a smoother walk cycle than four hand-drawn frames.
 */

export type Matrix = readonly string[];

/**
 * Capybara, side view, facing right. 24 x 11 — legs are added procedurally.
 *
 * The silhouette is doing the identification work at this size, so the head is
 * a step taller than the barrel, the muzzle is blunt and square, and the ears
 * sit high and back. Drop any of those three and it reads as a duck.
 */
export const CAPY_BODY: Matrix = [
  "...............oo.oo....",
  "..............obboobbo..",
  ".......oooooooobbbbbbbo.",
  "...ooooohhhhhhhhhhhhhho.",
  "..ohhhhhhhhhhhhhhhhhhbbo",
  ".obbbbbbbbbbbbbbbbobbbbo",
  "obbbbbbbbbbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbbbbbbsbbo",
  "obbbbbbbbbbbbbbbbbbbbbbo",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  "..osssssssssssssssssso..",
];

/** The obligatory yuzu on the head. Six pixels of pure internet. */
export const ORANGE: Matrix = ["..gg.", ".nnn.", "nnnnn", ".nnn."];

/** Sweat bead, shown when the bridge is about to run out. */
export const SWEAT: Matrix = [".c.", "ccc", ".c."];

/** Pi, punched out of the synthwave sun. 11 x 11. */
export const PI_GLYPH: Matrix = [
  "...........",
  ".#########.",
  ".#########.",
  "..##...##..",
  "..##...##..",
  "..##...##..",
  "..##...##..",
  "..##...##..",
  ".##....##..",
  ".##....###.",
  "...........",
];

export const PALETTE: Record<string, string> = {
  o: "#2b1220", // outline
  b: "#c98a5b", // body
  h: "#e8b184", // rim light along the top
  s: "#8f5734", // belly shadow
  n: "#ff8c1a", // orange
  g: "#3ddc84", // leaf
  c: "#8be9ff", // sweat
  "#": "#ffffff", // glyph mask
};

/** Where the eye sits in `CAPY_BODY`, so it can blink without a second matrix. */
const EYE = { x: 18, y: 5 };
/** Column centres of the two visible legs. */
const LEGS = [5, 16];
/** Leg length in sprite pixels. */
const LEG_H = 4;

export function matrixWidth(m: Matrix): number {
  return m[0]?.length ?? 0;
}

/**
 * Guards against a mis-typed row silently shearing a sprite. Dev-only: a
 * ragged matrix is a source bug, not a runtime condition worth handling.
 */
export function assertSpritesWellFormed(): void {
  const check = (name: string, m: Matrix): void => {
    const w = matrixWidth(m);
    m.forEach((row, y) => {
      if (row.length !== w) throw new Error(`${name} row ${y} is ${row.length} wide, expected ${w}`);
      for (const ch of row) {
        if (ch !== "." && !(ch in PALETTE)) throw new Error(`${name} row ${y} uses unknown pixel "${ch}"`);
      }
    });
  };
  check("CAPY_BODY", CAPY_BODY);
  check("ORANGE", ORANGE);
  check("SWEAT", SWEAT);
  check("PI_GLYPH", PI_GLYPH);
}

/** Blit a matrix at integer coordinates. `override` recolours every lit pixel. */
export function drawMatrix(
  ctx: CanvasRenderingContext2D,
  m: Matrix,
  x: number,
  y: number,
  scale: number,
  override?: string,
): void {
  for (let row = 0; row < m.length; row += 1) {
    const line = m[row] as string;
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col] as string;
      if (ch === ".") continue;
      ctx.fillStyle = override ?? PALETTE[ch] ?? "#ff00ff";
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

export interface CapyOptions {
  scale: number;
  /** Monotonic walk phase in cycles; fractional part drives the gait. */
  walk: number;
  panic: boolean;
  falling: boolean;
  /** Impact flash right after a wrong digit — a flat white silhouette. */
  flash: boolean;
  /** Seconds, used only for the blink and stun-flash timers. */
  time: number;
}

const CAPY_W = matrixWidth(CAPY_BODY);
const CAPY_H = CAPY_BODY.length;

export const CAPY_WIDTH_PX = CAPY_W;
export const CAPY_HEIGHT_PX = CAPY_H + LEG_H; // body + legs

/**
 * Draw the capybara with its feet at (`footX`, `footY`), i.e. the point where
 * it meets the deck, so callers never juggle sprite dimensions.
 */
export function drawCapy(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  opts: CapyOptions,
): void {
  const { scale: k, walk, panic, falling } = opts;
  const cycle = walk * Math.PI * 2;
  // Classic hit-flash: alternate frames drawn as a flat silhouette.
  const flash = opts.flash && Math.floor(opts.time * 12) % 2 === 0 ? "#ffffff" : null;

  const originX = Math.round(footX - (CAPY_W * k) / 2);
  // Feet rest exactly on the contact point: the body hangs a leg-length above it.
  const baseY = Math.round(footY - (CAPY_H + LEG_H) * k);
  // A 1px vertical bob at twice the leg cadence. Applied to the body only —
  // bobbing the legs too makes a planted foot hover, which reads as floating.
  const bob = falling ? 0 : -Math.round(Math.max(0, Math.sin(cycle * 2)));
  const originY = baseY + bob * k;

  // Legs first so the body overlaps their tops. They start one pixel high so
  // the join stays hidden while the body bobs.
  LEGS.forEach((col, i) => {
    const legCycle = cycle + i * Math.PI;
    const lift = falling ? 0 : Math.round(Math.max(0, Math.sin(legCycle)) * 2);
    const swing = falling ? (i === 0 ? -3 : 3) : Math.round(Math.cos(legCycle) * 1.5);
    const lx = originX + (col + swing) * k;
    const ly = baseY + (CAPY_H - 1) * k;
    const h = LEG_H + 1 - lift;
    if (h <= 0) return;
    ctx.fillStyle = flash ?? (PALETTE.o as string);
    ctx.fillRect(lx - k, ly, 5 * k, h * k);
    ctx.fillStyle = flash ?? (PALETTE.s as string);
    ctx.fillRect(lx, ly, 3 * k, Math.max(1, h - 1) * k);
  });

  drawMatrix(ctx, CAPY_BODY, originX, originY, k, flash ?? undefined);

  // The orange rides on the back, resting against the shoulder line.
  drawMatrix(ctx, ORANGE, originX + 6 * k, originY - k, k, flash ?? undefined);

  // The flash frame is a flat silhouette: no eye, no sweat bead on top of it.
  if (flash) return;

  // Blink: a two-frame closed eye every few seconds. Never blink while falling.
  const blinking = !falling && Math.sin(opts.time * 1.7) > 0.985;
  if (blinking) {
    ctx.fillStyle = PALETTE.b as string;
    ctx.fillRect(originX + EYE.x * k, originY + EYE.y * k, k, k);
    ctx.fillStyle = PALETTE.o as string;
    ctx.fillRect(originX + EYE.x * k, originY + (EYE.y + 1) * k, k, k);
  }

  if (panic && !falling) {
    // Wide eye plus a bead of sweat: the only tell that you are about to die.
    ctx.fillStyle = "#fff4e6";
    ctx.fillRect(originX + (EYE.x - 1) * k, originY + (EYE.y - 1) * k, 3 * k, 3 * k);
    ctx.fillStyle = PALETTE.o as string;
    ctx.fillRect(originX + EYE.x * k, originY + EYE.y * k, k, k);
    const jitter = Math.round(Math.sin(opts.time * 22)) * k;
    drawMatrix(ctx, SWEAT, originX + (CAPY_W - 3) * k + jitter, originY - 2 * k, k);
  }
}

/**
 * A 3x5 pixel font for the digits stamped onto each plank. Canvas `fillText`
 * at this size turns to mush once the canvas is scaled up, so the digits are
 * pixels like everything else.
 */
export const DIGIT_FONT: readonly Matrix[] = [
  ["###", "#.#", "#.#", "#.#", "###"], // 0
  [".#.", "##.", ".#.", ".#.", "###"], // 1
  ["###", "..#", "###", "#..", "###"], // 2
  ["###", "..#", "###", "..#", "###"], // 3
  ["#.#", "#.#", "###", "..#", "..#"], // 4
  ["###", "#..", "###", "..#", "###"], // 5
  ["###", "#..", "###", "#.#", "###"], // 6
  ["###", "..#", "..#", "..#", "..#"], // 7
  ["###", "#.#", "###", "#.#", "###"], // 8
  ["###", "#.#", "###", "..#", "###"], // 9
];

export const DIGIT_W = 3;
export const DIGIT_H = 5;

/** Draw a single digit character in `color`. Unknown characters are skipped. */
export function drawDigit(
  ctx: CanvasRenderingContext2D,
  digit: string,
  x: number,
  y: number,
  scale: number,
  color: string,
): void {
  const value = Number.parseInt(digit, 10);
  const glyph = DIGIT_FONT[value];
  if (!glyph) return;
  drawMatrix(ctx, glyph, x, y, scale, color);
}
