import { describe, expect, it } from 'vitest';
import {
  ATLAS_COUNTRIES,
  atlasCountry,
  countryAt,
  countryBounds,
  countryByIso3,
  countryIn,
  indexCountries,
  regionNearest,
} from './countries.js';

describe('the atlas table', () => {
  it('turns numeric ids into ISO codes', () => {
    expect(ATLAS_COUNTRIES.size).toBeGreaterThan(230);
    expect(atlasCountry('528')).toEqual({ iso3: 'NLD', iso2: 'NL', name: 'Netherlands' });
    expect(atlasCountry(36)?.iso3).toBe('AUS');
    expect(atlasCountry('036')?.iso3).toBe('AUS');
    expect(atlasCountry(undefined, 'Kosovo')?.iso3).toBe('XKX');
    expect(atlasCountry(undefined, 'Atlantis')).toBeNull();
    expect(countryByIso3('fra')?.name).toBe('France');
    expect(countryByIso3('BES')?.name).toBe('Bonaire');
    expect(countryByIso3('XKX')?.iso2).toBe('XK');
    expect(countryByIso3('')).toBeNull();
    expect(countryByIso3('ZZZ')).toBeNull();
  });
});

describe('countryIn on a small collection', () => {
  const square = (id: string, w: number, s: number, e: number, n: number) => ({
    type: 'Feature' as const,
    id,
    properties: { name: id },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [w, s],
          [w, n],
          [e, n],
          [e, s],
          [w, s],
        ],
      ],
    },
  });
  const countries = indexCountries({
    features: [square('528', 4, 51, 6, 53), square('056', 3, 50, 4, 51), square('999', 0, 0, 1, 1)],
  });

  it('skips features it cannot name', () => {
    expect(countries.map((c) => c.code.iso3)).toEqual(['NLD', 'BEL']);
  });

  it('finds the outline holding the point', () => {
    expect(countryIn(countries, 52, 5)).toMatchObject({
      iso3: 'NLD',
      inside: true,
      distance_km: 0,
    });
    expect(countryIn(countries, 50.5, 3.5)?.iso3).toBe('BEL');
  });

  it('takes the nearest outline for a point off the coast, within reach', () => {
    const hit = countryIn(countries, 53.2, 5)!;
    expect(hit).toMatchObject({ iso3: 'NLD', inside: false });
    expect(hit.distance_km).toBeGreaterThan(20);
    expect(hit.distance_km).toBeLessThan(60);
    expect(countryIn(countries, 55, 5)).toBeNull();
    expect(countryIn(countries, 55, 5, { maxKm: 300 })?.iso3).toBe('NLD');
    expect(countryIn(countries, Number.NaN, 5)).toBeNull();
  });
});

describe('countryAt on the world atlas', () => {
  it.each([
    [52.09, 5.12, 'NLD', true],
    [44.6, 1.7, 'FRA', true],
    [20.21, -87.46, 'MEX', true],
    [30.04, 31.24, 'EGY', true],
    [36.05, 14.19, 'MLT', true],
    [12.15, -68.28, 'BES', true],
    [12.12, -68.95, 'CUW', true],
  ])('places %s, %s in %s', async (lat, lon, iso3, inside) => {
    const hit = await countryAt(lat, lon);
    expect(hit?.iso3).toBe(iso3);
    expect(hit?.inside).toBe(inside);
  });

  it('gives an offshore wreck its coast, and the open ocean nothing', async () => {
    const wreck = await countryAt(27.81, 33.92);
    expect(wreck?.iso3).toBe('EGY');
    expect(await countryAt(30, -40)).toBeNull();
  });

  it('knows a country by its bounds', async () => {
    const [w, s, e, n] = (await countryBounds('NLD'))!;
    expect(w).toBeLessThan(4);
    expect(e).toBeGreaterThan(7);
    expect(s).toBeLessThan(51);
    expect(n).toBeGreaterThan(53);
    expect(await countryBounds('ZZZ')).toBeNull();
  });
});

describe('regionNearest', () => {
  const regions = [
    { id: 'lot', country: 'FRA', map_sites: [{ lat: 44.6, lon: 1.7 }] },
    { id: 'ardeche', country: 'FRA', map_sites: [{ lat: 44.4, lon: 4.4 }] },
    { id: 'zeeland', country: 'NLD', sites: [{ lat: 51.7, lon: 3.9 }] },
    { id: 'bonaire', country: 'BES', map_sites: [] },
    { id: 'gozo', country: 'MLT', map_sites: [] },
    { id: 'comino', country: 'MLT', map_sites: [] },
  ];

  it('picks the region of the country with the closest site', () => {
    expect(regionNearest(regions, 'FRA', 44.5, 1.9)?.id).toBe('lot');
    expect(regionNearest(regions, 'fra', 44.3, 4.2)?.id).toBe('ardeche');
    expect(regionNearest(regions, 'NLD', 52.0, 4.3)?.id).toBe('zeeland');
  });

  it('stays within reach and inside the country', () => {
    expect(regionNearest(regions, 'NLD', 53.4, 6.8, { maxKm: 50 })).toBeNull();
    expect(regionNearest(regions, 'DEU', 51.7, 3.9)).toBeNull();
    expect(regionNearest(regions, null, 51.7, 3.9)).toBeNull();
  });

  it('takes the only region of a country without placed sites', () => {
    expect(regionNearest(regions, 'BES', 12.15, -68.28)?.id).toBe('bonaire');
    expect(regionNearest(regions, 'MLT', 36.05, 14.19)).toBeNull();
  });
});
