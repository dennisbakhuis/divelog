import type { DiveStats, MapSite } from './types.js';
import { formatHours } from './format.js';
import type { DivelogUrls } from './config.js';

/** One stat; `group: false` keeps a counted number like a year free of digit grouping. */
export type StatTile = {
  label: string;
  value: string;
  note?: string;
  href?: string;
  group?: boolean;
};

const NOTABLE: { tag: string; label: string }[] = [
  { tag: 'cave', label: 'Cave dives' },
  { tag: 'dpv', label: 'Scooter dives' },
  { tag: 'stage', label: 'Stage dives' },
  { tag: 'wreck', label: 'Wreck dives' },
  { tag: 'deco', label: 'Deco dives' },
  { tag: 'night', label: 'Night dives' },
  { tag: 'drift', label: 'Drift dives' },
];

/** Depth is a field, not a tag: the "deep" tile counts dives at or past this many metres. */
export const DEEP_DIVE_M = 30;

export function headlineTiles(stats: DiveStats): StatTile[] {
  const tiles: StatTile[] = [
    {
      label: 'Dives',
      value: String(stats.total_dives),
      note: stats.private_dives ? `${stats.private_dives} private` : undefined,
    },
    { label: 'Time underwater', value: formatHours(stats.total_minutes) },
    { label: 'Max depth', value: `${stats.max_depth_m} m` },
    { label: 'Countries', value: String(stats.countries) },
    { label: 'Sites', value: String(stats.sites) },
    {
      label: 'Diving since',
      value: stats.first_dive ? stats.first_dive.slice(0, 4) : '—',
      group: false,
    },
  ];
  return tiles;
}

export function notableTiles(stats: DiveStats, urls: DivelogUrls): StatTile[] {
  const counts = new Map(stats.tags.map((t) => [t.tag, t.count]));
  const tiles: StatTile[] = NOTABLE.filter((n) => counts.has(n.tag)).map((n) => ({
    label: n.label,
    value: String(counts.get(n.tag)),
    href: urls.filter({ tag: n.tag }),
  }));
  if (stats.deep_dives)
    tiles.push({
      label: `Deep dives`,
      value: String(stats.deep_dives),
      note: `${DEEP_DIVE_M} m or more`,
      href: urls.filter({ min: DEEP_DIVE_M }),
    });
  return tiles;
}

export function recordTiles(stats: DiveStats, urls: DivelogUrls): StatTile[] {
  const tiles: StatTile[] = [];
  if (stats.deepest)
    tiles.push({
      label: 'Deepest',
      value: `${stats.deepest.value} m`,
      note: stats.deepest.site ?? undefined,
      href: urls.dive(stats.deepest.number),
    });
  if (stats.longest)
    tiles.push({
      label: 'Longest',
      value: `${stats.longest.value} min`,
      note: stats.longest.site ?? undefined,
      href: urls.dive(stats.longest.number),
    });
  if (stats.coldest)
    tiles.push({
      label: 'Coldest',
      value: `${stats.coldest.value} °C`,
      note: stats.coldest.site ?? undefined,
      href: urls.dive(stats.coldest.number),
    });
  return tiles;
}

/** Radius for a map dot: sqrt scaling so 10 dives is not 10× the area of 1. */
export function dotRadius(site: MapSite, max: number): number {
  const base = 3;
  const extra = 7;
  return base + extra * Math.sqrt(site.dives / Math.max(max, 1));
}

export type SizeMode = 'dives' | 'minutes' | 'uniform';
export type ColourMode = 'type' | 'year' | 'depth';

/** A change from the map's option strip; keys mirror the URL filter. */
export type MapOptionsPatch = {
  mapSize?: SizeMode;
  mapColour?: ColourMode;
};

export const SIZE_MODES: { mode: SizeMode; label: string }[] = [
  { mode: 'dives', label: 'dives' },
  { mode: 'minutes', label: 'bottom time' },
  { mode: 'uniform', label: 'same size' },
];

export const COLOUR_MODES: { mode: ColourMode; label: string }[] = [
  { mode: 'type', label: 'site type' },
  { mode: 'year', label: 'last visit' },
  { mode: 'depth', label: 'max depth' },
];

/** Dot radius for the chosen measure; `max` is that measure's maximum over the dots. */
export function dotRadiusBy(site: MapSite, mode: SizeMode, max: number): number {
  if (mode === 'uniform') return 4.5;
  const value = mode === 'minutes' ? site.minutes : site.dives;
  return 3 + 7 * Math.sqrt(value / Math.max(max, 1));
}

export function dotMeasureMax(sites: MapSite[], mode: SizeMode): number {
  if (mode === 'minutes') return Math.max(...sites.map((s) => s.minutes), 1);
  return Math.max(...sites.map((s) => s.dives), 1);
}

const TYPE_COLOURS: Record<string, string> = {
  cave: 'var(--dl-tag-cave)',
  cavern: 'var(--dl-tag-cave)',
  mine: 'var(--dl-tag-cave)',
  quarry: 'var(--dl-tag-training)',
  'quarry lake': 'var(--dl-tag-training)',
  lake: 'var(--dl-tag-drift)',
  reservoir: 'var(--dl-tag-drift)',
  pool: 'var(--dl-tag-training)',
  'indoor dive tower': 'var(--dl-tag-training)',
  wreck: 'var(--dl-tag-wreck)',
  'reef with wrecks': 'var(--dl-tag-wreck)',
};

export function typeColour(type: string): string {
  return TYPE_COLOURS[type] ?? 'var(--dl-color-accent)';
}

/** The legend swatches for the type colouring, collapsed to the families that share a colour. */
export const TYPE_LEGEND: { label: string; colour: string }[] = [
  { label: 'sea', colour: 'var(--dl-color-accent)' },
  { label: 'cave', colour: 'var(--dl-tag-cave)' },
  { label: 'quarry / pool', colour: 'var(--dl-tag-training)' },
  { label: 'lake', colour: 'var(--dl-tag-drift)' },
  { label: 'wreck', colour: 'var(--dl-tag-wreck)' },
];

export type ColourScale = { min: number; max: number };

export function colourScale(sites: MapSite[], mode: ColourMode): ColourScale {
  if (mode === 'year') {
    const years = sites.map((s) => s.last_year);
    return { min: Math.min(...years, 3000), max: Math.max(...years, 0) };
  }
  if (mode === 'depth') return { min: 0, max: Math.max(...sites.map((s) => s.max_depth_m), 1) };
  return { min: 0, max: 1 };
}

/** A colour for one dot: a hue ramp for the continuous modes, a token per family otherwise. */
export function dotColour(site: MapSite, mode: ColourMode, scale: ColourScale): string {
  if (mode === 'type') return typeColour(site.site_type);
  const value = mode === 'year' ? site.last_year : site.max_depth_m;
  const span = scale.max - scale.min || 1;
  const t = Math.min(1, Math.max(0, (value - scale.min) / span));
  if (mode === 'year') return `hsl(${200 + 0 * t} ${25 + 60 * t}% ${40 + 25 * t}%)`;
  return `hsl(${196 - 60 * t} 78% ${68 - 36 * t}%)`;
}

export function barHeights<T>(items: T[], value: (item: T) => number, max = 100): number[] {
  const top = Math.max(...items.map(value), 1);
  return items.map((i) => Math.round((value(i) / top) * max));
}

export type MonthTemp = { label: string; month: number; temp: number | null; dives: number };

/** Fewer dives with a water temperature than this and the monthly chart says nothing. */
export const MIN_TEMP_DIVES = 3;

/**
 * Mean water temperature per calendar month over ``dives``, or null when fewer
 * than ``MIN_TEMP_DIVES`` of them logged one. ``dives`` counts the dives with a
 * temperature in that month.
 */
export function waterTempByMonth(
  dives: { date: string; water_temp_c: number | null }[],
): MonthTemp[] | null {
  const months = Array.from({ length: 12 }, () => [] as number[]);
  for (const dive of dives) {
    if (dive.water_temp_c === null) continue;
    months[Number(dive.date.slice(5, 7)) - 1]?.push(dive.water_temp_c);
  }
  if (months.reduce((n, m) => n + m.length, 0) < MIN_TEMP_DIVES) return null;
  return months.map((temps, i) => ({
    label: 'JFMAMJJASOND'[i],
    month: i + 1,
    temp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    dives: temps.length,
  }));
}
