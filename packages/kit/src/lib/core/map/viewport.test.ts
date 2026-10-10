import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  MAX_ZOOM,
  MIN_ZOOM,
  angleOf,
  apply,
  invert,
  isIdentity,
  pan,
  pinch,
  rotateAt,
  visibleBox,
  zoomAt,
  zoomOf,
} from './viewport';

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('viewport', () => {
  it('zooms about a fixed point', () => {
    const v = zoomAt(IDENTITY, { x: 10, y: 20 }, 2);
    close(apply(v, { x: 10, y: 20 }), 10, 20);
    close(apply(v, { x: 11, y: 20 }), 12, 20);
    expect(zoomOf(v)).toBeCloseTo(2);
  });

  it('clamps the zoom range', () => {
    expect(zoomOf(zoomAt(IDENTITY, { x: 0, y: 0 }, 1000))).toBeCloseTo(MAX_ZOOM);
    expect(zoomOf(zoomAt(IDENTITY, { x: 0, y: 0 }, 0.001))).toBeCloseTo(MIN_ZOOM);
  });

  it('rotates clockwise about a fixed point and reports the angle', () => {
    const v = rotateAt(IDENTITY, { x: 0, y: 0 }, 90);
    close(apply(v, { x: 1, y: 0 }), 0, 1);
    expect(angleOf(v)).toBeCloseTo(90);
    const back = rotateAt(v, { x: 0, y: 0 }, -90);
    expect(isIdentity(back)).toBe(true);
  });

  it('pans and inverts', () => {
    const v = pan(zoomAt(IDENTITY, { x: 0, y: 0 }, 3), 5, -7);
    const p = apply(v, { x: 2, y: 2 });
    close(apply(invert(v), p), 2, 2);
  });

  it('reports the visible box of a zoomed, panned view', () => {
    const v = pan(zoomAt(IDENTITY, { x: 0, y: 0 }, 2), 10, 0);
    const box = visibleBox(v, { minX: 0, minY: 0, maxX: 100, maxY: 50 });
    expect(box).toEqual({ minX: -5, minY: 0, maxX: 45, maxY: 25 });
  });

  it('follows two fingers: their midpoint, spread and angle', () => {
    const from: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const to: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 20, y: 20 },
      { x: 20, y: 40 },
    ];
    const v = pinch(IDENTITY, from, to);
    expect(zoomOf(v)).toBeCloseTo(2);
    expect(angleOf(v)).toBeCloseTo(90);
    close(apply(v, { x: 5, y: 0 }), 20, 30);
  });
});
