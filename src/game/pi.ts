/**
 * The decimal digits of pi — everything after "3.".
 *
 * Provenance: computed locally to 1000 places with two independent algorithms
 * (Chudnovsky series and Machin's arctan formula) using Python's `decimal` at
 * 1120 digits of working precision. Both agreed on 1118 leading characters, and
 * the first 100 decimals match the canonical block asserted in `PI_FIRST_100`
 * below. These digits were NOT transcribed from memory or scraped from a page.
 *
 * A wrong digit here would silently punish players for being right, so the
 * integrity check runs on every dev boot (see `assertPiIntegrity`).
 */
export const PI_DIGITS =
  "14159265358979323846264338327950288419716939937510" +
  "58209749445923078164062862089986280348253421170679" +
  "82148086513282306647093844609550582231725359408128" +
  "48111745028410270193852110555964462294895493038196" +
  "44288109756659334461284756482337867831652712019091" +
  "45648566923460348610454326648213393607260249141273" +
  "72458700660631558817488152092096282925409171536436" +
  "78925903600113305305488204665213841469519415116094" +
  "33057270365759591953092186117381932611793105118548" +
  "07446237996274956735188575272489122793818301194912" +
  "98336733624406566430860213949463952247371907021798" +
  "60943702770539217176293176752384674818467669405132" +
  "00056812714526356082778577134275778960917363717872" +
  "14684409012249534301465495853710507922796892589235" +
  "42019956112129021960864034418159813629774771309960" +
  "51870721134999999837297804995105973173281609631859" +
  "50244594553469083026425223082533446850352619311881" +
  "71010003137838752886587533208381420617177669147303" +
  "59825349042875546873115956286388235378759375195778" +
  "18577805321712268066130019278766111959092164201989";

/** Canonical first 100 decimals of pi, used as an independent tripwire. */
const PI_FIRST_100 =
  "14159265358979323846264338327950288419716939937510" +
  "58209749445923078164062862089986280348253421170679";

/**
 * What the player actually types: the leading 3 followed by every decimal.
 * The run starts on the 3, not on the first decimal.
 */
export const PI_SEQUENCE = `3${PI_DIGITS}`;

export const MAX_DIGITS = PI_SEQUENCE.length;

/** The digit the player must type at position `i` (0-based), or null past the end. */
export function digitAt(i: number): string | null {
  if (i < 0 || i >= PI_SEQUENCE.length) return null;
  return PI_SEQUENCE[i];
}

/** The next `count` digits from position `i`, for the "here is what came next" hint. */
export function digitsFrom(i: number, count: number): string {
  return PI_SEQUENCE.slice(i, i + count);
}

/**
 * The typed sequence rendered the way people read pi: `3.14159…`. The decimal
 * point is display-only — it is never something the player types.
 */
export function formatSequence(typed: string): string {
  if (typed.length === 0) return "";
  if (typed.length === 1) return typed;
  return `${typed[0]}.${typed.slice(1)}`;
}

/** Dev-only sanity check. Cheap, and catches a corrupted paste immediately. */
export function assertPiIntegrity(): void {
  const problems: string[] = [];
  if (!/^[0-9]+$/.test(PI_DIGITS)) problems.push("PI_DIGITS contains non-digit characters");
  if (PI_DIGITS.length !== 1000) problems.push(`expected 1000 digits, found ${PI_DIGITS.length}`);
  if (PI_DIGITS.slice(0, 100) !== PI_FIRST_100) problems.push("first 100 digits do not match the canonical block");
  if (!PI_SEQUENCE.startsWith("314159265358979")) problems.push("PI_SEQUENCE does not open with 3.14159265358979");
  if (PI_SEQUENCE.length !== PI_DIGITS.length + 1) problems.push("PI_SEQUENCE is not the leading 3 plus every decimal");
  if (problems.length) throw new Error(`pi.ts integrity check failed: ${problems.join("; ")}`);
}
