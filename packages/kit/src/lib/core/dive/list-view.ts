import type { DiveListItem, TripRef } from './types';
import type { NodeType, ObjectKind } from './sitemap';

const round = (n: number): number => Math.round(n * 10) / 10;

/** Shallow dives are not blown up to full height; below this depth the scale stays put. */
const SPARK_MIN_DEPTH_DM = 100;

/**
 * A filled depth profile as SVG path data in a `width` × `height` box, surface on top.
 * Depths are decimetres; the area closes along the surface line.
 */
export function profileArea(spark: number[], width: number, height: number): string {
  if (spark.length === 0) return '';
  const max = Math.max(SPARK_MIN_DEPTH_DM, ...spark);
  const series = [0, ...spark, 0];
  const step = width / (series.length - 1);
  const points = series.map(
    (d, i) => `${i === 0 ? 'M' : 'L'}${round(i * step)} ${round((d / max) * height)}`,
  );
  return `${points.join(' ')} Z`;
}

/** A bar length in percent of `max`, with a sliver left for anything above zero. */
export function barPercent(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(100, Math.max(2, round((value / max) * 100)));
}

export type ListScale = { depth: number; time: number };

export function listScale(dives: DiveListItem[]): ListScale {
  return {
    depth: Math.max(1, ...dives.map((d) => d.max_depth_m)),
    time: Math.max(1, ...dives.map((d) => d.duration_min)),
  };
}

/** `2026-02` for a dive date. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-02` → `February 2026`. */
export function monthLabel(key: string): string {
  return monthFormatter.format(new Date(`${key}-01T00:00:00Z`));
}

export type ListGroup = {
  key: string;
  label: string;
  count: number;
  dives: DiveListItem[];
  /** The trips the group's rows belong to, in list order. */
  trips: TripRef[];
};

function tripsOf(dives: DiveListItem[]): TripRef[] {
  const seen = new Map<string, TripRef>();
  for (const dive of dives)
    if (dive.trip && !seen.has(dive.trip.slug)) seen.set(dive.trip.slug, dive.trip);
  return [...seen.values()];
}

/**
 * Consecutive rows of `rows` that share a key, each headed by the number of dives with that
 * key across the whole list `all` (the rows may be only the first page of it).
 */
function groupBy(
  rows: DiveListItem[],
  all: DiveListItem[],
  keyOf: (dive: DiveListItem) => string,
  labelOf: (key: string) => string,
): ListGroup[] {
  const counts = new Map<string, number>();
  for (const dive of all) {
    const key = keyOf(dive);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const groups: ListGroup[] = [];
  for (const dive of rows) {
    const key = keyOf(dive);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.dives.push(dive);
    } else {
      groups.push({
        key,
        label: labelOf(key),
        count: counts.get(key) ?? 0,
        dives: [dive],
        trips: [],
      });
    }
  }
  for (const group of groups) group.trips = tripsOf(group.dives);
  return groups;
}

/** Rows grouped by month, e.g. `February 2026`, with the trips each month's rows are part of. */
export function groupByMonth(rows: DiveListItem[], all: DiveListItem[] = rows): ListGroup[] {
  return groupBy(rows, all, (d) => monthKey(d.date), monthLabel);
}

const DAY_MS = 86_400_000;

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Whole days from `start` to `date`, both `YYYY-MM-DD`, plus one: the start is day 1. */
export function dayOfTrip(date: string, start: string): number {
  const at = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Math.round((at(date) - at(start)) / DAY_MS) + 1;
}

/** `Day 3 · Sat 10 Feb 2026` for a date of a trip that started on `start`. */
export function dayLabel(date: string, start: string): string {
  const day = dayFormatter.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)).replace(',', '');
  return `Day ${dayOfTrip(date, start)} · ${day}`;
}

/** Rows grouped by calendar day, labelled by the day of a trip that started on `start`. */
export function groupByDay(
  rows: DiveListItem[],
  start: string,
  all: DiveListItem[] = rows,
): ListGroup[] {
  return groupBy(
    rows,
    all,
    (d) => d.date.slice(0, 10),
    (key) => dayLabel(key, start),
  );
}

/** Index of the first dive of `year` in list order, or -1. */
export function firstIndexOfYear(dives: DiveListItem[], year: number): number {
  const prefix = `${year}-`;
  return dives.findIndex((d) => d.date.startsWith(prefix));
}

/** The distinct years of a list, newest first. */
export function yearsOf(dives: DiveListItem[]): number[] {
  return [...new Set(dives.map((d) => Number(d.date.slice(0, 4))))].sort((a, b) => b - a);
}

export type Range = { min: number | null; max: number | null };
export type Bucket = Range & { label: string };

export const DEPTH_BUCKETS: Bucket[] = [
  { label: '0–10 m', min: null, max: 10 },
  { label: '10–20 m', min: 10, max: 20 },
  { label: '20–30 m', min: 20, max: 30 },
  { label: '30–40 m', min: 30, max: 40 },
  { label: '40 m +', min: 40, max: null },
];

export const DURATION_BUCKETS: Bucket[] = [
  { label: 'under 30 min', min: null, max: 30 },
  { label: '30–60 min', min: 30, max: 60 },
  { label: '60–120 min', min: 60, max: 120 },
  { label: '120 min +', min: 120, max: null },
];

/** A select value for a range: `10-20`, `-10`, `40-`, or '' for no range. */
export function rangeValue(range: Range): string {
  if (range.min === null && range.max === null) return '';
  return `${range.min ?? ''}-${range.max ?? ''}`;
}

export function parseRange(value: string): Range {
  const [lo = '', hi = ''] = value.split('-');
  const num = (s: string): number | null =>
    s === '' || !Number.isFinite(Number(s)) ? null : Number(s);
  return { min: num(lo), max: num(hi) };
}

/** The label of the bucket matching a range, or a plain `a–b` for a hand-made URL. */
export function rangeLabel(range: Range, buckets: Bucket[], unit: string): string {
  const bucket = buckets.find((b) => b.min === range.min && b.max === range.max);
  if (bucket) return bucket.label;
  return `${range.min ?? 0}–${range.max ?? '…'} ${unit}`;
}

/** The map pictogram that stands for a site type in a list row. */
export function siteGlyph(siteType: string | null | undefined): {
  type: NodeType;
  objectKind: ObjectKind | null;
} {
  switch (siteType) {
    case 'cave':
    case 'cavern':
    case 'mine':
      return { type: 'entrance', objectKind: null };
    case 'wreck':
    case 'reef with wrecks':
      return { type: 'wreck', objectKind: null };
    case 'lake':
    case 'reservoir':
      return { type: 'air', objectKind: null };
    case 'quarry':
    case 'quarry lake':
      return { type: 'platform', objectKind: null };
    case 'pool':
    case 'indoor dive tower':
      return { type: 'object', objectKind: 'ladder' };
    case 'sea':
      return { type: 'object', objectKind: 'boat' };
    default:
      return { type: 'marker', objectKind: null };
  }
}
