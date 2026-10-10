/**
 * A 2-D affine view transform for the site map, in SVG matrix form:
 * x' = a·x + c·y + e, y' = b·x + d·y + f. Only rotations, uniform scales and
 * translations are ever composed, so the scale and angle can be read back.
 */
export type View = { a: number; b: number; c: number; d: number; e: number; f: number };
export type Point = { x: number; y: number };

export const IDENTITY: View = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 40;

/** m ∘ n: apply n first, then m. */
export function multiply(m: View, n: View): View {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function apply(m: View, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function invert(m: View): View {
  const det = m.a * m.d - m.b * m.c;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function zoomOf(m: View): number {
  return Math.hypot(m.a, m.b);
}

/** Rotation in degrees, clockwise on screen. */
export function angleOf(m: View): number {
  return (Math.atan2(m.b, m.a) * 180) / Math.PI;
}

export function isIdentity(m: View): boolean {
  return (
    Math.abs(m.a - 1) < 1e-9 &&
    Math.abs(m.b) < 1e-9 &&
    Math.abs(m.c) < 1e-9 &&
    Math.abs(m.d - 1) < 1e-9 &&
    Math.abs(m.e) < 1e-9 &&
    Math.abs(m.f) < 1e-9
  );
}

function translation(dx: number, dy: number): View {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

export function pan(m: View, dx: number, dy: number): View {
  return multiply(translation(dx, dy), m);
}

/** Scale by `factor` about the fixed point `p`, keeping the zoom within bounds. */
export function zoomAt(m: View, p: Point, factor: number): View {
  const current = zoomOf(m);
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor)) / current;
  if (Math.abs(clamped - 1) < 1e-9) return m;
  const s: View = { a: clamped, b: 0, c: 0, d: clamped, e: 0, f: 0 };
  return multiply(translation(p.x, p.y), multiply(s, multiply(translation(-p.x, -p.y), m)));
}

/** Rotate by `degrees` (clockwise on screen) about the fixed point `p`. */
export function rotateAt(m: View, p: Point, degrees: number): View {
  const rad = (degrees * Math.PI) / 180;
  const r: View = {
    a: Math.cos(rad),
    b: Math.sin(rad),
    c: -Math.sin(rad),
    d: Math.cos(rad),
    e: 0,
    f: 0,
  };
  return multiply(translation(p.x, p.y), multiply(r, multiply(translation(-p.x, -p.y), m)));
}

export function toSvgTransform(m: View): string {
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
}

/** Axis-aligned bounds of a rectangle after the inverse view: what the viewport shows in map units. */
export function visibleBox(
  m: View,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): { minX: number; minY: number; maxX: number; maxY: number } {
  const inv = invert(m);
  const corners = [
    apply(inv, { x: box.minX, y: box.minY }),
    apply(inv, { x: box.maxX, y: box.minY }),
    apply(inv, { x: box.minX, y: box.maxY }),
    apply(inv, { x: box.maxX, y: box.maxY }),
  ];
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

/** The pan, zoom and rotation that carry one pair of touch points onto another. */
export function pinch(m: View, from: [Point, Point], to: [Point, Point]): View {
  const c0 = { x: (from[0].x + from[1].x) / 2, y: (from[0].y + from[1].y) / 2 };
  const c1 = { x: (to[0].x + to[1].x) / 2, y: (to[0].y + to[1].y) / 2 };
  const d0 = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y);
  const d1 = Math.hypot(to[1].x - to[0].x, to[1].y - to[0].y);
  const a0 = Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x);
  const a1 = Math.atan2(to[1].y - to[0].y, to[1].x - to[0].x);
  let next = pan(m, c1.x - c0.x, c1.y - c0.y);
  if (d0 > 0) next = zoomAt(next, c1, d1 / d0);
  return rotateAt(next, c1, ((a1 - a0) * 180) / Math.PI);
}
