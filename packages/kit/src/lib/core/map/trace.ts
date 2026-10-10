/**
 * Tracing aids for the map editor: where an underlay image sits on the drawing, how to move,
 * scale and turn it by hand, and a north-up picture of the locator basemap placed at the map's
 * origin so it needs no alignment at all.
 *
 * An underlay is drawn as `translate(dx dy) rotate(rotation) scale(scale)` applied to image
 * pixels: drawing point = (dx, dy) + R(rotation) · scale · pixel. Drawing coordinates are metres,
 * x to the right and y down; "up" points to the map's `north` bearing.
 */
import type { MapOrigin, MapPoint, MapUnderlay, SiteMap } from '../dive/sitemap.js';
import { mapBounds } from '../dive/sitemap.js';

/** Ground metres per CSS pixel of a Web Mercator map at a latitude and zoom. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

const METRES_PER_DEGREE = 111320;

function rotate(p: MapPoint, degrees: number): MapPoint {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** A drawing offset as metres east and south, on a drawing whose top points to `north`. */
export function drawingToWorld(p: MapPoint, north: number): MapPoint {
  return rotate(p, north);
}

/** Metres east and south as a drawing offset, on a drawing whose top points to `north`. */
export function worldToDrawing(p: MapPoint, north: number): MapPoint {
  return rotate(p, -north);
}

/** Where an image pixel of the underlay lands on the drawing. */
export function underlayPoint(u: MapUnderlay, pixel: MapPoint): MapPoint {
  const r = rotate({ x: pixel.x * u.scale, y: pixel.y * u.scale }, u.rotation);
  return { x: u.dx + r.x, y: u.dy + r.y };
}

/** The image pixel of the underlay under a drawing point. */
export function underlayPixel(u: MapUnderlay, point: MapPoint): MapPoint {
  const r = rotate({ x: point.x - u.dx, y: point.y - u.dy }, -u.rotation);
  return { x: r.x / u.scale, y: r.y / u.scale };
}

/** The middle of an underlay image of `size` pixels, on the drawing. */
export function underlayCentre(u: MapUnderlay, size: { w: number; h: number }): MapPoint {
  return underlayPoint(u, { x: size.w / 2, y: size.h / 2 });
}

/** Shift an underlay by a drawing offset. */
export function moveUnderlay(u: MapUnderlay, dx: number, dy: number): MapUnderlay {
  return { ...u, dx: round(u.dx + dx, 100), dy: round(u.dy + dy, 100) };
}

/**
 * Scale an underlay so two points clicked on it are `distance` metres apart; the first point
 * stays where it is. Null when the points coincide or the distance is not positive.
 */
export function rescaleUnderlay(
  u: MapUnderlay,
  a: MapPoint,
  b: MapPoint,
  distance: number,
): MapUnderlay | null {
  const drawn = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(drawn > 0) || !(distance > 0)) return null;
  const scale = u.scale * (distance / drawn);
  const pixel = underlayPixel(u, a);
  const r = rotate({ x: pixel.x * scale, y: pixel.y * scale }, u.rotation);
  return { ...u, scale: round(scale, 1e6), dx: round(a.x - r.x, 100), dy: round(a.y - r.y, 100) };
}

/** Turn an underlay to `rotation` degrees about a drawing point that stays where it is. */
export function rotateUnderlay(u: MapUnderlay, rotation: number, pivot: MapPoint): MapUnderlay {
  const pixel = underlayPixel(u, pivot);
  const next = { ...u, rotation: round(((rotation % 360) + 360) % 360, 10) };
  const r = rotate({ x: pixel.x * u.scale, y: pixel.y * u.scale }, next.rotation);
  return { ...next, dx: round(pivot.x - r.x, 100), dy: round(pivot.y - r.y, 100) };
}

/** The bearing in degrees (0 up, clockwise) from `from` to `to` on the drawing. */
export function screenAngle(from: MapPoint, to: MapPoint): number {
  const deg = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function round(value: number, factor: number): number {
  return Math.round(value * factor) / factor + 0;
}

/** What to render for a locator underlay and where the picture goes on the drawing. */
export type LocatorFrame = {
  center: MapOrigin;
  zoom: number;
  width: number;
  height: number;
  placement: Omit<MapUnderlay, 'ref' | 'opacity'>;
};

/** Metres around the origin a locator picture covers on a map that has nothing drawn yet. */
export const EMPTY_MAP_RADIUS = 200;

/**
 * The locator picture for a map: a north-up square that covers the drawing (or
 * `EMPTY_MAP_RADIUS` round the origin of an empty map) at the deepest zoom that keeps it within
 * `maxPx` pixels, or at `zoom` when given. Null without an origin.
 */
export function locatorFrame(
  map: SiteMap,
  options: { zoom?: number; maxPx?: number; minZoom?: number; maxZoom?: number } = {},
): LocatorFrame | null {
  if (!map.origin) return null;
  const { maxPx = 1600, minZoom = 10, maxZoom = 19 } = options;
  const empty = !map.nodes.length && !map.lines.length && !map.areas.length;
  const box = empty
    ? {
        minX: -EMPTY_MAP_RADIUS,
        minY: -EMPTY_MAP_RADIUS,
        maxX: EMPTY_MAP_RADIUS,
        maxY: EMPTY_MAP_RADIUS,
      }
    : mapBounds(map, 30);
  const mid = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const half = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) / 2;
  const world = drawingToWorld(mid, map.north);
  const lat0 = map.origin.lat;
  const center = {
    lat: lat0 - world.y / METRES_PER_DEGREE,
    lon: map.origin.lon + world.x / (METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180)),
  };
  const fit = Math.floor(Math.log2((metresPerPixel(center.lat, 0) * maxPx) / (2 * half)));
  const zoom = Math.min(maxZoom, Math.max(minZoom, options.zoom ?? fit));
  const mpp = metresPerPixel(center.lat, zoom);
  const side = Math.max(64, Math.min(4096, Math.ceil((2 * half) / mpp)));
  const corner = worldToDrawing(
    { x: world.x - (side / 2) * mpp, y: world.y - (side / 2) * mpp },
    map.north,
  );
  return {
    center,
    zoom,
    width: side,
    height: side,
    placement: { scale: mpp, dx: corner.x, dy: corner.y, rotation: -map.north },
  };
}
