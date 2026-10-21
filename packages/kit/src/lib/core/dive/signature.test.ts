import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_BOX,
  SIGNATURE_LIMITS,
  SIGNATURE_VIEWBOX,
  clampToBox,
  pointCount,
  signaturePath,
  simplifyStroke,
  strokesWithinBox,
  strokesWithinLimits,
} from './signature.js';

describe('signature box and limits', () => {
  it('is 1000 × 400 with the note limits of the dive format', () => {
    expect(SIGNATURE_BOX).toEqual({ width: 1000, height: 400 });
    expect(SIGNATURE_VIEWBOX).toBe('0 0 1000 400');
    expect(SIGNATURE_LIMITS).toEqual({ strokes: 60, points: 4000, comment: 200 });
  });
});

describe('signaturePath', () => {
  it('moves to the first point of each stroke and lines through the rest', () => {
    expect(
      signaturePath([
        [
          [12, 300],
          [18, 290],
          [30, 280],
        ],
        [
          [100, 50],
          [110, 60],
        ],
      ]),
    ).toBe('M12 300 L18 290 L30 280 M100 50 L110 60');
  });

  it('draws a one-point stroke as a dot and skips empty strokes', () => {
    expect(signaturePath([[[5, 6]], []])).toBe('M5 6 L5 6');
  });

  it('is empty for no strokes', () => {
    expect(signaturePath([])).toBe('');
    expect(signaturePath(null)).toBe('');
    expect(signaturePath(undefined)).toBe('');
  });
});

describe('clampToBox', () => {
  it('rounds and keeps the point inside the box', () => {
    expect(clampToBox(12.4, 300.6)).toEqual([12, 301]);
    expect(clampToBox(-20, 900)).toEqual([0, 400]);
    expect(clampToBox(1200, -1)).toEqual([1000, 0]);
    expect(clampToBox(Number.NaN, 10)).toEqual([0, 10]);
  });
});

describe('simplifyStroke', () => {
  it('drops points closer than the minimum distance to the last kept one', () => {
    expect(
      simplifyStroke([
        [0, 0],
        [1, 0],
        [3, 0],
        [4, 0],
        [10, 0],
      ]),
    ).toEqual([
      [0, 0],
      [3, 0],
      [10, 0],
    ]);
  });

  it('keeps the end of the stroke exactly where the finger lifted', () => {
    expect(
      simplifyStroke([
        [0, 0],
        [5, 0],
        [6, 0],
      ]),
    ).toEqual([
      [0, 0],
      [6, 0],
    ]);
  });

  it('takes the minimum distance as a parameter', () => {
    const line = [
      [0, 0],
      [3, 0],
      [6, 0],
      [9, 0],
    ];
    expect(simplifyStroke(line, 5)).toEqual([
      [0, 0],
      [9, 0],
    ]);
    expect(simplifyStroke(line, 1)).toEqual(line);
  });

  it('keeps a tap a two-point dot, even when it jittered', () => {
    expect(
      simplifyStroke([
        [7, 7],
        [7, 7],
      ]),
    ).toEqual([
      [7, 7],
      [7, 7],
    ]);
    expect(
      simplifyStroke([
        [7, 7],
        [7, 8],
        [8, 7],
        [7, 7],
      ]),
    ).toEqual([
      [7, 7],
      [7, 7],
    ]);
    expect(simplifyStroke([[7, 7]])).toEqual([[7, 7]]);
  });

  it('does not change the stroke it is given', () => {
    const stroke = [
      [0, 0],
      [1, 0],
      [9, 0],
    ];
    const copy = structuredClone(stroke);
    simplifyStroke(stroke)[0][0] = 99;
    expect(stroke).toEqual(copy);
  });
});

describe('strokesWithinBox', () => {
  it('accepts integer points inside the box, edges included', () => {
    expect(
      strokesWithinBox([
        [
          [0, 0],
          [1000, 400],
        ],
      ]),
    ).toBe(true);
    expect(strokesWithinBox([])).toBe(true);
  });

  it('refuses points outside the box, fractions and malformed strokes', () => {
    expect(strokesWithinBox([[[1001, 0]]])).toBe(false);
    expect(strokesWithinBox([[[0, 401]]])).toBe(false);
    expect(strokesWithinBox([[[-1, 0]]])).toBe(false);
    expect(strokesWithinBox([[[1.5, 0]]])).toBe(false);
    expect(strokesWithinBox([[[1, 2, 3]]])).toBe(false);
    expect(strokesWithinBox([[['1', 2]]])).toBe(false);
    expect(strokesWithinBox([[]])).toBe(false);
    expect(strokesWithinBox([[1, 2]])).toBe(false);
    expect(strokesWithinBox(null)).toBe(false);
  });
});

describe('strokesWithinLimits', () => {
  const dot = (): number[][] => [
    [1, 1],
    [1, 1],
  ];

  it('allows up to 60 strokes and 4000 points', () => {
    expect(strokesWithinLimits(Array.from({ length: 60 }, dot))).toBe(true);
    expect(strokesWithinLimits(Array.from({ length: 61 }, dot))).toBe(false);
    const long = Array.from({ length: 2000 }, (_, i) => [i % 1000, 1]);
    expect(pointCount([long, long])).toBe(4000);
    expect(strokesWithinLimits([long, long])).toBe(true);
    expect(strokesWithinLimits([long, long, [[1, 1]]])).toBe(false);
  });
});
