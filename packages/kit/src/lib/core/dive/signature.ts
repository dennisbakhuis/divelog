/**
 * A buddy's signature or doodle: polylines of integer points in a fixed box, drawn by finger
 * on the sign page and rendered as one SVG path in `currentColor` wherever a note shows.
 */

/** The box every stroke lies in; the SVG `viewBox` is `0 0 1000 400`. */
export const SIGNATURE_BOX = { width: 1000, height: 400 } as const;

/** What one note may hold: strokes, points over all strokes, characters of comment. */
export const SIGNATURE_LIMITS = { strokes: 60, points: 4000, comment: 200 } as const;

/** One point, `[x, y]`. */
export type SignaturePoint = number[];

/** One stroke: the points of one touch, in drawing order. */
export type SignatureStroke = SignaturePoint[];

/** The `viewBox` attribute for the signature box. */
export const SIGNATURE_VIEWBOX = `0 0 ${SIGNATURE_BOX.width} ${SIGNATURE_BOX.height}`;

/** Whether `value` is an `[x, y]` pair of finite numbers. */
function drawable(value: unknown): value is SignaturePoint {
  return Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

/**
 * SVG path data for the strokes: `M x y L x y …` per stroke. A one-point stroke becomes a
 * zero-length segment, which a round line cap draws as a dot. The strokes may come from a
 * hand-edited file, so anything that is not a list of lists of finite `[x, y]` pairs is
 * skipped instead of throwing or writing `NaN` into the path.
 */
export function signaturePath(strokes: readonly SignatureStroke[] | null | undefined): string {
  if (!Array.isArray(strokes)) return '';
  return strokes
    .map((stroke) => (Array.isArray(stroke) ? stroke.filter(drawable) : []))
    .filter((points) => points.length > 0)
    .map((points) => {
      const [first, ...rest] = points.length === 1 ? [points[0], points[0]] : points;
      return [`M${first[0]} ${first[1]}`, ...rest.map((p) => `L${p[0]} ${p[1]}`)].join(' ');
    })
    .join(' ');
}

/** A point moved into the box and rounded to whole units. */
export function clampToBox(x: number, y: number): SignaturePoint {
  const fit = (value: number, max: number): number =>
    Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
  return [fit(x, SIGNATURE_BOX.width), fit(y, SIGNATURE_BOX.height)];
}

/**
 * Drop points closer than `minDistance` to the last kept one. The first and last points always
 * stay, so a stroke keeps its ends and a tap of two points stays a dot.
 */
export function simplifyStroke(
  points: readonly SignaturePoint[],
  minDistance = 2,
): SignatureStroke {
  if (points.length <= 2) return points.map((p) => [p[0], p[1]]);
  const kept: SignatureStroke = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1];
    const p = points[i];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDistance) kept.push([p[0], p[1]]);
  }
  const end = points[points.length - 1];
  const last = kept[kept.length - 1];
  if (kept.length > 1 && Math.hypot(end[0] - last[0], end[1] - last[1]) < minDistance) kept.pop();
  kept.push([end[0], end[1]]);
  return kept;
}

/** Points over all strokes. */
export function pointCount(strokes: readonly SignatureStroke[]): number {
  return strokes.reduce((sum, stroke) => sum + stroke.length, 0);
}

/** Whether every stroke is a list of `[x, y]` integer points inside the signature box. */
export function strokesWithinBox(strokes: unknown): strokes is SignatureStroke[] {
  if (!Array.isArray(strokes)) return false;
  return strokes.every(
    (stroke) =>
      Array.isArray(stroke) &&
      stroke.length > 0 &&
      stroke.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          inRange(p[0], SIGNATURE_BOX.width) &&
          inRange(p[1], SIGNATURE_BOX.height),
      ),
  );
}

function inRange(value: unknown, max: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

/** Whether the strokes stay within the note's stroke and point limits. */
export function strokesWithinLimits(strokes: readonly SignatureStroke[]): boolean {
  return (
    strokes.length <= SIGNATURE_LIMITS.strokes && pointCount(strokes) <= SIGNATURE_LIMITS.points
  );
}
