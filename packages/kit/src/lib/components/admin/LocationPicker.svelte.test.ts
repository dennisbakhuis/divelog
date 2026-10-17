import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import LocationPicker from './LocationPicker.svelte';
import type { PickedPoint } from '$lib/core/admin/site-create.js';

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
