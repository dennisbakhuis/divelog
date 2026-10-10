import { describe, expect, it } from 'vitest';
import {
  barHeights,
  colourScale,
  dotColour,
  dotMeasureMax,
  dotRadius,
  dotRadiusBy,
  headlineTiles,
  notableTiles,
  recordTiles,
  typeColour,
  waterTempByMonth,
} from './stats-view.js';
import type { DiveStats } from './types.js';
import { DEFAULT_CONFIG, createUrls } from './config.js';

const urls = createUrls(DEFAULT_CONFIG);

const stats: DiveStats = {
  total_dives: 45,
  private_dives: 1,
  total_minutes: 150,
  max_depth_m: 42,
  avg_depth_m: 20,
  avg_duration_min: 50,
  countries: 6,
  sites: 15,
  first_dive: '2017-07-15',
  last_dive: '2026-05-01',
  tags: [
    { tag: 'cave', count: 9 },
    { tag: 'dpv', count: 4 },
  ],
  deep_dives: 0,
  years: [],
  country_breakdown: [],
  depth_buckets: [],
  map_sites: [],
  deepest: { number: 30, title: '', value: 42, site: 'Ressel' },
  longest: { number: 30, title: '', value: 96, site: 'Ressel' },
  coldest: null,
};

describe('stats view', () => {
  it('builds headline tiles', () => {
    const tiles = headlineTiles(stats);
    expect(tiles[0]).toEqual({ label: 'Dives', value: '45', note: '1 private' });
    expect(tiles[1].value).toBe('2.5 h');
    expect(tiles[5].value).toBe('2017');
    expect(tiles[5].group).toBe(false);
    expect(tiles[0].group).toBeUndefined();
  });

  it('only lists notable tags that exist', () => {
    expect(notableTiles(stats, urls).map((t) => t.label)).toEqual(['Cave dives', 'Scooter dives']);
    expect(notableTiles(stats, urls)[0].href).toBe('/dive?tag=cave');
  });

  it('skips missing records', () => {
    const tiles = recordTiles(stats, urls);
    expect(tiles.map((t) => t.label)).toEqual(['Deepest', 'Longest']);
    expect(tiles[0].href).toBe('/dive/30');
  });

  it('scales dots and bars', () => {
    const site = {
      slug: 's',
      name: 's',
      country_code: 'NL',
      lat: 0,
      lon: 0,
      dives: 4,
      minutes: 200,
      site_type: 'sea',
      max_depth_m: 0,
      first_year: 2020,
      last_year: 2024,
    };
    expect(dotRadius(site, 4)).toBe(10);
    expect(dotRadius({ ...site, dives: 1 }, 4)).toBe(6.5);
    expect(dotRadiusBy(site, 'uniform', 4)).toBe(4.5);
    expect(dotRadiusBy(site, 'minutes', 800)).toBe(6.5);
    expect(dotMeasureMax([site, { ...site, minutes: 50 }], 'minutes')).toBe(200);
    expect(typeColour('quarry lake')).toBe('var(--dl-tag-training)');
    expect(typeColour('sea')).toBe('var(--dl-color-accent)');
    const scale = colourScale([site, { ...site, last_year: 2010 }], 'year');
    expect(scale).toEqual({ min: 2010, max: 2024 });
    expect(dotColour(site, 'type', scale)).toBe('var(--dl-color-accent)');
    expect(dotColour(site, 'year', scale)).toMatch(/^hsl\(/);
    expect(dotColour({ ...site, max_depth_m: 30 }, 'depth', { min: 0, max: 60 })).toMatch(/^hsl\(/);
    expect(barHeights([1, 2, 4], (v) => v)).toEqual([25, 50, 100]);
    expect(barHeights([0, 0], (v) => v)).toEqual([0, 0]);
  });
});

describe('stats view edge cases', () => {
  it('omits the private note and handles missing first dive', () => {
    const tiles = headlineTiles({ ...stats, private_dives: 0, first_dive: null });
    expect(tiles[0].note).toBeUndefined();
    expect(tiles[5].value).toBe('—');
  });

  it('renders coldest and records without a site', () => {
    const tiles = recordTiles(
      {
        ...stats,
        deepest: { number: 1, title: '', value: 10, site: null },
        longest: null,
        coldest: { number: 2, title: '', value: 4, site: null },
      },
      urls,
    );
    expect(tiles.map((t) => t.label)).toEqual(['Deepest', 'Coldest']);
    expect(tiles[0].note).toBeUndefined();
    expect(tiles[1].value).toBe('4 °C');
  });
});

describe('waterTempByMonth', () => {
  const d = (date: string, water_temp_c: number | null) => ({ date, water_temp_c });

  it('averages per calendar month across years', () => {
    const months = waterTempByMonth([
      d('2020-07-01', 18),
      d('2023-07-10', 20),
      d('2021-01-05', 6),
      d('2021-01-06', null),
    ]);
    expect(months).toHaveLength(12);
    expect(months![6]).toEqual({ label: 'J', month: 7, temp: 19, dives: 2 });
    expect(months![0].dives).toBe(1);
    expect(months![3].temp).toBeNull();
  });

  it('says nothing below three dives with a temperature', () => {
    expect(
      waterTempByMonth([d('2020-07-01', 18), d('2020-08-01', 19), d('2020-09-01', null)]),
    ).toBeNull();
  });
});
