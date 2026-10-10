import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapSite } from '$lib/core/dive/types.js';

type Handler = (...args: unknown[]) => unknown;

/** The fake MapLibre map the globe draws on: records calls, answers the camera questions. */
const fake = vi.hoisted(() => {
  const state = {
    instance: null as null | {
      handlers: { event: string; layer: string | null; fn: (...a: unknown[]) => unknown }[];
      easeTo: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      emit: (event: string, layer?: string | null, arg?: unknown) => void;
    },
    bounds: [-180, -90, 180, 90] as [number, number, number, number],
    features: [] as unknown[],
  };
  return state;
});

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false }));
vi.mock('$lib/components/map-worker', () => ({ mapWorkerUrl: () => null }));
vi.mock('pmtiles', () => ({
  Protocol: class {
    tile = () => Promise.resolve({ data: new Uint8Array() });
  },
}));
vi.mock('@protomaps/basemaps', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  layers: () => [],
}));
vi.mock('maplibre-gl', () => {
  class Control {
    on() {}
    onAdd() {
      return document.createElement('div');
    }
    onRemove() {}
  }
  class FakeMap {
    handlers: { event: string; layer: string | null; fn: Handler }[] = [];
    canvas = document.createElement('canvas');
    cooperativeGestures = { enable() {}, disable() {} };
    easeTo = vi.fn();
    stop = vi.fn();
    flyTo = vi.fn();
    fitBounds = vi.fn();
    jumpTo = vi.fn();
    remove = vi.fn();
    constructor(options: { container: HTMLElement }) {
      options.container.append(this.canvas);
      fake.instance = this as never;
    }
    on(event: string, layerOrFn: string | Handler, fn?: Handler) {
      if (typeof layerOrFn === 'function')
        this.handlers.push({ event, layer: null, fn: layerOrFn });
      else this.handlers.push({ event, layer: layerOrFn, fn: fn! });
    }
    emit(event: string, layer: string | null = null, arg?: unknown) {
      for (const h of this.handlers) if (h.event === event && h.layer === layer) h.fn(arg);
    }
    addControl() {}
    addSource() {}
    addLayer() {}
    setLayoutProperty() {}
    getSource() {
      return { setData() {} };
    }
    getCanvas() {
      return this.canvas;
    }
    getBounds() {
      const [w, s, e, n] = fake.bounds;
      return {
        contains: ([lon, lat]: [number, number]) => lon >= w && lon <= e && lat >= s && lat <= n,
      };
    }
    getCenter() {
      return { lng: 0, lat: 20 };
    }
    getZoom() {
      return 1.5;
    }
    getBearing() {
      return 0;
    }
    getPitch() {
      return 0;
    }
    queryRenderedFeatures() {
      return fake.features;
    }
  }
  return {
    Map: FakeMap,
    NavigationControl: Control,
    FullscreenControl: Control,
    ScaleControl: Control,
    setWorkerUrl() {},
    addProtocol() {},
  };
});

import DiveGlobe from './DiveGlobe.svelte';
import { render, settle } from '$lib/components/ui/__fixtures__/test-utils.js';

function site(slug: string, name: string, lon: number, lat: number, dives: number): MapSite {
  return {
    slug,
    name,
    country_code: 'NL',
    lat,
    lon,
    dives,
    minutes: dives * 50,
    site_type: 'lake',
    max_depth_m: 20,
    first_year: 2020,
    last_year: 2024,
  } as unknown as MapSite;
}

const SITES = [
  site('vinkeveen', 'Vinkeveen', 4.9, 52.2, 40),
  site('zeelandbrug', 'Zeelandbrug', 3.9, 51.6, 12),
  site('tortuga', 'Tortuga', -87.3, 20.5, 3),
];

let reduced = false;
const cleanups: (() => void)[] = [];

beforeEach(() => {
  reduced = false;
  fake.instance = null;
  fake.bounds = [-180, -90, 180, 90];
  fake.features = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('reduce') ? reduced : false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ world: { file: 'world.pmtiles' }, archives: [] })),
    ),
  );
});

afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
  vi.unstubAllGlobals();
});

async function globe(props: Record<string, unknown> = {}) {
  const view = render(DiveGlobe, { sites: SITES, ...props } as never);
  cleanups.push(view.destroy);
  await vi.waitFor(() => expect(fake.instance).not.toBeNull());
  fake.instance!.emit('load');
  await settle();
  return view.target;
}

const button = (root: HTMLElement, name: string | RegExp) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''),
  );

describe('DiveGlobe (with a fake globe)', () => {
  it('lists the sites in view, most dived first, and follows the camera', async () => {
    const target = await globe();
    const list = target.querySelector('details.in-view')!;
    expect(list.querySelector('summary')?.textContent).toContain('Sites in view');
    const names = () =>
      [...list.querySelectorAll('.in-view-site')].map((b) =>
        b.textContent
          ?.replace(/^\S+\s+/, '')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    expect(names()).toEqual(['Vinkeveen 40 dives', 'Zeelandbrug 12 dives', 'Tortuga 3 dives']);
    fake.bounds = [0, 40, 10, 60];
    fake.instance!.emit('moveend');
    await settle();
    expect(names()).toEqual(['Vinkeveen 40 dives', 'Zeelandbrug 12 dives']);
    fake.bounds = [100, -10, 120, 10];
    fake.instance!.emit('moveend');
    await settle();
    expect(list.textContent).toContain('No dive sites in view');
  });

  it('names the canvas and points it at the list', async () => {
    const target = await globe();
    const canvas = target.querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toContain('Globe of 3 dive sites');
  });

  it('spins until paused, and the pause control says so', async () => {
    const target = await globe();
    const pause = button(target, 'Pause rotation')!;
    expect(pause.getAttribute('aria-pressed')).toBe('false');
    expect(fake.instance!.easeTo).toHaveBeenCalledTimes(1);
    pause.click();
    await settle();
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    expect(fake.instance!.stop).toHaveBeenCalled();
    fake.instance!.easeTo.mockClear();
    fake.instance!.emit('moveend');
    expect(fake.instance!.easeTo).not.toHaveBeenCalled();
    pause.click();
    await settle();
    expect(pause.getAttribute('aria-pressed')).toBe('false');
    expect(fake.instance!.easeTo).toHaveBeenCalledTimes(1);
  });

  it('has no pause control with reduced motion, and never spins', async () => {
    reduced = true;
    const target = await globe();
    expect(button(target, 'Pause rotation')).toBeUndefined();
    expect(fake.instance!.easeTo).not.toHaveBeenCalled();
  });

  it('opens a popup with focus from the list, and Escape returns focus to the opener', async () => {
    const target = await globe();
    const opener = button(target, /Zeelandbrug/)!;
    opener.focus();
    opener.click();
    await settle();
    const popup = target.querySelector<HTMLElement>('.popup[role="dialog"]')!;
    expect(popup.getAttribute('aria-label')).toBe('Zeelandbrug');
    expect(document.activeElement).toBe(popup);
    expect(opener.getAttribute('aria-pressed')).toBe('true');
    expect(popup.querySelector('a')?.getAttribute('href')).toBe('/dive/sites/zeelandbrug');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(target.querySelector('.popup')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps the hover tooltip out of the accessibility tree', async () => {
    const target = await globe();
    expect(target.querySelector('.tooltip')?.getAttribute('aria-hidden')).toBe('true');
    expect(target.querySelector('.tooltip')?.getAttribute('aria-live')).toBeNull();
  });
});
