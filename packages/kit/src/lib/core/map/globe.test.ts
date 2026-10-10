import { describe, expect, it } from 'vitest';
import { boundsOf, jumpTargets, sameView, sitesToGeoJSON, tallySites } from './globe.js';
import type { DiveListItem, MapSite } from '$lib/core/dive/types.js';

function site(overrides: Partial<MapSite>): MapSite {
  return {
    slug: 'x',
    name: 'X',
    country_code: 'nl',
    lat: 52,
    lon: 5,
    dives: 1,
    minutes: 50,
    site_type: 'lake',
    max_depth_m: 20,
    first_year: 2020,
    last_year: 2024,
    ...overrides,
  };
}

const sites = [
  site({ slug: 'vinkeveen', name: 'Vinkeveen', dives: 40, minutes: 2000 }),
  site({ slug: 'zeeland', name: 'Zeeland', lat: 51.6, lon: 3.9, dives: 10, site_type: 'sea' }),
  site({
    slug: 'dahab',
    name: 'Dahab',
    country_code: 'eg',
    lat: 28.5,
    lon: 34.5,
    dives: 25,
    site_type: 'sea',
    max_depth_m: 40,
    first_year: 2018,
    last_year: 2019,
  }),
];

describe('sitesToGeoJSON', () => {
  it('bakes radius, colour and state into point features', () => {
    const data = sitesToGeoJSON(sites, {
      size: 'dives',
      colour: 'type',
      activeSite: '',
      resolve: (c) => c.replace('var(--', '').replace(')', ''),
    });
    expect(data.features).toHaveLength(3);
    const [vinkeveen, zeeland, dahab] = data.features;
    expect(vinkeveen.geometry.coordinates).toEqual([5, 52]);
    expect(vinkeveen.properties.r).toBeGreaterThan(zeeland.properties.r);
    expect(vinkeveen.properties.fill).toBe('dl-tag-drift');
    expect(dahab.properties.fill).toBe('dl-color-accent');
    expect(data.features.every((f) => f.properties.dim === 0)).toBe(true);
    expect(data.features.map((f) => f.properties.total)).toEqual([40, 10, 25]);
    expect(data.features.map((f) => f.properties.sel)).toEqual([40, 10, 25]);
    expect('lat' in vinkeveen.properties).toBe(false);
  });

  it('dims everything but the active site, and sites the selection left out', () => {
    const active = sitesToGeoJSON(sites, {
      size: 'uniform',
      colour: 'depth',
      activeSite: 'dahab',
    });
    expect(active.features.map((f) => f.properties.active)).toEqual([0, 0, 1]);
    expect(active.features.map((f) => f.properties.dim)).toEqual([1, 1, 0]);
    expect(active.features.every((f) => f.properties.r === 4.5)).toBe(true);

    const tally = new Map([
      ['vinkeveen', { dives: 2, minutes: 90, max_depth_m: 12, first_year: 2024, last_year: 2024 }],
    ]);
    const selected = sitesToGeoJSON(sites, {
      size: 'dives',
      colour: 'type',
      activeSite: '',
      tally,
    });
    expect(selected.features.map((f) => f.properties.dim)).toEqual([0, 1, 1]);
    const [vinkeveen, , dahab] = selected.features;
    expect(vinkeveen.properties.dives).toBe(2);
    expect(vinkeveen.properties.minutes).toBe(90);
    expect(vinkeveen.properties.total).toBe(40);
    expect(selected.features.map((f) => f.properties.sel)).toEqual([2, 0, 0]);
    expect(vinkeveen.properties.r).toBe(10);
    expect(dahab.properties.dives).toBe(25);
    expect(dahab.properties.r).toBeGreaterThan(vinkeveen.properties.r);
  });
});

describe('tallySites', () => {
  it('sums the dives per site', () => {
    const base: DiveListItem = {
      number: 1,
      title: 'x',
      date: '2020-05-05',
      time_in: null,
      duration_min: 40,
      max_depth_m: 18,
      water_temp_c: null,
      tags: [],
      gas: 'air',
      gases: ['Air'],
      mode: 'OC',
      site: { ...site({}), region: null, area: null, country_name: 'NL', water: null },
      section: null,
      buddies: [],
      gear_setup: null,
      rating: null,
      has_photos: false,
      has_profile: false,
      spark: null,
      cover_url: null,
      search_text: '',
      trip: null,
    };
    const tally = tallySites([
      base,
      { ...base, number: 2, date: '2023-01-01', duration_min: 60, max_depth_m: 30 },
      { ...base, number: 3, site: null },
    ]);
    expect([...tally.keys()]).toEqual(['x']);
    expect(tally.get('x')).toEqual({
      dives: 2,
      minutes: 100,
      max_depth_m: 30,
      first_year: 2020,
      last_year: 2023,
    });
  });
});

describe('boundsOf', () => {
  it('pads the box and clamps the latitude', () => {
    expect(boundsOf([])).toBeNull();
    const box = boundsOf([{ lat: 52, lon: 5 }])!;
    expect(box).toEqual([4.6, 51.6, 5.4, 52.4]);
    const polar = boundsOf([{ lat: 84.9, lon: 0 }])!;
    expect(polar[3]).toBe(85);
  });
});

describe('jumpTargets', () => {
  it('ranks countries by dives with the flag and name on the chip', () => {
    const targets = jumpTargets(sites, [
      { country_code: 'nl', country_name: 'Netherlands', dives: 50 },
      { country_code: 'eg', country_name: 'Egypt', dives: 25 },
    ]);
    expect(targets.map((t) => t.code)).toEqual(['nl', 'eg']);
    expect(targets[0].label).toBe('🇳🇱 Netherlands');
    expect(targets[0].dives).toBe(50);
    expect(targets[0].bounds[0]).toBeLessThan(3.9);
    expect(targets[0].bounds[2]).toBeGreaterThan(5);
    expect(jumpTargets(sites, [], 1)).toHaveLength(1);
    expect(jumpTargets(sites)[1].label).toBe('🇪🇬 EG');
  });
});

describe('sameView', () => {
  it('compares cameras by value', () => {
    const a = { center: [15, 25] as [number, number], zoom: 1.6, bearing: 0, pitch: 0 };
    expect(sameView(a, { ...a, center: [15, 25] })).toBe(true);
    expect(sameView(a, { ...a, zoom: 2 })).toBe(false);
    expect(sameView(a, null)).toBe(false);
    expect(sameView(null, null)).toBe(true);
  });
});
