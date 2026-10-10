import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import SiteCreate from './SiteCreate.svelte';
import { resetLookups } from '$lib/core/admin/lookups.js';
import { fakeSite } from '$lib/testing/sharing.js';
import type { NearbySitesOut, Region } from '$lib/core/dive/types.js';

type Call = { method: string; url: string; body: unknown };
type Answer =
  { status?: number; body: unknown } | ((url: URL) => { status?: number; body: unknown });

function fakeFetch(routes: Record<string, Answer>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const url = new URL(input, 'http://x');
      calls.push({
        method,
        url: input,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const route = routes[`${method} ${url.pathname}`];
      if (!route)
        return new Response(JSON.stringify({ detail: 'Site not found' }), { status: 404 });
      const { status = 200, body } = typeof route === 'function' ? route(url) : route;
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const COUNTRIES = [
  { iso3: 'FRA', iso2: 'FR', name: 'France' },
  { iso3: 'NLD', iso2: 'NL', name: 'Netherlands' },
];

const REGIONS = [
  { id: 'lot', name: 'Lot', country: 'FRA', map_sites: [{ lat: 44.6, lon: 1.7 }], sites: [] },
  {
    id: 'zeeland',
    name: 'Zeeland',
    country: 'NLD',
    map_sites: [{ lat: 51.7, lon: 3.9 }],
    sites: [],
  },
] as unknown as Region[];

const NOTHING: NearbySitesOut = { log: [], commons: [] };

async function settle(ms = 0) {
  for (let i = 0; i < 4; i++) await tick();
  await new Promise((r) => setTimeout(r, ms));
  flushSync();
  for (let i = 0; i < 4; i++) await tick();
  flushSync();
}

async function until(check: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await settle(10);
  }
}

function render(props: Record<string, unknown> = {}) {
  const onCreated = vi.fn();
  const onUse = vi.fn();
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(SiteCreate, {
    target,
    props: { regions: REGIONS, onCreated, onUse, ...props },
  });
  flushSync();
  const byLabel = <T extends HTMLElement>(text: string) => {
    const label = [...target.querySelectorAll('label')].find((l) =>
      l.textContent?.trim().startsWith(text),
    )!;
    return document.getElementById(label.htmlFor) as T;
  };
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
  return { target, app, onCreated, onUse, byLabel, button };
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function choose(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

function pastePosition(input: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  input.dispatchEvent(event);
  flushSync();
}

beforeEach(() => resetLookups());

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SiteCreate', () => {
  it('previews the id, takes the country and region from the pin and checks the id', async () => {
    const calls = fakeFetch({
      'GET /api/v1/meta/countries': { body: COUNTRIES },
      'GET /api/v1/admin/sites/nearby': { body: NOTHING },
    });
    const { target, app, byLabel } = render();
    const name = byLabel<HTMLInputElement>('Name');
    expect(document.activeElement).toBe(name);
    type(name, 'Émergence du Ressel');
    expect(target.querySelector('.id-line')?.textContent).toContain('xxx-emergence-du-ressel');

    pastePosition(byLabel<HTMLInputElement>('Coordinates'), '44.5612, 1.7344');
    await until(() => byLabel<HTMLSelectElement>('Country').value === 'FRA');
    await settle(450);
    expect(target.textContent).toContain('from the pin');
    expect(target.querySelector('.from-pin')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'In France, region Lot.',
    );
    expect(byLabel<HTMLInputElement>('Region').value).toBe('Lot');
    expect(target.querySelector('.id-line')?.textContent).toContain('fra-emergence-du-ressel');
    await settle(100);
    expect(target.querySelector('.id-line')?.textContent).toContain('available');
    expect(calls.some((c) => c.url === '/api/v1/admin/sites/fra-emergence-du-ressel')).toBe(true);
    const nearby = calls.find((c) => c.url.startsWith('/api/v1/admin/sites/nearby'))!;
    expect(nearby.url).toContain('lat=44.5612');
    expect(nearby.url).toContain('name=%C3%89mergence+du+Ressel');
    unmount(app);
  });

  it('keeps a country picked by hand when the pin moves', async () => {
    fakeFetch({
      'GET /api/v1/meta/countries': { body: COUNTRIES },
      'GET /api/v1/admin/sites/nearby': { body: NOTHING },
    });
    const { target, app, byLabel } = render();
    await settle();
    choose(byLabel<HTMLSelectElement>('Country'), 'NLD');
    pastePosition(byLabel<HTMLInputElement>('Coordinates'), '44.5612, 1.7344');
    await until(() => target.querySelector('.from-pin') !== null);
    expect(byLabel<HTMLSelectElement>('Country').value).toBe('NLD');
    unmount(app);
  });

  it('sets the water from the type until the water is chosen by hand', () => {
    fakeFetch({ 'GET /api/v1/meta/countries': { body: COUNTRIES } });
    const { app, byLabel } = render();
    const typeSelect = byLabel<HTMLSelectElement>('Type');
    const water = byLabel<HTMLSelectElement>('Water');
    expect(water.value).toBe('salt');
    choose(typeSelect, 'cave');
    expect(water.value).toBe('fresh');
    choose(typeSelect, 'wreck');
    expect(water.value).toBe('salt');
    choose(water, 'brackish');
    choose(typeSelect, 'lake');
    expect(water.value).toBe('brackish');
    unmount(app);
  });

  it('lists look-alikes from the log and the commons and uses one instead', async () => {
    const existing = fakeSite({ id: 'fra-ressel', name: 'Ressel' });
    fakeFetch({
      'GET /api/v1/meta/countries': { body: COUNTRIES },
      'GET /api/v1/admin/sites/nearby': {
        body: {
          log: [
            {
              site_id: 'fra-ressel',
              name: 'Ressel',
              country: 'FRA',
              type: 'cave',
              lat: 44.561,
              lon: 1.734,
              matched_by: 'distance',
              distance_m: 120.4,
              origin: 'log',
              dives: 3,
            },
          ],
          commons: [
            {
              site_id: 'fra-cabouy',
              name: 'Cabouy',
              country: 'FRA',
              type: 'cave',
              area: 'Rocamadour',
              lat: 44.7,
              lon: 1.6,
              matched_by: 'name',
              distance_m: null,
            },
          ],
        },
      },
      'GET /api/v1/admin/sites/fra-ressel': { body: existing },
    });
    const { target, app, byLabel, onUse } = render();
    type(byLabel<HTMLInputElement>('Name'), 'Ressel');
    await settle(450);
    const hits = [...target.querySelectorAll('.hit')].map((h) =>
      h.textContent?.replace(/\s+/g, ' '),
    );
    expect(hits[0]).toContain('120 m away · 3 dives');
    expect(hits[1]).toContain('same name · Rocamadour');
    expect(target.querySelector('.nearby .count')?.textContent).toBe('2');
    const adopt = target.querySelector<HTMLButtonElement>(
      '[aria-label="Adopt Cabouy from the commons"]',
    );
    expect(adopt?.textContent).toBe('Adopt');
    target.querySelector<HTMLButtonElement>('[aria-label="Use Ressel instead"]')!.click();
    await settle();
    expect(onUse).toHaveBeenCalledWith(existing);
    unmount(app);
  });

  it('asks for the country before posting anything', async () => {
    const calls = fakeFetch({ 'GET /api/v1/meta/countries': { body: COUNTRIES } });
    const { target, app, byLabel, button, onCreated } = render();
    type(byLabel<HTMLInputElement>('Name'), 'Somewhere');
    button('Create').click();
    await settle();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
    const country = byLabel<HTMLSelectElement>('Country');
    expect(country.getAttribute('aria-invalid')).toBe('true');
    expect(target.textContent).toContain('Pick the country');
    expect(document.activeElement).toBe(country);
    unmount(app);
  });

  it('creates the site with the picked position and hands over the action', async () => {
    const created = fakeSite({ id: 'nld-vinkeveen', name: 'Vinkeveen' });
    const calls = fakeFetch({
      'GET /api/v1/meta/countries': { body: COUNTRIES },
      'GET /api/v1/admin/sites/nearby': { body: NOTHING },
      'POST /api/v1/admin/sites': { status: 201, body: created },
    });
    const { app, byLabel, button, onCreated } = render();
    type(byLabel<HTMLInputElement>('Name'), 'Vinkeveen');
    pastePosition(byLabel<HTMLInputElement>('Coordinates'), '52.2603, 4.9324');
    await until(() => byLabel<HTMLSelectElement>('Country').value === 'NLD');
    choose(byLabel<HTMLSelectElement>('Type'), 'quarry lake');
    button('Create & draw a map').click();
    await settle();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toMatchObject({
      site_id: 'nld-vinkeveen',
      name: 'Vinkeveen',
      country: 'NLD',
      type: 'quarry lake',
      water: 'fresh',
      lat: 52.2603,
      lon: 4.9324,
      location_visibility: 'exact',
      region: 'zeeland',
    });
    expect((post.body as { geo_source: string }).geo_source).toMatch(/^pasted coordinates, \d{4}-/);
    expect(onCreated).toHaveBeenCalledWith(created, 'map');
    unmount(app);
  });

  it('shows the server field errors next to the fields', async () => {
    fakeFetch({
      'GET /api/v1/meta/countries': { body: COUNTRIES },
      'GET /api/v1/admin/sites/nearby': { body: NOTHING },
      'POST /api/v1/admin/sites': {
        status: 409,
        body: { detail: 'Site id already in use' },
      },
    });
    const { target, app, byLabel, button, onCreated } = render({ initial: { country: 'NLD' } });
    type(byLabel<HTMLInputElement>('Name'), 'Example');
    button('Create').click();
    await settle();
    expect(onCreated).not.toHaveBeenCalled();
    expect(byLabel<HTMLInputElement>('Name').getAttribute('aria-invalid')).toBe('true');
    expect(target.textContent).toContain('The id nld-example is already in use');
    unmount(app);
  });

  it('offers one "Create & use" and a Cancel in the dialog', async () => {
    const created = fakeSite();
    fakeFetch({
      'GET /api/v1/meta/countries': { body: COUNTRIES },
      'GET /api/v1/admin/sites/nearby': { body: NOTHING },
      'POST /api/v1/admin/sites': { status: 201, body: created },
    });
    const onCancel = vi.fn();
    const { app, button, onCreated, byLabel } = render({
      compact: true,
      onCancel,
      initial: { name: 'Example Quarry', country: 'NLD' },
    });
    expect(byLabel<HTMLInputElement>('Name').value).toBe('Example Quarry');
    expect(button('Create & draw a map')).toBeUndefined();
    button('Cancel').click();
    expect(onCancel).toHaveBeenCalled();
    button('Create & use').click();
    await settle();
    expect(onCreated).toHaveBeenCalledWith(created, 'use');
    unmount(app);
  });

  it('does not create on Enter in a text field', async () => {
    const calls = fakeFetch({ 'GET /api/v1/meta/countries': { body: COUNTRIES } });
    const { app, byLabel } = render({ initial: { country: 'NLD' } });
    const name = byLabel<HTMLInputElement>('Name');
    type(name, 'Example');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    name.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    unmount(app);
  });
});
