/**
 * The day scale behind the range slider under the globe: one line from the
 * first dive to today, with a handle at either end of the selected period.
 */
import type { DiveListItem } from './types.js';

const DAY = 86_400_000;

export function parseDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `Date.UTC` millis back to an ISO date. */
export function isoOfMillis(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10);
}

/** Today's date as the log writes it. */
export function today(now = new Date()): string {
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return isoOfMillis(local);
}

export type DayScale = {
  /** ISO date at the left end, normally the first dive. */
  start: string;
  /** ISO date at the right end, normally today. */
  end: string;
  /** Whole days from `start` to `end`, at least 1. */
  days: number;
  width: number;
  pad: number;
};

export function dayScale(start: string, end: string, width: number, pad = 12): DayScale {
  const days = Math.max(1, Math.round((parseDay(end) - parseDay(start)) / DAY));
  return { start, end, days, width: Math.max(width, 2 * pad + 1), pad };
}

/** Day index of an ISO date on the scale, clamped to its ends. */
export function dayOf(scale: DayScale, iso: string): number {
  const day = Math.round((parseDay(iso) - parseDay(scale.start)) / DAY);
  return Math.min(Math.max(day, 0), scale.days);
}

export function isoOfDay(scale: DayScale, day: number): string {
  const clamped = Math.min(Math.max(Math.round(day), 0), scale.days);
  return isoOfMillis(parseDay(scale.start) + clamped * DAY);
}

export function xOfDay(scale: DayScale, day: number): number {
  return scale.pad + (day / scale.days) * (scale.width - 2 * scale.pad);
}

export function xOfDate(scale: DayScale, iso: string): number {
  return xOfDay(scale, dayOf(scale, iso));
}

/** The nearest day to a pixel position, clamped to the scale. */
export function dayAtX(scale: DayScale, x: number): number {
  const inner = scale.width - 2 * scale.pad;
  const t = Math.min(Math.max((x - scale.pad) / inner, 0), 1);
  return Math.round(t * scale.days);
}

/** Pick the year-label spacing that keeps labels at least ~44 px apart. */
export function labelStep(pxPerYear: number): number {
  for (const step of [1, 2, 5, 10]) if (pxPerYear * step >= 44) return step;
  return 20;
}

export type YearTick = { year: number; x: number; labelled: boolean };

/** One tick per 1 January inside the scale; labelled ones are spaced out to stay readable. */
export function yearTicks(scale: DayScale): YearTick[] {
  const start = parseDay(scale.start);
  const end = parseDay(scale.end);
  const inner = scale.width - 2 * scale.pad;
  const step = labelStep(inner / Math.max((end - start) / (365.25 * DAY), 1));
  const ticks: YearTick[] = [];
  for (
    let year = new Date(start).getUTCFullYear() + 1;
    year <= new Date(end).getUTCFullYear();
    year += 1
  ) {
    const at = Date.UTC(year, 0, 1);
    if (at > end) break;
    ticks.push({ year, x: xOfDate(scale, `${year}-01-01`), labelled: year % step === 0 });
  }
  return ticks;
}

export type DateRange = { from: string | null; to: string | null };

/**
 * A slider position as the filter stores it: a handle resting on either end
 * of the scale means "no bound" there, so the whole line clears the range.
 */
export function rangeOfDays(scale: DayScale, fromDay: number, toDay: number): DateRange {
  const [lo, hi] = fromDay <= toDay ? [fromDay, toDay] : [toDay, fromDay];
  return {
    from: lo <= 0 ? null : isoOfDay(scale, lo),
    to: hi >= scale.days ? null : isoOfDay(scale, hi),
  };
}

/** The handle positions for a filter range; an open bound sits on the scale's end. */
export function daysOfRange(scale: DayScale, range: DateRange): [number, number] {
  return [
    range.from ? dayOf(scale, range.from) : 0,
    range.to ? dayOf(scale, range.to) : scale.days,
  ];
}

/** The first dive's date, for the left end of the scale; null for an empty log. */
export function firstDate(dives: DiveListItem[]): string | null {
  let first: string | null = null;
  for (const dive of dives) if (first === null || dive.date < first) first = dive.date;
  return first;
}

/** How many of the dives fall inside the range. */
export function countInRange(dives: DiveListItem[], range: DateRange): number {
  let n = 0;
  for (const dive of dives) {
    if (range.from !== null && dive.date < range.from) continue;
    if (range.to !== null && dive.date > range.to) continue;
    n += 1;
  }
  return n;
}
