import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

const navigation = vi.hoisted(() => ({
  goto: vi.fn(),
  invalidateAll: vi.fn(async () => {}),
  beforeNavigate: vi.fn(),
}));
vi.mock('$app/navigation', () => navigation);

import AdminSiteMapsPage from './AdminSiteMapsPage.svelte';
import { toast } from '$lib/components/stores/toast.svelte';
import { drawnRef, fakeMap, fakeSite } from '$lib/testing/sharing.js';
import { render, settle } from '$lib/components/ui/__fixtures__/test-utils.js';
import type { Site } from '$lib/core/dive/types.js';
import type { SiteMapOut, SiteMapSeedOut } from '$lib/core/dive/sitemap.js';

type Call = { url: string; method: string; body: unknown };

const SEED: SiteMapSeedOut = {
  source: 'osm',
  radius_m: 400,
  elements: 3,
  map: {
    version: 3,
    kind: 'sitemap',
    title: 'Example Quarry',
    north: 0,
    to_scale: true,
    nodes: [],
    edges: [],
    areas: [],
    lines: [
      {
        id: 'shore',
        kind: 'shoreline',
        label: '',
        depth: null,
        closed: true,
        points: [
          { x: -50, y: -40 },
          { x: 60, y: -30 },
          { x: 10, y: 70 },
        ],
      },
    ],
    notes: 'From OpenStreetMap',
    origin: { lat: 52.09, lon: 5.12 },
    underlay: null,
  },
};

function created(data: unknown): SiteMapOut {
  return fakeMap({ ...(data as object), id: 'nld-example-1a2b3c', site_id: 'nld-example' });
}

function fakeFetch(routes: Record<string, (body: unknown) => [number, unknown]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const route = routes[`${method} ${url}`];
      const [status, payload] = route ? route(body) : [404, { detail: 'Not found' }];
      return new Response(JSON.stringify(payload), { status });
    }),
  );
  return calls;
}

const POST_MAP = 'POST /api/v1/admin/sites/nld-example/maps';
const POST_SEED = 'POST /api/v1/admin/sites/nld-example/maps/seed';

function mountPage(site: Site = fakeSite()) {
  const view = render(AdminSiteMapsPage, { site });
  const button = (name: string) =>
    [...view.target.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
    );
  return { ...view, button };
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  toast.items.splice(0);
  document.body.innerHTML = '';
});

describe('AdminSiteMapsPage drafts', () => {
  it('opens a blank site map at the site and stores it only on Save', async () => {
    const calls = fakeFetch({
      [POST_MAP]: (body) => [200, created((body as { data: unknown }).data)],
    });
    const { target, button, destroy } = mountPage();
    button('Blank site map')!.click();
    await settle();
    expect(calls).toEqual([]);
    expect(target.querySelector('.editor')).not.toBeNull();
    expect(target.textContent).toContain('new · not saved yet');
    const save = button('Save map')!;
    expect(save.disabled).toBe(false);
    save.click();
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    const sent = calls[0].body as {
      data: { kind: string; origin: unknown; north: number };
      note: string;
    };
    expect(sent.data.kind).toBe('sitemap');
    expect(sent.data.origin).toEqual({ lat: 52.09, lon: 5.12 });
    expect(sent.data.north).toBe(0);
    expect(sent.note).toBe('Created');
    expect(navigation.invalidateAll).toHaveBeenCalled();
    expect(target.textContent).not.toContain('not saved yet');
    expect(button('Save map')!.disabled).toBe(true);
    expect(target.textContent).toContain('Revision 1');
    destroy();
  });

  it('starts from OpenStreetMap as an unsaved draft, then saves it once', async () => {
    const calls = fakeFetch({
      [POST_SEED]: () => [200, SEED],
      [POST_MAP]: (body) => [200, created((body as { data: unknown }).data)],
    });
    const { target, button, destroy } = mountPage();
    button('Start from OpenStreetMap')!.click();
    await settle();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([POST_SEED]);
    expect(calls[0].body).toEqual({ source: 'osm' });
    expect(target.querySelector('.line.shoreline')).not.toBeNull();
    expect(toast.items.at(-1)?.message).toContain('3 OpenStreetMap features within 400 m');
    const note = target.querySelector<HTMLInputElement>('input[aria-label="What changed"]')!;
    note.value = 'Shore from OSM';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    button('Save map')!.click();
    await settle();
    expect(calls).toHaveLength(2);
    const sent = calls[1].body as { data: typeof SEED.map; note: string };
    expect(sent.note).toBe('Shore from OSM');
    expect(sent.data.lines[0].id).toBe('shore');
    expect(sent.data.origin).toEqual({ lat: 52.09, lon: 5.12 });
    destroy();
  });

  it('shows the server reason when OpenStreetMap does not answer', async () => {
    fakeFetch({ [POST_SEED]: () => [503, { detail: 'Overpass timed out after 15 s' }] });
    const { target, button, destroy } = mountPage();
    const start = button('Start from OpenStreetMap')!;
    start.click();
    flushSync();
    expect(start.textContent).toContain('Fetching from OpenStreetMap');
    expect(start.getAttribute('aria-busy')).toBe('true');
    await settle();
    expect(target.querySelector('.editor')).toBeNull();
    const last = toast.items.at(-1)!;
    expect(last.kind).toBe('error');
    expect(last.message).toContain('Overpass timed out after 15 s');
    expect(button('Start from OpenStreetMap')!.disabled).toBe(false);
    destroy();
  });

  it('needs coordinates to start from OpenStreetMap', () => {
    fakeFetch({});
    const { target, button, destroy } = mountPage(fakeSite({ lat: null, lon: null }));
    const start = button('Start from OpenStreetMap')!;
    expect(start.disabled).toBe(true);
    const why = document.getElementById(start.getAttribute('aria-describedby')!)!;
    expect(why.textContent).toContain('no coordinates');
    button('Blank stick map')!.click();
    flushSync();
    expect(target.querySelector('.editor')).not.toBeNull();
    destroy();
  });

  it('asks before throwing away an unsaved draft', async () => {
    fakeFetch({});
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const { target, button, destroy } = mountPage();
    button('Blank site map')!.click();
    await settle();
    button('Blank stick map')!.click();
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(target.querySelector('.map-row.open .badge')?.textContent).toBe('Site map');
    confirm.mockReturnValue(true);
    button('Discard')!.click();
    await settle();
    expect(target.querySelector('.editor')).toBeNull();
    destroy();
  });
});

describe('AdminSiteMapsPage list', () => {
  const first = fakeMap({ id: 'm1', title: 'Shore' });
  const second = fakeMap({ id: 'm2', title: 'Wreck' });
  const site = () =>
    fakeSite({ maps: [drawnRef(first), drawnRef(second)], default_map: 'drawn:m1' });

  it('shows "shown first" as a radio group and changes it', async () => {
    const calls = fakeFetch({ 'PATCH /api/v1/admin/sites/nld-example': () => [200, {}] });
    const { target, destroy } = mountPage(site());
    const radios = [...target.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    expect(radios[0].closest('label')?.textContent?.trim()).toBe('Shown first');
    radios[1].click();
    await settle();
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { default_map: 'drawn:m2' } });
    destroy();
  });

  it('labels the reorder buttons and disables the ends', async () => {
    const calls = fakeFetch({ 'PUT /api/v1/admin/sites/nld-example/maps/order': () => [200, {}] });
    const { button, destroy } = mountPage(site());
    expect(button('Move Shore up')!.disabled).toBe(true);
    expect(button('Move Wreck down')!.disabled).toBe(true);
    button('Move Shore down')!.click();
    await settle();
    expect(calls[0].body).toEqual(['m2', 'm1']);
    destroy();
  });

  it('edits a stored map and saves it with PUT', async () => {
    const calls = fakeFetch({
      'PUT /api/v1/admin/maps/m1': (body) => [
        200,
        { ...first, ...(body as { data: object }).data, revision: 2 },
      ],
    });
    const { target, button, destroy } = mountPage(site());
    button('Edit Shore')!.click();
    await settle();
    expect(button('Save map')!.disabled).toBe(true);
    const title = target.querySelector<HTMLInputElement>('.editor .meta input[type="text"]')!;
    title.value = 'Shore and pier';
    title.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    button('Save map')!.click();
    await settle();
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { data: { title: 'Shore and pier' } } });
    expect(toast.items.at(-1)?.message).toBe('Map saved');
    destroy();
  });
});
