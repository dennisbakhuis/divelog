import { describe, expect, it } from 'vitest';
import {
  absoluteTilesBase,
  archiveFor,
  archiveForTile,
  detailMaxZoom,
  minZoomFor,
  startZoom,
  tileBounds,
  type TileIndex,
} from './locator';

const index: TileIndex = {
  attribution: '© OpenStreetMap contributors · Protomaps',
  archives: [
    { file: 'benelux.pmtiles', bbox: [3.5, 50.4, 7.0, 52.9], maxzoom: 14 },
    { file: 'zeeland.pmtiles', bbox: [3.6, 51.4, 4.2, 51.8], maxzoom: 15 },
    { file: 'bonaire.pmtiles', bbox: [-68.5, 11.9, -68.1, 12.4], maxzoom: 15 },
  ],
};

describe('archiveFor', () => {
  it('prefers the smallest archive that contains the point', () => {
    expect(archiveFor(index, 51.6, 3.9)?.file).toBe('zeeland.pmtiles');
    expect(archiveFor(index, 52.3, 6.6)?.file).toBe('benelux.pmtiles');
    expect(archiveFor(index, 12.1, -68.3)?.file).toBe('bonaire.pmtiles');
  });

  it('returns null for a point outside every archive', () => {
    expect(archiveFor(index, 27.8, 33.9)).toBeNull();
  });
});

describe('archiveForTile', () => {
  it('maps a tile to lon/lat bounds', () => {
    expect(tileBounds(0, 0, 0)).toEqual([
      -180,
      expect.closeTo(-85.05, 1),
      180,
      expect.closeTo(85.05, 1),
    ]);
    const [w, s, e, n] = tileBounds(8, 130, 85);
    expect(w).toBeCloseTo(2.81, 1);
    expect(e).toBeCloseTo(4.22, 1);
    expect(s).toBeCloseTo(50.74, 1);
    expect(n).toBeCloseTo(51.62, 1);
  });

  it('picks the smallest archive overlapping the tile that reaches its zoom', () => {
    expect(archiveForTile(index, 8, 130, 85)?.file).toBe('zeeland.pmtiles');
    expect(archiveForTile(index, 8, 131, 85)?.file).toBe('benelux.pmtiles');
    expect(archiveForTile(index, 15, 16738, 10883)?.file).toBe('zeeland.pmtiles');
    expect(archiveForTile(index, 15, 16900, 10800)).toBeNull();
    expect(archiveForTile(index, 8, 151, 103)).toBeNull();
    expect(detailMaxZoom(index)).toBe(14);
    expect(detailMaxZoom({ ...index, archives: [] })).toBe(0);
  });
});

describe('startZoom', () => {
  it('goes closer for small enclosed sites and wider for open water', () => {
    expect(startZoom('pool')).toBeGreaterThan(startZoom('cave'));
    expect(startZoom('cave')).toBeGreaterThan(startZoom('lake'));
    expect(startZoom('lake')).toBeGreaterThan(startZoom('wreck'));
    expect(startZoom('something new')).toBe(14);
  });
});

describe('minZoomFor', () => {
  it('lets a small archive zoom out less than a large one, within limits', () => {
    expect(minZoomFor([3.5, 50.4, 7.0, 52.9])).toBe(6);
    expect(minZoomFor([-68.5, 11.9, -68.1, 12.4])).toBe(9);
    expect(minZoomFor([0, 0, 0.0001, 0.0001])).toBe(12);
    expect(minZoomFor([-180, -85, 180, 85])).toBe(3);
  });
});

describe('absoluteTilesBase', () => {
  it('prefixes a site-relative base with the origin', () => {
    expect(absoluteTilesBase('/media/tiles', 'http://localhost:5373')).toBe(
      'http://localhost:5373/media/tiles',
    );
  });

  it('keeps an absolute base', () => {
    expect(absoluteTilesBase('https://tiles.example.org', 'http://localhost')).toBe(
      'https://tiles.example.org',
    );
  });
});
