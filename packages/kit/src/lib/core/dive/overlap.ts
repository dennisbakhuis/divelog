/**
 * Comparing one drawing against another: how much of a site map's coral, sand
 * or depth band lands where a reference says it should.
 *
 * Areas are arbitrary polygons that may be concave or touch themselves, so the
 * comparison is done on a raster rather than with a polygon boolean: both sets
 * are stamped onto a grid of square cells and the cells are counted. A cell is
 * counted when its centre falls inside an odd number of polygon crossings, so
 * overlapping shapes of the same kind count once, not twice.
 */

import type { AreaKind, Box, MapArea, MapPoint, SiteMap } from './sitemap';

export type OverlapResult = {
  /** Grid resolution the comparison ran at, in metres. */
  cell: number;
  /** Square metres covered by the drawing, by the reference, and by both. */
  drawn: number;
  reference: number;
  intersection: number;
  union: number;
  /** Intersection over union: 1 is a perfect match, 0 no shared ground. */
  iou: number;
  /** Share of the drawing that lands on the reference, and the reverse. */
  precision: number;
  recall: number;
  /** Distance between the two centres of mass, in metres. */
  centroidOffset: number;
};

export type KindOverlap = { kind: AreaKind; result: OverlapResult };

const MIN_CELL = 0.25;
const MAX_CELL = 5;
const TARGET_CELLS = 360;

/** Ray casting, counting a crossing on the upward edge only. */
function inPolygon(x: number, y: number, points: MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function boundsOf(groups: MapPoint[][], pad = 0): Box {
  const points = groups.flat();
  if (points.length === 0) return { minX: -pad, minY: -pad, maxX: pad, maxY: pad };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad,
    maxY: Math.max(...ys) + pad,
  };
}

/** A cell size that keeps the grid around TARGET_CELLS on its longest side. */
export function cellFor(box: Box): number {
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const raw = span / TARGET_CELLS;
  return Math.min(MAX_CELL, Math.max(MIN_CELL, raw));
}

function mask(
  groups: MapPoint[][],
  box: Box,
  cell: number,
  cols: number,
  rows: number,
): Uint8Array {
  const grid = new Uint8Array(cols * rows);
  for (const points of groups) {
    if (points.length < 3) continue;
    const local = boundsOf([points]);
    const c0 = Math.max(0, Math.floor((local.minX - box.minX) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((local.maxX - box.minX) / cell));
    const r0 = Math.max(0, Math.floor((local.minY - box.minY) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((local.maxY - box.minY) / cell));
    for (let r = r0; r <= r1; r++) {
      const y = box.minY + (r + 0.5) * cell;
      for (let c = c0; c <= c1; c++) {
        const index = r * cols + c;
        if (grid[index]) continue;
        if (inPolygon(box.minX + (c + 0.5) * cell, y, points)) grid[index] = 1;
      }
    }
  }
  return grid;
}

/** Overlap between two sets of polygons, in the same coordinate frame. */
export function compareShapes(
  drawn: MapPoint[][],
  reference: MapPoint[][],
  cell?: number,
): OverlapResult {
  const box = boundsOf([...drawn, ...reference], 2);
  const size = cell ?? cellFor(box);
  const cols = Math.max(1, Math.ceil((box.maxX - box.minX) / size));
  const rows = Math.max(1, Math.ceil((box.maxY - box.minY) / size));
  const a = mask(drawn, box, size, cols, rows);
  const b = mask(reference, box, size, cols, rows);

  const unit = size * size;
  let countA = 0;
  let countB = 0;
  let both = 0;
  let sumAx = 0;
  let sumAy = 0;
  let sumBx = 0;
  let sumBy = 0;
  for (let r = 0; r < rows; r++) {
    const y = box.minY + (r + 0.5) * size;
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const x = box.minX + (c + 0.5) * size;
      if (a[index]) {
        countA++;
        sumAx += x;
        sumAy += y;
      }
      if (b[index]) {
        countB++;
        sumBx += x;
        sumBy += y;
      }
      if (a[index] && b[index]) both++;
    }
  }

  const union = countA + countB - both;
  const offset =
    countA && countB
      ? Math.hypot(sumAx / countA - sumBx / countB, sumAy / countA - sumBy / countB)
      : 0;
  return {
    cell: size,
    drawn: countA * unit,
    reference: countB * unit,
    intersection: both * unit,
    union: union * unit,
    iou: union ? both / union : 0,
    precision: countA ? both / countA : 0,
    recall: countB ? both / countB : 0,
    centroidOffset: offset,
  };
}

function shapesOf(areas: MapArea[], kind?: AreaKind): MapPoint[][] {
  return areas.filter((a) => !kind || a.kind === kind).map((a) => a.points);
}

/** Overlap for one kind of area — coral against coral, sand against sand. */
export function compareKind(drawn: SiteMap, reference: SiteMap, kind: AreaKind): OverlapResult {
  return compareShapes(shapesOf(drawn.areas, kind), shapesOf(reference.areas, kind));
}

/**
 * Every area kind either map uses, worst match first, so the shape most worth
 * fixing is the one at the top of the list.
 */
export function compareMaps(drawn: SiteMap, reference: SiteMap): KindOverlap[] {
  const kinds = new Set<AreaKind>([
    ...drawn.areas.map((a) => a.kind),
    ...reference.areas.map((a) => a.kind),
  ]);
  return [...kinds]
    .map((kind) => ({ kind, result: compareKind(drawn, reference, kind) }))
    .sort((a, b) => a.result.iou - b.result.iou);
}

/** One line per kind, for a report or a commit message. */
export function overlapSummary(entries: KindOverlap[]): string {
  return entries
    .map(
      ({ kind, result }) =>
        `${kind}: IoU ${(result.iou * 100).toFixed(0)}% · ` +
        `covers ${(result.recall * 100).toFixed(0)}% · ` +
        `centre off by ${result.centroidOffset.toFixed(1)} m`,
    )
    .join('\n');
}
