import { afterEach, describe, expect, it, vi } from 'vitest';

const ml = vi.hoisted(() => {
  const state = {
    options: null as Record<string, unknown> | null,
    removed: 0,
    idle: true,
    worker: '' as string,
    protocols: 0,
  };
  class FakeMap {
    constructor(options: Record<string, unknown>) {
      state.options = options;
    }
    once(event: string, cb: () => void) {
      if (event === 'idle' && state.idle) setTimeout(cb, 0);
    }
    getCanvas() {
      return { toDataURL: () => 'data:image/png;base64,AAAA' };
    }
    remove() {
      state.removed += 1;
    }
  }
  return {
    state,
    module: {
      Map: FakeMap,
      setWorkerUrl: (url: string) => (state.worker = url),
      addProtocol: () => (state.protocols += 1),
    },
  };
});

vi.mock('maplibre-gl', () => ml.module);
vi.mock('pmtiles', () => ({
  Protocol: class {
    tile = () => {};
  },
}));
vi.mock('@protomaps/basemaps', async (original) => ({
  ...(await original<typeof import('@protomaps/basemaps')>()),
  layers: () => [
    { id: 'water', type: 'fill' },
    { id: 'roads', type: 'line' },
    { id: 'places', type: 'symbol' },
  ],
}));

import { renderLocatorImage, LocatorImageError } from './locator-image.js';
import { setMapWorkerUrl } from '$lib/components/map-worker.js';
import type { LocatorFrame } from '$lib/core/map/trace.js';

const frame: LocatorFrame = {
  center: { lat: 52.1, lon: 5.1 },
  zoom: 17,
  width: 800,
  height: 800,
  placement: { scale: 0.73, dx: -292, dy: -292, rotation: 0 },
};

const tiles = { indexUrl: '/media/tiles/index.json', tilesBase: '/media/tiles' };

function index(archives: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ attribution: '© OSM', archives }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  ml.state.idle = true;
  ml.state.options = null;
  document.body.innerHTML = '';
});

describe('renderLocatorImage', () => {
  it('draws the frame without labels and hands back a data URL', async () => {
    index([{ file: 'nl.pmtiles', bbox: [3, 50, 8, 54], maxzoom: 15 }]);
    setMapWorkerUrl('/worker.js');
    const image = await renderLocatorImage(frame, tiles);
    expect(image).toEqual({ href: 'data:image/png;base64,AAAA', attribution: '© OSM' });
    const options = ml.state.options!;
    expect(options.zoom).toBe(16);
    expect(options.center).toEqual([5.1, 52.1]);
    expect(options.pixelRatio).toBe(1);
    expect(options.interactive).toBe(false);
    const style = options.style as {
      layers: { type: string }[];
      sources: Record<string, { url: string }>;
    };
    expect(style.layers.map((l) => l.type)).toEqual(['fill', 'line']);
    expect(style.sources.protomaps.url).toBe(`pmtiles://${location.origin}/media/tiles/nl.pmtiles`);
    expect(ml.state.worker).toBe('/worker.js');
    expect(ml.state.removed).toBeGreaterThan(0);
    expect(document.body.children).toHaveLength(0);
    await renderLocatorImage(frame, tiles);
    expect(ml.state.protocols).toBe(1);
  });

  it('says so when no archive covers the site', async () => {
    index([{ file: 'eg.pmtiles', bbox: [30, 20, 36, 30], maxzoom: 15 }]);
    await expect(renderLocatorImage(frame, tiles)).rejects.toThrow(
      'No locator tiles cover this site',
    );
  });

  it('says so when the tile index is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    await expect(renderLocatorImage(frame, tiles)).rejects.toBeInstanceOf(LocatorImageError);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    await expect(renderLocatorImage(frame, tiles)).rejects.toThrow('not available');
  });

  it('gives up when the map never settles', async () => {
    index([{ file: 'nl.pmtiles', bbox: [3, 50, 8, 54], maxzoom: 15 }]);
    ml.state.idle = false;
    await expect(renderLocatorImage(frame, tiles, 10)).rejects.toThrow('took too long');
    expect(document.body.children).toHaveLength(0);
  });
});
