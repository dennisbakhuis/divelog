import { describe, expect, it } from 'vitest';
import { landPath, MAP_HEIGHT, MAP_WIDTH, project, spherePath } from './world.js';

describe('world map', () => {
  it('projects the land outline once', () => {
    expect(landPath.length).toBeGreaterThan(10_000);
    expect(spherePath.startsWith('M')).toBe(true);
  });

  it('projects coordinates inside the viewport', () => {
    const amsterdam = project(4.9, 52.37);
    expect(amsterdam).not.toBeNull();
    expect(amsterdam!.x).toBeGreaterThan(MAP_WIDTH * 0.45);
    expect(amsterdam!.x).toBeLessThan(MAP_WIDTH * 0.6);
    expect(amsterdam!.y).toBeGreaterThan(0);
    expect(amsterdam!.y).toBeLessThan(MAP_HEIGHT * 0.4);
    const sydney = project(151.2, -33.9);
    expect(sydney!.x).toBeGreaterThan(amsterdam!.x);
    expect(sydney!.y).toBeGreaterThan(amsterdam!.y);
  });
});

describe('region maps', () => {
  it('fits a padded box of the panel shape around the points', async () => {
    const { fitBBox } = await import('./world.js');
    expect(fitBBox([], 2)).toBeNull();
    const [w, s, e, n] = fitBBox(
      [
        { lon: 1.5, lat: 44.5 },
        { lon: 1.9, lat: 44.9 },
      ],
      16 / 9,
    )!;
    expect(w).toBeLessThan(1.5);
    expect(e).toBeGreaterThan(1.9);
    expect(s).toBeLessThan(44.5);
    expect(n).toBeGreaterThan(44.9);
    const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    expect((((e - w) * Math.PI) / 180 / (y(n) - y(s))).toFixed(3)).toBe((16 / 9).toFixed(3));
  });

  it('gives a single site some room', async () => {
    const { fitBBox } = await import('./world.js');
    const [w, , e] = fitBBox([{ lon: 32.68, lat: -27.49 }], 1)!;
    expect(e - w).toBeGreaterThanOrEqual(0.2);
  });

  it('draws small islands with the detailed coastline', async () => {
    const { makeRegionMap } = await import('./world.js');
    const bonaire = await makeRegionMap('bonaire', 'Bonaire', [
      { lon: -68.32, lat: 12.21 },
      { lon: -68.28, lat: 12.1 },
    ]);
    expect(bonaire!.landPath.length).toBeGreaterThan(100);
    const kralendijk = bonaire!.project(-68.27, 12.15)!;
    expect(kralendijk.x).toBeGreaterThan(0);
    expect(kralendijk.x).toBeLessThan(bonaire!.width);
  });
});
