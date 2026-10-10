import { describe, expect, it } from 'vitest';
import { compareKind, compareMaps, compareShapes, overlapSummary } from './overlap.js';
import { normalizeSiteMap, type MapPoint } from './sitemap.js';

function rect(x0: number, y0: number, x1: number, y1: number): MapPoint[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function mapWith(areas: { id: string; kind: string; points: MapPoint[] }[]) {
  return normalizeSiteMap({ kind: 'sitemap', areas });
}

describe('compareShapes', () => {
  it('scores an identical shape as a perfect match', () => {
    const r = compareShapes([rect(0, 0, 40, 40)], [rect(0, 0, 40, 40)], 1);
    expect(r.iou).toBeCloseTo(1, 5);
    expect(r.precision).toBeCloseTo(1, 5);
    expect(r.recall).toBeCloseTo(1, 5);
    expect(r.centroidOffset).toBeCloseTo(0, 5);
  });

  it('scores disjoint shapes as no match and measures the gap', () => {
    const r = compareShapes([rect(0, 0, 10, 10)], [rect(50, 0, 60, 10)], 1);
    expect(r.iou).toBe(0);
    expect(r.intersection).toBe(0);
    expect(r.centroidOffset).toBeCloseTo(50, 1);
  });

  it('halves the score when a shape covers half the reference', () => {
    const r = compareShapes([rect(0, 0, 20, 20)], [rect(0, 0, 20, 40)], 1);
    expect(r.recall).toBeCloseTo(0.5, 2);
    expect(r.precision).toBeCloseTo(1, 2);
    expect(r.iou).toBeCloseTo(0.5, 2);
  });

  it('measures area in square metres at the grid resolution', () => {
    const r = compareShapes([rect(0, 0, 30, 20)], [rect(0, 0, 30, 20)], 0.5);
    expect(r.drawn).toBeCloseTo(600, 0);
    expect(r.cell).toBe(0.5);
  });

  it('counts ground once when two drawn shapes overlap each other', () => {
    const r = compareShapes([rect(0, 0, 20, 20), rect(10, 0, 30, 20)], [rect(0, 0, 30, 20)], 1);
    expect(r.precision).toBeCloseTo(1, 2);
    expect(r.recall).toBeCloseTo(1, 2);
  });

  it('handles a concave shape without counting the notch', () => {
    const c: MapPoint[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];
    const r = compareShapes([c], [c], 0.5);
    expect(r.iou).toBeCloseTo(1, 5);
    expect(r.drawn).toBeCloseTo(700, 0);
  });

  it('survives an empty side', () => {
    const r = compareShapes([], [rect(0, 0, 10, 10)], 1);
    expect(r.iou).toBe(0);
    expect(r.drawn).toBe(0);
    expect(r.centroidOffset).toBe(0);
  });
});

describe('compareMaps', () => {
  const drawn = mapWith([
    { id: 'c1', kind: 'coral', points: rect(0, 0, 20, 20) },
    { id: 's1', kind: 'sand', points: rect(40, 0, 60, 20) },
  ]);
  const reference = mapWith([
    { id: 'c1', kind: 'coral', points: rect(2, 2, 22, 22) },
    { id: 's1', kind: 'sand', points: rect(100, 0, 120, 20) },
  ]);

  it('compares each kind against its own kind', () => {
    expect(compareKind(drawn, reference, 'coral').iou).toBeGreaterThan(0.6);
    expect(compareKind(drawn, reference, 'sand').iou).toBe(0);
  });

  it('lists the worst match first', () => {
    const entries = compareMaps(drawn, reference);
    expect(entries.map((e) => e.kind)).toEqual(['sand', 'coral']);
  });

  it('reports a kind only one map uses', () => {
    const entries = compareMaps(
      drawn,
      mapWith([{ id: 'w1', kind: 'wreck', points: rect(0, 0, 5, 5) }]),
    );
    expect(entries.map((e) => e.kind).sort()).toEqual(['coral', 'sand', 'wreck']);
  });

  it('summarises in one line per kind', () => {
    const text = overlapSummary(compareMaps(drawn, reference));
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('IoU');
    expect(text).toContain('centre off by');
  });
});
