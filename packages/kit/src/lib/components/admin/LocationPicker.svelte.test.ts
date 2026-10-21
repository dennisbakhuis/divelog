import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import type { PickedPoint } from '$lib/core/admin/site-create.js';

type Handler = (...args: unknown[]) => unknown;

/** The fake MapLibre the picker draws on once WebGL is stubbed in: records the camera calls. */
const fake = vi.hoisted(() => ({
  map: null as null | {
    canvas: HTMLCanvasElement;
    controls: HTMLElement;
    moving: boolean;
    easeTo: ReturnType<typeof vi.fn>;
    fitBounds: ReturnType<typeof vi.fn>;
    emit: (event: string, arg?: unknown) => void;
  },
  markers: [] as { element: HTMLElement; lngLat: [number, number] }[],
  bounds: [-20, -20, 20, 20] as [number, number, number, number],
  countryBounds: null as null | (() => Promise<[number, number, number, number] | null>),
  outlines: null as null | (() => Promise<unknown[]>),
}));

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
vi.mock('$lib/core/map/countries', async (importOriginal) => {
  const real = await importOriginal<typeof import('$lib/core/map/countries')>();
  return {
    ...real,
    countryBounds: (iso3: string) =>
      fake.countryBounds ? fake.countryBounds() : real.countryBounds(iso3),
    loadCountries: () => (fake.outlines ? fake.outlines() : real.loadCountries()),
  };
});
vi.mock('maplibre-gl', () => {
  class Control {}
  class FakeMap {
    handlers: { event: string; fn: Handler }[] = [];
    canvas = document.createElement('canvas');
    controls = document.createElement('button');
    container: HTMLElement;
    moving = false;
    zoom: number;
    easeTo = vi.fn(() => {
      this.moving = true;
    });
    fitBounds = vi.fn();
    remove = vi.fn();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    panBy = vi.fn();
    constructor(options: { container: HTMLElement; zoom: number }) {
      this.container = options.container;
      this.zoom = options.zoom;
      this.canvas.tabIndex = 0;
      options.container.append(this.canvas, this.controls);
      fake.map = this as never;
    }
    on(event: string, fn: Handler) {
      this.handlers.push({ event, fn });
    }
    emit(event: string, arg?: unknown) {
      for (const h of this.handlers) if (h.event === event) h.fn(arg);
    }
    addControl() {}
    isMoving() {
      return this.moving;
    }
    getCanvas() {
      return this.canvas;
    }
    getCanvasContainer() {
      return this.container;
    }
    getContainer() {
      return this.container;
    }
    getBounds() {
      const [w, s, e, n] = fake.bounds;
      return {
        getWest: () => w,
        getSouth: () => s,
        getEast: () => e,
        getNorth: () => n,
        contains: ([lon, lat]: [number, number]) => lon >= w && lon <= e && lat >= s && lat <= n,
      };
    }
    getCenter() {
      return { lng: 5.12, lat: 52.09 };
    }
    getZoom() {
      return this.zoom;
    }
  }
  class Marker {
    element: HTMLElement;
    lngLat: [number, number] = [0, 0];
    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
      fake.markers.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
    getLngLat() {
      return { lng: this.lngLat[0], lat: this.lngLat[1] };
    }
    addTo(map: { container: HTMLElement }) {
      map.container.append(this.element);
      return this;
    }
    on() {
      return this;
    }
    remove() {}
  }
  return {
    Map: FakeMap,
    Marker,
    NavigationControl: Control,
    ScaleControl: Control,
    setWorkerUrl() {},
    addProtocol() {},
  };
});

import LocationPicker from './LocationPicker.svelte';

function render(props: Record<string, unknown> = {}) {
  const onchange = vi.fn<(p: PickedPoint) => void>();
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(LocationPicker, {
    target,
    props: { onchange, label: 'Coordinates', ...props },
  });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('input[type="text"]')!;
  return { target, app, onchange, input };
}

function paste(input: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  input.dispatchEvent(event);
  flushSync();
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

const enter = (el: HTMLElement) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flushSync();
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LocationPicker without WebGL', () => {
  it('falls back to the coordinates field, labelled and described', () => {
    const { target, app, input } = render();
    expect(target.textContent).toContain('The map is not available in this browser');
    const label = target.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toBe('Coordinates');
    expect(input.getAttribute('aria-describedby')).toContain('-hint');
    unmount(app);
  });

  it('reads a pasted position in degrees, minutes and seconds', () => {
    const { app, input, onchange } = render();
    paste(input, `52°05'24"N 5°07'12"E`);
    expect(onchange).toHaveBeenCalledTimes(1);
    const got = onchange.mock.calls[0][0];
    expect(got.source).toBe('paste');
    expect(got.lat).toBeCloseTo(52.09, 6);
    expect(got.lon).toBeCloseTo(5.12, 6);
    expect(input.value).toBe('52.090000, 5.120000');
    unmount(app);
  });

  it('reads a typed position on Enter, in either order', () => {
    const { app, input, onchange } = render();
    type(input, '-68.28 W, 12.15 N');
    enter(input);
    expect(onchange).toHaveBeenLastCalledWith({ lat: 12.15, lon: -68.28, source: 'paste' });
    unmount(app);
  });

  it('flags text that is not a position and emits nothing', () => {
    const { target, app, input, onchange } = render();
    type(input, 'somewhere nice');
    enter(input);
    expect(onchange).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const errorId = input.getAttribute('aria-describedby')!.split(' ')[0];
    expect(target.querySelector(`#${errorId}`)?.textContent).toContain('Not a position');
    paste(input, 'just words');
    expect(onchange).not.toHaveBeenCalled();
    unmount(app);
  });

  it('shows a server error passed in', () => {
    const { target, app, input } = render({ error: 'Latitude out of range' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(target.textContent).toContain('Latitude out of range');
    unmount(app);
  });

  it('follows the value it is given', async () => {
    const props = $state({ value: null as { lat: number; lon: number } | null });
    const onchange = vi.fn();
    const target = document.createElement('div');
    const app = mount(LocationPicker, {
      target,
      props: {
        get value() {
          return props.value;
        },
        onchange,
      },
    });
    flushSync();
    const input = target.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(input.value).toBe('');
    props.value = { lat: 44.6, lon: 1.7 };
    flushSync();
    await tick();
    expect(input.value).toBe('44.600000, 1.700000');
    unmount(app);
  });

  it('uses the device location', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 20.2123456, longitude: -87.4654321 } } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    const { target, app, onchange } = render();
    const button = [...target.querySelectorAll('button')].find(
      (b) => b.textContent === 'Use my location',
    )!;
    button.click();
    flushSync();
    expect(button.textContent).toBe('Locating…');
    await vi.waitFor(() =>
      expect(onchange).toHaveBeenCalledWith({
        lat: 20.212346,
        lon: -87.465432,
        source: 'geolocation',
      }),
    );
    flushSync();
    expect(button.textContent).toBe('Use my location');
    unmount(app);
  });

  it('keeps a rough device fix but says how rough it is', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({
        coords: { latitude: 53.69, longitude: 9.15, accuracy: 350 },
      } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    const { target, app, onchange, input } = render();
    [...target.querySelectorAll('button')]
      .find((b) => b.textContent === 'Use my location')!
      .click();
    await vi.waitFor(() => expect(onchange).toHaveBeenCalled());
    flushSync();
    expect(onchange).toHaveBeenCalledWith({ lat: 53.69, lon: 9.15, source: 'geolocation' });
    const notice = target.querySelector('.dl-picker-notice')!;
    expect(notice.textContent).toContain('within about 350 m');
    expect(input.getAttribute('aria-describedby')).toContain(notice.id);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    paste(input, '53.6901, 9.1502');
    expect(target.querySelector('.dl-picker-notice')).toBeNull();
    unmount(app);
  });

  it('says so when location access is refused', async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    const { target, app, onchange } = render();
    [...target.querySelectorAll('button')]
      .find((b) => b.textContent === 'Use my location')!
      .click();
    await vi.waitFor(() => {
      flushSync();
      expect(target.textContent).toContain(
        'Location access was refused; tap the map or paste the position instead.',
      );
    });
    expect(onchange).not.toHaveBeenCalled();
    unmount(app);
  });
});

describe('LocationPicker with a map', () => {
  const loseContext = vi.fn();

  function withWebgl() {
    loseContext.mockClear();
    fake.map = null;
    fake.markers = [];
    fake.bounds = [-20, -20, 20, 20];
    fake.countryBounds = null;
    fake.outlines = null;
    vi.stubGlobal('WebGLRenderingContext', class {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null),
        }) as never,
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ world: { file: 'world.pmtiles' }, archives: [] })),
      ),
    );
  }

  async function mapped(props: Record<string, unknown> = {}, load = true) {
    withWebgl();
    const values = $state({ value: (props.value ?? null) as { lat: number; lon: number } | null });
    const onchange = vi.fn((p: PickedPoint) => (values.value = { lat: p.lat, lon: p.lon }));
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(LocationPicker, {
      target,
      props: {
        ...props,
        label: 'Coordinates',
        onchange,
        get value() {
          return values.value;
        },
      },
    });
    await vi.waitFor(() => expect(fake.map).not.toBeNull());
    if (load) fake.map!.emit('load');
    flushSync();
    await tick();
    const input = target.querySelector<HTMLInputElement>('input[type="text"]')!;
    return { target, app, onchange, input, values, map: fake.map! };
  }

  it('probes WebGL without keeping the context', async () => {
    const { app } = await mapped();
    expect(loseContext).toHaveBeenCalledTimes(1);
    unmount(app);
  });

  it('puts a draggable pin where the paste says', async () => {
    const { app, input } = await mapped();
    paste(input, '52.09, 5.12');
    await tick();
    const pin = fake.markers.at(-1)!.element;
    expect(pin.className).toBe('picker-pin');
    expect(fake.markers.at(-1)!.lngLat).toEqual([5.12, 52.09]);
    unmount(app);
  });

  it('keeps the zoom of a paste: the pin does not recentre a moving map', async () => {
    const { app, input, map } = await mapped();
    fake.bounds = [100, -10, 120, 10];
    paste(input, '52.09, 5.12');
    await tick();
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    expect(map.easeTo.mock.calls[0][0]).toMatchObject({ center: [5.12, 52.09] });
    expect(map.easeTo.mock.calls[0][0].zoom).toBeGreaterThan(1.2);
    unmount(app);
  });

  it('recentres on a pin out of view, but not on one shown across the antimeridian', async () => {
    const { app, values, map } = await mapped();
    fake.bounds = [170, -25, 190, -10];
    values.value = { lat: -17.8, lon: -178.4 };
    flushSync();
    await tick();
    expect(map.easeTo).not.toHaveBeenCalled();
    values.value = { lat: -17.8, lon: 150 };
    flushSync();
    await tick();
    expect(map.easeTo).toHaveBeenCalledWith({ center: [150, -17.8] });
    unmount(app);
  });

  it('frames the country while nothing is placed', async () => {
    const { app, map } = await mapped({ country: 'NLD' }, false);
    fake.countryBounds = async () => [3.3, 50.7, 7.2, 53.5];
    map.emit('load');
    flushSync();
    await vi.waitFor(() => expect(map.fitBounds).toHaveBeenCalledTimes(1));
    unmount(app);
  });

  it('does not frame the country when it starts near the last site', async () => {
    const { app, map } = await mapped({ country: 'NLD', near: { lat: 53.69, lon: 9.15 } }, false);
    fake.countryBounds = async () => [3.3, 50.7, 7.2, 53.5];
    map.emit('load');
    flushSync();
    await new Promise((r) => setTimeout(r, 20));
    expect(map.fitBounds).not.toHaveBeenCalled();
    unmount(app);
  });

  it('drops the country frame when a pin is placed while the outlines load', async () => {
    const { app, input, map } = await mapped({ country: 'NLD' }, false);
    let release: (b: [number, number, number, number]) => void = () => {};
    fake.countryBounds = () => new Promise((r) => (release = r));
    map.emit('load');
    flushSync();
    await tick();
    paste(input, '52.09, 5.12');
    release([3.3, 50.7, 7.2, 53.5]);
    await new Promise((r) => setTimeout(r, 20));
    expect(map.fitBounds).not.toHaveBeenCalled();
    unmount(app);
  });

  it('takes map keys from the canvas only, not from the zoom buttons', async () => {
    const { app, onchange, map } = await mapped();
    const press = (el: HTMLElement, key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      flushSync();
      return event;
    };
    expect(press(map.controls, 'Enter').defaultPrevented).toBe(false);
    expect(press(map.controls, '+').defaultPrevented).toBe(false);
    expect(onchange).not.toHaveBeenCalled();
    expect(press(map.canvas, 'Enter').defaultPrevented).toBe(true);
    expect(onchange).toHaveBeenCalledWith({ lat: 52.09, lon: 5.12, source: 'pick' });
    unmount(app);
  });

  it('keeps the map when the country outlines fail to load', async () => {
    withWebgl();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    fake.outlines = () => Promise.reject(new Error('chunk failed'));
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(LocationPicker, { target, props: { onchange: vi.fn() } });
    await vi.waitFor(() => expect(fake.map).not.toBeNull());
    fake.map!.emit('load');
    flushSync();
    expect(target.textContent).not.toContain('The map is not available');
    expect(target.textContent).toContain('Tap the map to place the pin');
    unmount(app);
  });

  it('does not claim either order in the hint', async () => {
    const { target, app } = await mapped();
    expect(target.querySelector('.dl-picker-hint')?.textContent).toContain('latitude first');
    expect(target.querySelector('.dl-picker-hint')?.textContent).not.toContain('either order');
    unmount(app);
  });
});
