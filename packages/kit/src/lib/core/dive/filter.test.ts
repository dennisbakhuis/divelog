import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  clearFilter,
  EMPTY_FILTER,
  filterFromParams,
  filterToParams,
  hitsOf,
  isFilterActive,
  searchNumbers,
  toggleTag,
} from './filter.js';
import type { DiveListItem } from './types.js';

function dive(overrides: Partial<DiveListItem>): DiveListItem {
  const base: DiveListItem = {
    number: 1,
    title: '',
    date: '2024-01-01',
    time_in: null,
    duration_min: 45,
    max_depth_m: 20,
    water_temp_c: 12,
    tags: [],
    gas: 'air',
    gases: ['Air'],
    mode: 'OC',
    site: {
      slug: 'zeelandbrug',
      name: 'Zeelandbrug',
      country_code: 'NL',
      country_name: 'Netherlands',
      region: 'zeeland-delta',
      area: 'Zierikzee',
      lat: 1,
      lon: 2,
      site_type: 'sea',
      water: 'salt',
    },
    section: null,
    buddies: [{ slug: 'kim', name: 'Kim', avatar_url: null }],
    gear_setup: 'backmount-cold',
    rating: 4,
    has_photos: false,
    has_profile: false,
    spark: null,
    cover_url: null,
    search_text: '',
    trip: null,
    ...overrides,
  };
  base.search_text = [
    `#${base.number}`,
    base.site?.name,
    base.site?.country_name,
    base.site?.region,
    base.section,
    ...base.buddies.map((b) => b.name),
    ...base.tags,
    base.gas,
    ...base.gases,
    base.mode,
  ]
    .filter(Boolean)
    .join(' ');
  return base;
}

const dives = [
  dive({ number: 1, date: '2023-05-01', max_depth_m: 12, tags: ['training'], has_photos: true }),
  dive({
    number: 2,
    date: '2024-05-08',
    max_depth_m: 40,
    duration_min: 90,
    has_profile: true,
    tags: ['cave', 'dpv'],
    gas: 'nitrox',
    gases: ['Nitrox 32', 'Oxygen'],
    mode: 'sidemount',
    gear_setup: 'sidemount-cave-dpv',
    site: {
      slug: 'ressel',
      name: 'Ressel',
      country_code: 'FR',
      country_name: 'France',
      region: 'lot-karst',
      area: null,
      lat: 1,
      lon: 2,
      site_type: 'cave',
      water: 'fresh',
    },
  }),
  dive({
    number: 3,
    date: '2024-05-08',
    max_depth_m: 30,
    tags: ['wreck'],
    section: 'Carnatic',
    buddies: [{ slug: 'mark', name: 'Mark', avatar_url: null }],
  }),
];

describe('applyFilter', () => {
  it('sorts by date descending by default with number as tiebreaker', () => {
    expect(applyFilter(dives, EMPTY_FILTER).map((d) => d.number)).toEqual([3, 2, 1]);
  });

  it('searches across site, buddies and tags', () => {
    expect(applyFilter(dives, { ...EMPTY_FILTER, q: 'ressel' }).map((d) => d.number)).toEqual([2]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, water: 'fresh' }).map((d) => d.number)).toEqual([
      2,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, gas: 'nitrox' }).map((d) => d.number)).toEqual([
      2,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, gas: 'Oxygen' }).map((d) => d.number)).toEqual([
      2,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, q: 'oxygen' }).map((d) => d.number)).toEqual([2]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, q: 'mark' }).map((d) => d.number)).toEqual([3]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, q: 'france cave' }).map((d) => d.number)).toEqual([
      2,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, q: 'nothing' })).toEqual([]);
  });

  it('forgives a typo and matches on a prefix', () => {
    expect(applyFilter(dives, { ...EMPTY_FILTER, q: 'zeelanbrug' }).map((d) => d.number)).toEqual([
      3, 1,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, q: 'carn' }).map((d) => d.number)).toEqual([3]);
    expect(searchNumbers(dives, '  ')).toBeNull();
  });

  it('filters by region, site type, person, section and a year range', () => {
    const by = (f: Partial<typeof EMPTY_FILTER>) =>
      applyFilter(dives, { ...EMPTY_FILTER, ...f }).map((d) => d.number);
    expect(by({ region: 'lot-karst' })).toEqual([2]);
    expect(by({ siteType: 'sea' })).toEqual([3, 1]);
    expect(by({ person: 'mark' })).toEqual([3]);
    expect(by({ section: 'Carnatic' })).toEqual([3]);
    expect(by({ dateFrom: '2024-01-01' })).toEqual([3, 2]);
    expect(by({ dateTo: '2023-12-31' })).toEqual([1]);
  });

  it('lists the sites and people behind a result set', () => {
    const hits = hitsOf(dives);
    expect(hits.sites.map((s) => `${s.slug}:${s.count}`)).toEqual(['zeelandbrug:2', 'ressel:1']);
    expect(hits.people.map((p) => p.slug)).toEqual(['kim', 'mark']);
  });

  it('applies facets', () => {
    expect(applyFilter(dives, { ...EMPTY_FILTER, tags: ['cave'] }).map((d) => d.number)).toEqual([
      2,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, country: 'NL' }).map((d) => d.number)).toEqual([
      3, 1,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, year: 2024 }).map((d) => d.number)).toEqual([
      3, 2,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, gas: 'nitrox' }).map((d) => d.number)).toEqual([
      2,
    ]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, mode: 'sidemount' }).map((d) => d.number)).toEqual(
      [2],
    );
    expect(
      applyFilter(dives, { ...EMPTY_FILTER, setup: 'backmount-cold' }).map((d) => d.number),
    ).toEqual([3, 1]);
    expect(applyFilter(dives, { ...EMPTY_FILTER, site: 'ressel' }).map((d) => d.number)).toEqual([
      2,
    ]);
    expect(
      applyFilter(dives, { ...EMPTY_FILTER, minDepth: 25, maxDepth: 35 }).map((d) => d.number),
    ).toEqual([3]);
  });

  it('filters by half-open depth and duration ranges', () => {
    const by = (f: Partial<typeof EMPTY_FILTER>) =>
      applyFilter(dives, { ...EMPTY_FILTER, ...f }).map((d) => d.number);
    expect(by({ minDepth: 30, maxDepth: 40 })).toEqual([3]);
    expect(by({ minDepth: 40 })).toEqual([2]);
    expect(by({ maxDepth: 12 })).toEqual([]);
    expect(by({ minDuration: 60, maxDuration: 120 })).toEqual([2]);
    expect(by({ maxDuration: 60 })).toEqual([3, 1]);
  });

  it('filters on photos and profiles', () => {
    const by = (f: Partial<typeof EMPTY_FILTER>) =>
      applyFilter(dives, { ...EMPTY_FILTER, ...f }).map((d) => d.number);
    expect(by({ photos: true })).toEqual([1]);
    expect(by({ profile: true })).toEqual([2]);
    expect(by({ photos: true, profile: true })).toEqual([]);
  });

  it('sorts by depth and duration', () => {
    expect(applyFilter(dives, { ...EMPTY_FILTER, sort: 'depth' }).map((d) => d.number)).toEqual([
      2, 3, 1,
    ]);
    expect(
      applyFilter(dives, { ...EMPTY_FILTER, sort: 'duration', desc: false }).map((d) => d.number),
    ).toEqual([1, 3, 2]);
    expect(
      applyFilter(dives, { ...EMPTY_FILTER, sort: 'number', desc: false }).map((d) => d.number),
    ).toEqual([1, 2, 3]);
  });
});

describe('URL round-trip', () => {
  it('serialises only the non-default fields', () => {
    const filter = {
      ...EMPTY_FILTER,
      q: 'cave',
      tags: ['cave', 'dpv'],
      year: 2024,
      sort: 'depth' as const,
      desc: false,
      minDepth: 10,
      person: 'kim',
      mapColour: 'year' as const,
    };
    const params = filterToParams(filter);
    expect(params.toString()).toBe(
      'q=cave&tag=cave%2Cdpv&with=kim&year=2024&min=10&sort=depth&asc=1&colour=year',
    );
    expect(filterFromParams(params)).toEqual(filter);
    expect(filterToParams(EMPTY_FILTER).toString()).toBe('');
  });

  it('round-trips the ranges, toggles and the timeline and map selections', () => {
    const filter = {
      ...EMPTY_FILTER,
      site: 'ressel',
      dateFrom: '2022-03-01',
      dateTo: '2023-10-15',
      maxDepth: 10,
      minDuration: 120,
      photos: true,
      profile: true,
    };
    const params = filterToParams(filter);
    expect(params.toString()).toBe(
      'site=ressel&from=2022-03-01&to=2023-10-15&max=10&tmin=120&photos=1&profile=1',
    );
    expect(filterFromParams(params)).toEqual(filter);
    expect(filterFromParams(new URLSearchParams('photos=0')).photos).toBe(false);
  });

  it('reads a bare year in the date range as its first or last day', () => {
    const filter = filterFromParams(new URLSearchParams('from=2022&to=2023'));
    expect(filter.dateFrom).toBe('2022-01-01');
    expect(filter.dateTo).toBe('2023-12-31');
    expect(filterFromParams(new URLSearchParams('from=yesterday')).dateFrom).toBeNull();
  });

  it('clears everything but the sort and the map styling', () => {
    const cleared = clearFilter({
      ...EMPTY_FILTER,
      q: 'x',
      site: 'ressel',
      dateFrom: '2022-01-01',
      photos: true,
      sort: 'depth',
      mapColour: 'year',
    });
    expect(cleared).toEqual({ ...EMPTY_FILTER, sort: 'depth', mapColour: 'year' });
    expect(isFilterActive(cleared)).toBe(false);
  });

  it('ignores garbage values', () => {
    const filter = filterFromParams(new URLSearchParams('year=abc&sort=nope&min=&tag=,,'));
    expect(filter.year).toBeNull();
    expect(filter.sort).toBe('date');
    expect(filter.minDepth).toBeNull();
    expect(filter.tags).toEqual([]);
  });

  it('knows when a filter is active', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, sort: 'depth' })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, mapSize: 'uniform', mapColour: 'depth' })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, country: 'NL' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, profile: true })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, dateFrom: '2022-01-01' })).toBe(true);
  });

  it('toggles tags', () => {
    const on = toggleTag(EMPTY_FILTER, 'cave');
    expect(on.tags).toEqual(['cave']);
    expect(toggleTag(on, 'cave').tags).toEqual([]);
  });
});
