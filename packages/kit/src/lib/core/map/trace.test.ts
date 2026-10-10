import { describe, expect, it } from 'vitest';
import {
  drawingToWorld,
  EMPTY_MAP_RADIUS,
  locatorFrame,
  metresPerPixel,
  moveUnderlay,
  rescaleUnderlay,
  rotateUnderlay,
  screenAngle,
  underlayCentre,
  underlayPixel,
  underlayPoint,
  worldToDrawing,
} from './trace.js';
import {
  addNode,
  emptySiteMap,
  placeByBearing,
  type MapUnderlay,
  type SiteMap,
} from '../dive/sitemap.js';

const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

const under: MapUnderlay = { ref: 'scan:x', scale: 0.5, dx: 10, dy: -4, rotation: 30, opacity: 1 };

describe('metres per pixel', () => {
  it('follows 156543.03 · cos(lat) / 2^zoom', () => {
    close(metresPerPixel(0, 0), 156543.03, 2);
    close(metresPerPixel(0, 1), 78271.515, 2);
    close(metresPerPixel(60, 10), (156543.03 * 0.5) / 1024, 6);
  });
});

describe('drawing and world offsets', () => {
  it('agrees with survey shots on a turned drawing', () => {
    const north = 70;
    const shot = placeByBearing(0, 0, 10, 90, north);
    const world = drawingToWorld(shot, north);
    close(world.x, 10, 1);
    close(world.y, 0, 1);
    const back = worldToDrawing(world, north);
    close(back.x, shot.x);
    close(back.y, shot.y);
  });

  it('is the identity on a north-up drawing', () => {
    expect(drawingToWorld({ x: 3, y: 4 }, 0)).toEqual({ x: 3, y: 4 });
  });
});

describe('underlay placement', () => {
  it('maps pixels to the drawing and back', () => {
    const p = underlayPoint(under, { x: 100, y: 40 });
    const px = underlayPixel(under, p);
    close(px.x, 100);
    close(px.y, 40);
    expect(underlayPoint(under, { x: 0, y: 0 })).toEqual({ x: 10, y: -4 });
  });

  it('finds the centre of the image', () => {
    const c = underlayCentre({ ...under, rotation: 0 }, { w: 200, h: 100 });
    expect(c).toEqual({ x: 60, y: 21 });
  });

  it('moves by a drawing offset', () => {
    expect(moveUnderlay(under, 2.5, -1)).toMatchObject({ dx: 12.5, dy: -5 });
  });

  it('scales from two points so they end up the typed distance apart, the first fixed', () => {
    const a = underlayPoint(under, { x: 20, y: 20 });
    const b = underlayPoint(under, { x: 120, y: 20 });
    const next = rescaleUnderlay(under, a, b, 200)!;
    close(next.scale, 2);
    const a2 = underlayPoint(next, { x: 20, y: 20 });
    const b2 = underlayPoint(next, { x: 120, y: 20 });
    close(a2.x, a.x, 2);
    close(a2.y, a.y, 2);
    close(Math.hypot(b2.x - a2.x, b2.y - a2.y), 200, 2);
    expect(next.rotation).toBe(under.rotation);
  });

  it('refuses a scale from one point or a zero distance', () => {
    const a = { x: 1, y: 1 };
    expect(rescaleUnderlay(under, a, a, 10)).toBeNull();
    expect(rescaleUnderlay(under, a, { x: 2, y: 2 }, 0)).toBeNull();
    expect(rescaleUnderlay(under, a, { x: 2, y: 2 }, Number.NaN)).toBeNull();
  });

  it('turns about a pivot that stays put', () => {
    const size = { w: 200, h: 100 };
    const pivot = underlayCentre(under, size);
    const next = rotateUnderlay(under, 75, pivot);
    expect(next.rotation).toBe(75);
    const after = underlayCentre(next, size);
    close(after.x, pivot.x, 1);
    close(after.y, pivot.y, 1);
    expect(rotateUnderlay(under, -90, pivot).rotation).toBe(270);
  });

  it('measures handle angles clockwise from up', () => {
    expect(screenAngle({ x: 0, y: 0 }, { x: 0, y: -5 })).toBe(0);
    close(screenAngle({ x: 0, y: 0 }, { x: 5, y: 0 }), 90);
    close(screenAngle({ x: 0, y: 0 }, { x: 0, y: 5 }), 180);
    close(screenAngle({ x: 0, y: 0 }, { x: -5, y: 0 }), 270);
  });
});

describe('locator frame', () => {
  const origin = { lat: 52, lon: 5 };

  it('needs an origin', () => {
    expect(locatorFrame(emptySiteMap('sitemap'))).toBeNull();
  });

  it('covers the default radius round the origin of an empty map', () => {
    const frame = locatorFrame(emptySiteMap('sitemap', origin))!;
    close(frame.center.lat, 52, 9);
    close(frame.center.lon, 5, 9);
    const covered = frame.width * frame.placement.scale;
    expect(covered).toBeGreaterThanOrEqual(2 * EMPTY_MAP_RADIUS * Math.SQRT2 - 1);
    expect(frame.width).toBeLessThanOrEqual(1600);
    expect(frame.placement.rotation).toBe(-0);
    close(frame.placement.scale, metresPerPixel(frame.center.lat, frame.zoom));
  });

  it('puts the origin where its own pixel is, so no aligning is needed', () => {
    const frame = locatorFrame(emptySiteMap('sitemap', origin), { zoom: 17 })!;
    expect(frame.zoom).toBe(17);
    const u: MapUnderlay = { ref: '', opacity: 1, ...frame.placement };
    const pixel = underlayPixel(u, { x: 0, y: 0 });
    close(pixel.x, frame.width / 2, 3);
    close(pixel.y, frame.height / 2, 3);
  });

  it('centres on the drawing and turns with north', () => {
    let map: SiteMap = { ...emptySiteMap('sitemap', origin), north: 90 };
    map = addNode(map, 400, 0).map;
    map = addNode(map, 600, 0).map;
    const frame = locatorFrame(map)!;
    expect(frame.placement.rotation).toBe(-90);
    expect(frame.center.lat).toBeLessThan(52);
    close(frame.center.lon, 5, 9);
    const u: MapUnderlay = { ref: '', opacity: 1, ...frame.placement };
    const mid = underlayPoint(u, { x: frame.width / 2, y: frame.height / 2 });
    close(mid.x, 500, 3);
    close(mid.y, 0, 3);
  });

  it('keeps the zoom in range and the picture a sane size', () => {
    const map = emptySiteMap('sitemap', origin);
    expect(locatorFrame(map, { zoom: 30 })!.zoom).toBe(19);
    expect(locatorFrame(map, { zoom: 2 })!.zoom).toBe(10);
    expect(locatorFrame(map, { zoom: 10 })!.width).toBe(64);
  });
});
