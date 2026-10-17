import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CommonsSearch from './CommonsSearch.svelte';
import { fakeCommonsHits } from '$lib/testing/sharing.js';

function stubFetch(respond: (url: string) => Response) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      return respond(url);
    }),
  );
  return urls;
}

async function settle() {
  await vi.advanceTimersByTimeAsync(300);
  await vi.runAllTimersAsync();
  flushSync();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CommonsSearch', () => {
  it('searches the commons and offers the sites not in the log yet', async () => {
    vi.useFakeTimers();
    const urls = stubFetch(() => new Response(JSON.stringify(fakeCommonsHits())));
    const onUse = vi.fn();
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(CommonsSearch, {
      target,
      props: { query: 'fontaine', near: { lat: 44.6, lon: 1.7 }, onUse },
    });
    flushSync();
    await settle();

    expect(urls).toEqual(['/api/v1/admin/commons/sites?q=fontaine&limit=20']);
    const rows = [...target.querySelectorAll('.hits li')];
    expect(rows.map((r) => r.querySelector('.name')?.firstChild?.textContent?.trim())).toEqual([
      'Fontaine de Truffe',
      'Saint-Sauveur',
    ]);
    expect(rows[0].textContent).toContain('1.2 km away');
    expect(rows[1].textContent).toContain('Gramat · FRA · cave · 13 km away');
    expect(rows[0].querySelector('[data-origin]')?.textContent).toBe('commons');
    expect(target.querySelector('.known')?.textContent).toContain(
      'Already in your log: Ressel, Goul de la Tannerie',
    );

    rows[0].querySelector('button')!.click();
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'fra-fontaine-de-truffe' }));

    const near = target.querySelector<HTMLInputElement>('.near input')!;
    near.click();
    flushSync();
    await settle();
    expect(urls.at(-1)).toBe('/api/v1/admin/commons/sites?q=fontaine&near=44.6%2C1.7&limit=20');
    expect(target.textContent).not.toContain('Near me');
    unmount(app);
    target.remove();
  });

  it('says when nothing new matches, and shows errors', async () => {
    vi.useFakeTimers();
    stubFetch(() => new Response('[]'));
    const target = document.createElement('div');
    const app = mount(CommonsSearch, { target, props: { query: 'zzz', onUse: () => {} } });
    flushSync();
    await settle();
    expect(target.textContent).toContain('No commons site matches that is not in your log yet.');
    expect(target.querySelector('.near')).toBeNull();
    unmount(app);

    stubFetch(
      () => new Response(JSON.stringify({ detail: 'near: not a lat,lon' }), { status: 422 }),
    );
    const failing = document.createElement('div');
    const broken = mount(CommonsSearch, {
      target: failing,
      props: { query: 'x', onUse: () => {} },
    });
    flushSync();
    await settle();
    expect(failing.querySelector('.error')?.textContent).toBe('near: not a lat,lon');
    unmount(broken);
  });

  it('does not search for an empty query', async () => {
    vi.useFakeTimers();
    const urls = stubFetch(() => new Response('[]'));
    const target = document.createElement('div');
    const app = mount(CommonsSearch, { target, props: { onUse: () => {} } });
    flushSync();
    await settle();
    expect(urls).toEqual([]);
    expect(target.querySelector('.hits')).toBeNull();
    expect(target.textContent).not.toContain('No commons site');
    unmount(app);
  });
});

function stubGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
}

const nearMeButton = (target: HTMLElement) =>
  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Near me');

describe('CommonsSearch near me', () => {
  it('offers no "Near me" without geolocation', async () => {
    vi.useFakeTimers();
    stubFetch(() => new Response('[]'));
    const target = document.createElement('div');
    const app = mount(CommonsSearch, { target, props: { onUse: () => {} } });
    flushSync();
    await settle();
    expect(nearMeButton(target)).toBeUndefined();
    expect(target.querySelector('.near')).toBeNull();
    unmount(app);
  });

  it('searches around the device location and shows the distances', async () => {
    vi.useFakeTimers();
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((ok) =>
      ok({ coords: { latitude: 44.6000004, longitude: 1.7 } } as GeolocationPosition),
    );
    stubGeolocation(getCurrentPosition);
    const urls = stubFetch(() => new Response(JSON.stringify(fakeCommonsHits())));
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(CommonsSearch, { target, props: { onUse: () => {} } });
    flushSync();
    await settle();
    expect(urls).toEqual([]);

    const button = nearMeButton(target)!;
    expect(button.getAttribute('type')).toBe('button');
    button.click();
    flushSync();
    expect(button.textContent).toBe('Locating…');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await settle();

    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false });
    expect(nearMeButton(target)).toBeUndefined();
    const toggle = target.querySelector<HTMLInputElement>('.near input')!;
    expect(target.querySelector('.near')?.textContent?.trim()).toBe(
      'within 25 km of your location',
    );
    expect(toggle.checked).toBe(true);
    expect(document.activeElement).toBe(toggle);
    expect(urls).toEqual(['/api/v1/admin/commons/sites?near=44.6%2C1.7&limit=20']);
    const rows = [...target.querySelectorAll('.hits li')];
    expect(rows[0].textContent).toContain('1.2 km away');

    toggle.click();
    flushSync();
    await settle();
    expect(target.querySelector('.hits')).toBeNull();
    unmount(app);
    target.remove();
  });

  it('shows why the location is missing and keeps the button', async () => {
    vi.useFakeTimers();
    stubFetch(() => new Response('[]'));
    const failWith = (code: number) =>
      vi.fn((_ok: PositionCallback, fail?: PositionErrorCallback | null) =>
        fail?.({ code, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      );
    stubGeolocation(failWith(1));
    const target = document.createElement('div');
    const app = mount(CommonsSearch, { target, props: { onUse: () => {} } });
    flushSync();
    nearMeButton(target)!.click();
    await settle();

    const error = target.querySelector('.error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toBe('Location access was refused; search by name instead.');
    const button = nearMeButton(target)!;
    expect(button.getAttribute('aria-describedby')).toBe(error.id);
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(target.querySelector('.near')).toBeNull();

    stubGeolocation(failWith(3));
    button.click();
    await settle();
    expect(target.querySelector('.error')?.textContent).toBe('Could not get the device location.');
    unmount(app);
  });

  it('prefers the point it is given over the device', async () => {
    vi.useFakeTimers();
    stubGeolocation(vi.fn());
    stubFetch(() => new Response('[]'));
    const target = document.createElement('div');
    const app = mount(CommonsSearch, {
      target,
      props: { near: { lat: 44.6, lon: 1.7 }, onUse: () => {} },
    });
    flushSync();
    expect(nearMeButton(target)).toBeUndefined();
    expect(target.querySelector('.near')?.textContent).toContain('within 25 km of 44.600, 1.700');
    unmount(app);
  });
});
