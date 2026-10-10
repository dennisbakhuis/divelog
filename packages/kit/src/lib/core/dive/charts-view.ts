/**
 * The tallies behind the "Numbers" cards. Every card shows the whole log as a
 * faint ghost with the current selection drawn solid over it, and clicking a
 * bar narrows the selection, so each helper takes both lists and the toggles
 * return the next filter.
 */
import type { DiveFilter } from './filter.js';
import type { StatTile } from './stats-view.js';
import { formatDate, formatDateRange, pluralize } from './format.js';
import { parseDay } from './timeline.js';

/** The list fields the charts read; `DiveListItem` satisfies it. */
export type ChartDive = {
  number: number;
  date: string;
  duration_min: number;
  max_depth_m: number;
  water_temp_c: number | null;
  tags: string[];
  site: { slug: string; name: string; country_code: string; country_name: string } | null;
  buddies: { slug: string; name: string }[];
  trip?: { slug: string } | null;
};

export type Band = {
  label: string;
  /** Null at the open ends, which is how the filter chips spell the same ranges. */
  min: number | null;
  max: number | null;
  total: number;
  selected: number;
};

export const DEPTH_EDGES = [0, 10, 20, 30, 40, 60];
export const DURATION_EDGES = [0, 30, 45, 60, 90, 120];

function tally(dives: ChartDive[], edges: number[], value: (d: ChartDive) => number): number[] {
  const counts = edges.map(() => 0);
  for (const dive of dives) {
    const i = edges.findLastIndex((edge) => value(dive) >= edge);
    counts[Math.max(i, 0)] += 1;
  }
  return counts;
}

/** Half-open bands over a measure, the last one open-ended; empty bands are left out. */
export function bands(
  all: ChartDive[],
  selected: ChartDive[],
  edges: number[],
  value: (d: ChartDive) => number,
): Band[] {
  const totals = tally(all, edges, value);
  const picked = tally(selected, edges, value);
  return edges
    .map((from, i) => {
      const last = i === edges.length - 1;
      return {
        label: last ? `${from}+` : `${from}–${edges[i + 1]}`,
        min: i === 0 ? null : from,
        max: last ? null : edges[i + 1],
        total: totals[i],
        selected: picked[i],
      };
    })
    .filter((band) => band.total > 0);
}

export type YearBar = {
  year: number;
  total: number;
  selected: number;
  minutes: number;
  selectedMinutes: number;
};

/** One bar per calendar year from the first dive to the last, gaps included. */
export function yearBars(all: ChartDive[], selected: ChartDive[]): YearBar[] {
  if (!all.length) return [];
  const years = all.map((d) => Number(d.date.slice(0, 4)));
  const first = Math.min(...years);
  const last = Math.max(...years);
  const rows = new Map<number, YearBar>();
  for (let year = first; year <= last; year++) {
    rows.set(year, { year, total: 0, selected: 0, minutes: 0, selectedMinutes: 0 });
  }
  for (const dive of all) {
    const row = rows.get(Number(dive.date.slice(0, 4)))!;
    row.total += 1;
    row.minutes += dive.duration_min;
  }
  for (const dive of selected) {
    const row = rows.get(Number(dive.date.slice(0, 4)));
    if (!row) continue;
    row.selected += 1;
    row.selectedMinutes += dive.duration_min;
  }
  return [...rows.values()];
}

export type CumPoint = {
  year: number;
  hours: number;
  selectedHours: number;
  dives: number;
  selectedDives: number;
};

/** Running hours at the end of each year, for the whole log and the selection. */
export function cumulativeHours(years: YearBar[]): CumPoint[] {
  let minutes = 0;
  let selectedMinutes = 0;
  return years.map((y) => {
    minutes += y.minutes;
    selectedMinutes += y.selectedMinutes;
    return {
      year: y.year,
      hours: minutes / 60,
      selectedHours: selectedMinutes / 60,
      dives: y.total,
      selectedDives: y.selected,
    };
  });
}

const GRID_STEPS = [10, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** Horizontal gridlines under a cumulative curve: at most four, on round hours. */
export function gridLines(max: number): number[] {
  if (max <= 0) return [];
  const step = GRID_STEPS.find((s) => max / s <= 4) ?? GRID_STEPS[GRID_STEPS.length - 1];
  const lines: number[] = [];
  for (let h = step; h < max; h += step) lines.push(h);
  return lines;
}

/** Which years get a label on a year axis: the ends plus round steps between. */
export function axisYears(years: number[], maxLabels = 6): number[] {
  if (!years.length) return [];
  const first = years[0];
  const last = years[years.length - 1];
  for (const step of [1, 2, 5, 10, 20, 50]) {
    const ticks = new Set<number>([first, last]);
    for (let y = Math.ceil(first / step) * step; y < last; y += step) {
      if (y - first >= step / 2 && last - y >= step / 2) ticks.add(y);
    }
    if (ticks.size <= maxLabels) return [...ticks].sort((a, b) => a - b);
  }
  return [first, last];
}

/** A straight-line path through points, and the same closed down to the baseline. */
export function linePath(
  points: { x: number; y: number }[],
  baseline: number,
): {
  line: string;
  area: string;
} {
  if (!points.length) return { line: '', area: '' };
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  return {
    line,
    area: `${line} L${last.x.toFixed(1)} ${baseline} L${first.x.toFixed(1)} ${baseline} Z`,
  };
}

export type Row = { slug: string; name: string; total: number; selected: number };

/** The most frequent values of a dive attribute, ranked by the selection first. */
export function countRows(
  all: ChartDive[],
  selected: ChartDive[],
  pick: (dive: ChartDive) => { slug: string; name: string }[],
  n: number,
): Row[] {
  const rows = new Map<string, Row>();
  for (const dive of all) {
    for (const item of pick(dive)) {
      const row = rows.get(item.slug) ?? {
        slug: item.slug,
        name: item.name,
        total: 0,
        selected: 0,
      };
      row.total += 1;
      rows.set(item.slug, row);
    }
  }
  for (const dive of selected) {
    for (const item of pick(dive)) {
      const row = rows.get(item.slug);
      if (row) row.selected += 1;
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.selected - a.selected || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, n);
}

export type TagRow = Row & { tag: string };

/** The tags of a log with their counts, most used first. */
export function tagRows(all: ChartDive[], selected: ChartDive[], n: number): TagRow[] {
  return countRows(all, selected, (d) => d.tags.map((t) => ({ slug: t, name: t })), n).map(
    (row) => ({ ...row, tag: row.slug }),
  );
}

export type CountryWater = {
  code: string;
  name: string;
  min: number;
  median: number;
  max: number;
  /** Dives in the country with a water temperature, overall and in the selection. */
  dives: number;
  selected: number;
};

/** Fewer readings than this and a country has no temperature row. */
export const MIN_WATER_READINGS = 3;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Water temperature per country, coldest first; the `n` most dived countries only. */
export function waterByCountry(all: ChartDive[], selected: ChartDive[], n = 8): CountryWater[] {
  const temps = new Map<string, { name: string; temps: number[]; selected: number }>();
  for (const dive of all) {
    if (!dive.site || dive.water_temp_c === null) continue;
    const row = temps.get(dive.site.country_code) ?? {
      name: dive.site.country_name,
      temps: [],
      selected: 0,
    };
    row.temps.push(dive.water_temp_c);
    temps.set(dive.site.country_code, row);
  }
  for (const dive of selected) {
    if (!dive.site || dive.water_temp_c === null) continue;
    const row = temps.get(dive.site.country_code);
    if (row) row.selected += 1;
  }
  return [...temps]
    .filter(([, row]) => row.temps.length >= MIN_WATER_READINGS)
    .sort((a, b) => b[1].temps.length - a[1].temps.length)
    .slice(0, n)
    .map(([code, row]) => ({
      code,
      name: row.name,
      min: Math.min(...row.temps),
      median: median(row.temps)!,
      max: Math.max(...row.temps),
      dives: row.temps.length,
      selected: row.selected,
    }))
    .sort((a, b) => a.median - b.median || a.name.localeCompare(b.name));
}

/** A colour for a water temperature: cold blue through to a warm amber. */
export function tempColour(celsius: number): string {
  const k = Math.min(1, Math.max(0, (celsius - 4) / 24));
  return `hsl(${Math.round(205 - 170 * k)} 72% ${Math.round(60 + 6 * k)}%)`;
}

const DAY_MS = 86_400_000;

function hours(minutes: number): string {
  return `${Math.round(minutes / 60)} h`;
}

/** A stretch of days in the unit it reads best in: days, months past two, years past two. */
export function spanLabel(days: number): string {
  if (days < 60) return pluralize(days, 'day');
  if (days < 730) return pluralize(Math.round(days / 30.44), 'month');
  return pluralize(Math.round(days / 365.25), 'year');
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}

/** The same calendar day a year earlier, as an ISO date. */
function yearBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * How the diving goes in time: how recent, how often, when it peaked and the
 * longest run of days in a row. Over the selection, so a filter answers
 * "when did I last dive a cave" as well.
 */
export function rhythmTiles(dives: ChartDive[], today: string): StatTile[] {
  if (!dives.length) return [];
  const sorted = [...dives].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const tiles: StatTile[] = [];

  const ago = daysBetween(last.date, today);
  tiles.push({
    label: 'Since last dive',
    value: ago <= 0 ? 'today' : spanLabel(ago),
    note: formatDate(last.date),
  });

  const since = yearBefore(today);
  const recent = sorted.filter((d) => d.date > since);
  tiles.push({
    label: 'Past year',
    value: pluralize(recent.length, 'dive'),
    note: `${hours(recent.reduce((n, d) => n + d.duration_min, 0))} underwater`,
  });

  const perDay = new Map<string, number>();
  for (const dive of sorted) perDay.set(dive.date, (perDay.get(dive.date) ?? 0) + 1);
  const busiestDay = Math.max(...perDay.values());
  tiles.push({
    label: 'Dive days',
    value: pluralize(perDay.size, 'day'),
    note: busiestDay > 1 ? `up to ${busiestDay} dives in a day` : 'one dive a day',
  });

  const perYear = new Map<number, { dives: number; minutes: number }>();
  for (const dive of sorted) {
    const year = Number(dive.date.slice(0, 4));
    const row = perYear.get(year) ?? { dives: 0, minutes: 0 };
    row.dives += 1;
    row.minutes += dive.duration_min;
    perYear.set(year, row);
  }
  const [busiestYear, busiest] = [...perYear].sort(
    (a, b) => b[1].dives - a[1].dives || b[0] - a[0],
  )[0];
  tiles.push({
    label: 'Busiest year',
    value: String(busiestYear),
    note: `${busiest.dives} dives · ${hours(busiest.minutes)}`,
    group: false,
  });

  const days = [...perDay.keys()].sort();
  let streak = { days: 1, from: days[0], to: days[0] };
  let run = { days: 1, from: days[0] };
  for (let i = 1; i < days.length; i++) {
    run =
      daysBetween(days[i - 1], days[i]) === 1
        ? { days: run.days + 1, from: run.from }
        : { days: 1, from: days[i] };
    if (run.days > streak.days) streak = { ...run, to: days[i] };
  }
  tiles.push({
    label: 'Longest streak',
    value: pluralize(streak.days, 'day'),
    note:
      streak.days > 1
        ? `in a row, ${formatDateRange(streak.from, streak.to)}`
        : 'one day at a time',
  });

  const trips = new Set(sorted.flatMap((d) => (d.trip ? [d.trip.slug] : [])));
  if (trips.size) {
    const onTrips = sorted.filter((d) => d.trip).length;
    tiles.push({
      label: 'Trips',
      value: pluralize(trips.size, 'trip'),
      note: `${Math.round(onTrips / trips.size)} dives a trip`,
    });
  }
  return tiles;
}

export function yearActive(filter: DiveFilter, year: number): boolean {
  return (
    filter.year === year ||
    (filter.dateFrom === `${year}-01-01` && filter.dateTo === `${year}-12-31`)
  );
}

/** Narrow the log to one calendar year through the date range, so the slider follows. */
export function toggleYear(filter: DiveFilter, year: number): DiveFilter {
  if (yearActive(filter, year)) return { ...filter, year: null, dateFrom: null, dateTo: null };
  return { ...filter, year: null, dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}

export function bandActive(range: { min: number | null; max: number | null }, band: Band): boolean {
  return range.min === band.min && range.max === band.max;
}

export function toggleDepthBand(filter: DiveFilter, band: Band): DiveFilter {
  const off = bandActive({ min: filter.minDepth, max: filter.maxDepth }, band);
  return { ...filter, minDepth: off ? null : band.min, maxDepth: off ? null : band.max };
}

export function toggleDurationBand(filter: DiveFilter, band: Band): DiveFilter {
  const off = bandActive({ min: filter.minDuration, max: filter.maxDuration }, band);
  return { ...filter, minDuration: off ? null : band.min, maxDuration: off ? null : band.max };
}

/** Set a single-valued filter field, or clear it when it already holds that value. */
export function toggleOne(
  filter: DiveFilter,
  key: 'site' | 'person' | 'country',
  value: string,
): DiveFilter {
  return { ...filter, [key]: filter[key] === value ? '' : value };
}
