/**
 * A north-up picture of the locator basemap for the map editor's "Trace over the locator map":
 * a hidden MapLibre map on the self-hosted PMTiles renders the frame from `locatorFrame`, and its
 * canvas becomes a data URL once the tiles have drawn. Nothing is stored; the picture is redrawn
 * on demand.
 */
import type { LocatorFrame } from '$lib/core/map/trace.js';
import {
  absoluteTilesBase,
  archiveFor,
  siteFlavor,
  type TileIndex,
} from '$lib/core/map/locator.js';
import { mapWorkerUrl } from '$lib/components/map-worker.js';

export type LocatorImage = { href: string; attribution: string };

export class LocatorImageError extends Error {}

/** Where the tiles live: `urls.tiles('index.json')` and `urls.tilesBase` of the dive log. */
export type TileSource = { indexUrl: string; tilesBase: string };

let protocolAdded = false;

/** Render the locator basemap for `frame`; rejects with a `LocatorImageError` saying why not. */
export async function renderLocatorImage(
  frame: LocatorFrame,
  tiles: TileSource,
  timeoutMs = 20000,
): Promise<LocatorImage> {
  const response = await fetch(tiles.indexUrl, { cache: 'no-cache' }).catch(() => null);
  const index = response?.ok ? ((await response.json()) as TileIndex) : null;
  if (!index) throw new LocatorImageError('The locator tiles are not available');
  const archive = archiveFor(index, frame.center.lat, frame.center.lon);
  if (!archive) throw new LocatorImageError('No locator tiles cover this site');

  const [maplibre, { Protocol }, { layers }] = await Promise.all([
    import('maplibre-gl'),
    import('pmtiles'),
    import('@protomaps/basemaps'),
  ]);
  const workerUrl = mapWorkerUrl();
  if (workerUrl) maplibre.setWorkerUrl(workerUrl);
  if (!protocolAdded) {
    maplibre.addProtocol('pmtiles', new Protocol().tile);
    protocolAdded = true;
  }
  const base = absoluteTilesBase(tiles.tilesBase, location.origin);

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    pointerEvents: 'none',
  });
  document.body.append(host);

  const map = new maplibre.Map({
    container: host,
    style: {
      version: 8,
      sources: {
        protomaps: { type: 'vector', url: `pmtiles://${base}/${archive.file}` },
      },
      layers: layers('protomaps', siteFlavor(), { lang: 'en' }).filter((l) => l.type !== 'symbol'),
    },
    center: [frame.center.lon, frame.center.lat],
    // MapLibre's zoom 0 is a 512 px world, one level deeper than the 256 px tiles the frame's
    // metres-per-pixel assume.
    zoom: frame.zoom - 1,
    pixelRatio: 1,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new LocatorImageError('The locator map took too long to draw')),
        timeoutMs,
      );
      map.once('idle', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return { href: map.getCanvas().toDataURL('image/png'), attribution: index.attribution };
  } finally {
    map.remove();
    host.remove();
  }
}
