import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatLatLon,
  metresBetween,
  nudge,
  parseLatLon,
  validLatLon,
} from './coords.js';

describe('parseLatLon', () => {
  it.each([
    ['52.09, 5.12', 52.09, 5.12],
    ['52.09 5.12', 52.09, 5.12],
    ['(52.09; 5.12)', 52.09, 5.12],
    ['-33.9, 18.4', -33.9, 18.4],
    ['120.5, 10.2', 10.2, 120.5],
    ['Entry at 12.15, -68.28 per the dive centre', 12.15, -68.28],
    ['52, 5', 52, 5],
  ])('reads decimal %s', (text, lat, lon) => {
    expect(parseLatLon(text)).toEqual({ lat, lon });
  });

  it.each([
    [`52°05'24"N 5°07'12"E`, 52.09, 5.12],
    [`5°07'12"E, 52°05'24"N`, 52.09, 5.12],
    [`N 52° 5.4' E 5° 7.2'`, 52.09, 5.12],
    [`20°30′S 57°30′W`, -20.5, -57.5],
    ['52.09N 5.12E', 52.09, 5.12],
    ['5.12E 52.09N', 52.09, 5.12],
    ['S 33.9 E 18.4', -33.9, 18.4],
    ['52° 5.12°', 52, 5.12],
  ])('reads degrees, minutes, seconds and hemispheres in %s', (text, lat, lon) => {
    const got = parseLatLon(text)!;
    expect(got.lat).toBeCloseTo(lat, 6);
    expect(got.lon).toBeCloseTo(lon, 6);
  });

  it.each([
    ['https://www.google.com/maps/place/x/@52.0901,5.1203,15z', 52.0901, 5.1203],
    ['https://www.openstreetmap.org/?mlat=44.6&mlon=1.7#map=15/44.6/1.7', 44.6, 1.7],
    ['https://www.openstreetmap.org/#map=17/44.61/1.72', 44.61, 1.72],
  ])('reads a map link %s', (text, lat, lon) => {
    expect(parseLatLon(text)).toEqual({ lat, lon });
  });

  it.each(['', 'Vinkeveen', '95.1, 200.2', `52°75'N 5°E`, '52N 5N', '1.5'])(
    'rejects %s',
    (text) => {
      expect(parseLatLon(text)).toBeNull();
    },
  );
});

describe('coordinate helpers', () => {
  it('validates ranges', () => {
    expect(validLatLon(52, 5)).toBe(true);
    expect(validLatLon(-90, 180)).toBe(true);
    expect(validLatLon(91, 5)).toBe(false);
    expect(validLatLon(52, -181)).toBe(false);
    expect(validLatLon('52', 5)).toBe(false);
    expect(validLatLon(Number.NaN, 5)).toBe(false);
  });

  it('formats and measures', () => {
    expect(formatLatLon(52.09, 5.12)).toBe('52.090000, 5.120000');
    expect(formatLatLon(52.09, 5.12, 3)).toBe('52.090, 5.120');
    const m = metresBetween({ lat: 52, lon: 5 }, { lat: 52.001, lon: 5 });
    expect(m).toBeGreaterThan(110);
    expect(m).toBeLessThan(112);
    expect(formatDistance(120.4)).toBe('120 m');
    expect(formatDistance(3456)).toBe('3.5 km');
    expect(formatDistance(23456)).toBe('23 km');
  });

  it('nudges the pin by a share of the view', () => {
    const at = { lat: 52, lon: 5 };
    const up = nudge(at, 'ArrowUp', 16);
    expect(up.lon).toBe(5);
    expect(up.lat).toBeGreaterThan(52);
    expect(metresBetween(at, up)).toBeGreaterThan(5);
    expect(metresBetween(at, up)).toBeLessThan(50);
    const big = nudge(at, 'ArrowRight', 16, true);
    expect(big.lat).toBe(52);
    expect(metresBetween(at, big)).toBeGreaterThan(metresBetween(at, up) * 5);
    expect(nudge(at, 'ArrowDown', 16).lat).toBeLessThan(52);
    expect(nudge(at, 'ArrowLeft', 16).lon).toBeLessThan(5);
    expect(nudge({ lat: 0, lon: 179.9999 }, 'ArrowRight', 2, true).lon).toBeLessThan(0);
  });
});
