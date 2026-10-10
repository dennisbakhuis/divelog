import type { DiveTimeline, YearCount } from './types';

export type { DiveTimeline, YearCount };

export type Sparkline = {
  line: string;
  area: string;
  last: { x: number; y: number } | null;
  peak: YearCount | null;
};

const round = (n: number): number => Math.round(n * 10) / 10;

/**
 * Lay out a per-year series as SVG path data inside a `width` × `height` box.
 * The baseline sits on the bottom edge; `pad` keeps the stroke off the edges.
 */
export function sparkline(values: YearCount[], width: number, height: number, pad = 2): Sparkline {
  if (values.length === 0) return { line: '', area: '', last: null, peak: null };
  const max = Math.max(1, ...values.map((v) => v.dives));
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const x = (i: number): number => round(values.length > 1 ? pad + i * step : width / 2);
  const y = (v: number): number => round(height - pad - (v / max) * (height - pad * 2));
  const points = values.map((v, i) => ({ x: x(i), y: y(v.dives) }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const first = points[0];
  const lastPoint = points[points.length - 1];
  const area = `${line} L${lastPoint.x} ${height} L${first.x} ${height} Z`;
  const peak = values.reduce((best, v) => (v.dives > best.dives ? v : best), values[0]);
  return { line, area, last: lastPoint, peak };
}

/** Whether the timeline's latest public dive is the one the summary reports. */
export function latestMatches(timeline: DiveTimeline | null, lastDive: string | null): boolean {
  return Boolean(timeline?.latest && lastDive && timeline.latest.date === lastDive);
}
