import MiniSearch from 'minisearch';
import type { DiveListItem } from './types.js';
import type { ColourMode, SizeMode } from './stats-view.js';

export type SortKey = 'date' | 'depth' | 'duration' | 'number';

export type DiveFilter = {
  q: string;
  tags: string[];
  country: string;
  region: string;
  site: string;
  siteType: string;
  water: string;
  person: string;
  section: string;
  year: number | null;
  /** ISO dates, inclusive; the range slider under the globe sets them. */
  dateFrom: string | null;
  dateTo: string | null;
  gas: string;
  mode: string;
  setup: string;
  minDepth: number | null;
  maxDepth: number | null;
  minDuration: number | null;
  maxDuration: number | null;
  photos: boolean;
  profile: boolean;
  sort: SortKey;
  desc: boolean;
  mapSize: SizeMode;
  mapColour: ColourMode;
};

export const EMPTY_FILTER: DiveFilter = {
  q: '',
  tags: [],
  country: '',
  region: '',
  site: '',
  siteType: '',
  water: '',
  person: '',
  section: '',
  year: null,
  dateFrom: null,
  dateTo: null,
  gas: '',
  mode: '',
  setup: '',
  minDepth: null,
  maxDepth: null,
  minDuration: null,
  maxDuration: null,
  photos: false,
  profile: false,
  sort: 'date',
  desc: true,
  mapSize: 'dives',
  mapColour: 'type',
};

function num(value: string | null): number | null {
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** An ISO date from the URL; a bare year still works and means its first or last day. */
export function isoDate(value: string | null, edge: 'start' | 'end'): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}$/.test(value)) return edge === 'start' ? `${value}-01-01` : `${value}-12-31`;
  return null;
}

/** Read a filter from the URL so a filtered view can be shared. */
export function filterFromParams(params: URLSearchParams): DiveFilter {
  const sort = params.get('sort');
  const size = params.get('size');
  const colour = params.get('colour');
  return {
    q: params.get('q') ?? '',
    tags: (params.get('tag') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    country: params.get('country') ?? '',
    region: params.get('region') ?? '',
    site: params.get('site') ?? '',
    siteType: params.get('type') ?? '',
    water: params.get('water') ?? '',
    person: params.get('with') ?? '',
    section: params.get('section') ?? '',
    year: num(params.get('year')),
    dateFrom: isoDate(params.get('from'), 'start'),
    dateTo: isoDate(params.get('to'), 'end'),
    gas: params.get('gas') ?? '',
    mode: params.get('mode') ?? '',
    setup: params.get('setup') ?? '',
    minDepth: num(params.get('min')),
    maxDepth: num(params.get('max')),
    minDuration: num(params.get('tmin')),
    maxDuration: num(params.get('tmax')),
    photos: params.get('photos') === '1',
    profile: params.get('profile') === '1',
    sort: sort === 'depth' || sort === 'duration' || sort === 'number' ? sort : 'date',
    desc: params.get('asc') !== '1',
    mapSize: size === 'minutes' || size === 'uniform' ? size : 'dives',
    mapColour: colour === 'year' || colour === 'depth' ? colour : 'type',
  };
}

export function filterToParams(filter: DiveFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.tags.length) params.set('tag', filter.tags.join(','));
  if (filter.country) params.set('country', filter.country);
  if (filter.region) params.set('region', filter.region);
  if (filter.site) params.set('site', filter.site);
  if (filter.siteType) params.set('type', filter.siteType);
  if (filter.water) params.set('water', filter.water);
  if (filter.person) params.set('with', filter.person);
  if (filter.section) params.set('section', filter.section);
  if (filter.year !== null) params.set('year', String(filter.year));
  if (filter.dateFrom !== null) params.set('from', filter.dateFrom);
  if (filter.dateTo !== null) params.set('to', filter.dateTo);
  if (filter.gas) params.set('gas', filter.gas);
  if (filter.mode) params.set('mode', filter.mode);
  if (filter.setup) params.set('setup', filter.setup);
  if (filter.minDepth !== null) params.set('min', String(filter.minDepth));
  if (filter.maxDepth !== null) params.set('max', String(filter.maxDepth));
  if (filter.minDuration !== null) params.set('tmin', String(filter.minDuration));
  if (filter.maxDuration !== null) params.set('tmax', String(filter.maxDuration));
  if (filter.photos) params.set('photos', '1');
  if (filter.profile) params.set('profile', '1');
  if (filter.sort !== 'date') params.set('sort', filter.sort);
  if (!filter.desc) params.set('asc', '1');
  if (filter.mapSize !== 'dives') params.set('size', filter.mapSize);
  if (filter.mapColour !== 'type') params.set('colour', filter.mapColour);
  return params;
}

/** True when something narrows the list; sort order and map styling do not count. */
export function isFilterActive(filter: DiveFilter): boolean {
  const neutral = { ...filter, sort: 'date' as const, desc: true, mapSize: 'dives' as const };
  return filterToParams({ ...neutral, mapColour: 'type' }).toString() !== '';
}

/** Drop everything that narrows the list, keeping the sort order and the map styling. */
export function clearFilter(filter: DiveFilter): DiveFilter {
  return {
    ...EMPTY_FILTER,
    sort: filter.sort,
    desc: filter.desc,
    mapSize: filter.mapSize,
    mapColour: filter.mapColour,
  };
}

export const GAS_TYPES = ['air', 'nitrox', 'trimix'] as const;

/** `gas` is either a type ("nitrox") or one exact mix as labelled ("Trimix 21/35"). */
export function gasMatches(dive: Pick<DiveListItem, 'gas' | 'gases'>, gas: string): boolean {
  if ((GAS_TYPES as readonly string[]).includes(gas)) return dive.gas === gas;
  return dive.gases.includes(gas);
}

/** The mixes in the list with their counts, most common first, for the gas filter. */
export function gasOptions(dives: DiveListItem[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const dive of dives) {
    for (const gas of dive.gases) counts.set(gas, (counts.get(gas) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function haystack(dive: DiveListItem): string {
  return [
    dive.title,
    String(dive.number),
    dive.site?.name,
    dive.site?.country_name,
    dive.site?.region,
    dive.section,
    ...dive.buddies.map((b) => b.name),
    ...dive.tags,
    dive.gas,
    ...dive.gases,
    dive.mode,
  ]
    .filter(Boolean)
    .join(' ');
}

const indexes = new WeakMap<DiveListItem[], MiniSearch<DiveListItem>>();

/** One full-text index per list instance; the list is fetched once, so this is built once. */
function indexFor(dives: DiveListItem[]): MiniSearch<DiveListItem> {
  let index = indexes.get(dives);
  if (!index) {
    index = new MiniSearch<DiveListItem>({
      idField: 'number',
      fields: ['text'],
      extractField: (dive, field) => {
        if (field === 'number') return String(dive.number);
        return dive.search_text || haystack(dive);
      },
      searchOptions: { prefix: true, fuzzy: 0.15, combineWith: 'AND' },
    });
    index.addAll(dives);
    indexes.set(dives, index);
  }
  return index;
}

/** The dive numbers matching a free-text query, or null when there is no query. */
export function searchNumbers(dives: DiveListItem[], q: string): Set<number> | null {
  const query = q.trim();
  if (!query) return null;
  const hits = indexFor(dives).search(query);
  return new Set(hits.map((h) => Number(h.id)));
}

/** Ranges are half-open: `min` inclusive, `max` exclusive, so buckets never overlap. */
export function applyFilter(dives: DiveListItem[], filter: DiveFilter): DiveListItem[] {
  const matched = searchNumbers(dives, filter.q);
  const result = dives.filter((dive) => {
    if (matched && !matched.has(dive.number)) return false;
    if (filter.tags.length && !filter.tags.every((t) => dive.tags.includes(t))) return false;
    if (filter.country && dive.site?.country_code !== filter.country) return false;
    if (filter.region && dive.site?.region !== filter.region) return false;
    if (filter.water && dive.site?.water !== filter.water) return false;
    if (filter.site && dive.site?.slug !== filter.site) return false;
    if (filter.siteType && dive.site?.site_type !== filter.siteType) return false;
    if (filter.person && !dive.buddies.some((b) => b.slug === filter.person)) return false;
    if (filter.section && dive.section !== filter.section) return false;
    const year = Number(dive.date.slice(0, 4));
    if (filter.year !== null && year !== filter.year) return false;
    if (filter.dateFrom !== null && dive.date < filter.dateFrom) return false;
    if (filter.dateTo !== null && dive.date > filter.dateTo) return false;
    if (filter.gas && !gasMatches(dive, filter.gas)) return false;
    if (filter.mode && dive.mode !== filter.mode) return false;
    if (filter.setup && dive.gear_setup !== filter.setup) return false;
    if (filter.minDepth !== null && dive.max_depth_m < filter.minDepth) return false;
    if (filter.maxDepth !== null && dive.max_depth_m >= filter.maxDepth) return false;
    if (filter.minDuration !== null && dive.duration_min < filter.minDuration) return false;
    if (filter.maxDuration !== null && dive.duration_min >= filter.maxDuration) return false;
    if (filter.photos && !dive.has_photos) return false;
    if (filter.profile && !dive.has_profile) return false;
    return true;
  });

  const key = {
    date: (d: DiveListItem) => `${d.date}#${String(d.number).padStart(6, '0')}`,
    depth: (d: DiveListItem) => d.max_depth_m,
    duration: (d: DiveListItem) => d.duration_min,
    number: (d: DiveListItem) => d.number,
  }[filter.sort];

  result.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return filter.desc ? -cmp : cmp;
  });
  return result;
}

export function toggleTag(filter: DiveFilter, tag: string): DiveFilter {
  const tags = filter.tags.includes(tag)
    ? filter.tags.filter((t) => t !== tag)
    : [...filter.tags, tag];
  return { ...filter, tags };
}

export type Hit = { slug: string; name: string; count: number };

/** The sites and people behind a result set, so a search can jump to their pages. */
export function hitsOf(dives: DiveListItem[]): { sites: Hit[]; people: Hit[] } {
  const sites = new Map<string, Hit>();
  const people = new Map<string, Hit>();
  for (const dive of dives) {
    if (dive.site) {
      const hit = sites.get(dive.site.slug) ?? {
        slug: dive.site.slug,
        name: dive.site.name,
        count: 0,
      };
      hit.count += 1;
      sites.set(dive.site.slug, hit);
    }
    for (const buddy of dive.buddies) {
      const hit = people.get(buddy.slug) ?? { slug: buddy.slug, name: buddy.name, count: 0 };
      hit.count += 1;
      people.set(buddy.slug, hit);
    }
  }
  const byCount = (a: Hit, b: Hit) => b.count - a.count || a.name.localeCompare(b.name);
  return {
    sites: [...sites.values()].sort(byCount),
    people: [...people.values()].sort(byCount),
  };
}
