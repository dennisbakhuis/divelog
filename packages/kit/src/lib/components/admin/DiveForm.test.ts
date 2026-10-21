import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/navigation', () => ({
  beforeNavigate: vi.fn(),
  goto: vi.fn(async () => {}),
  invalidateAll: vi.fn(async () => {}),
}));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin/dives/7') } }));

import { beforeNavigate, goto } from '$app/navigation';
import DiveForm from './DiveForm.svelte';
import type {
  DiveAdmin,
  DiveTemplateOut,
  GearSetup,
  PersonPrivate,
  Trip,
} from '$lib/core/dive/types.js';
import { backupKey, emptyDiveInput, serializeBackup } from '$lib/core/admin/dive-input.js';
import { drawnRef, fakeMap, fakeSite } from '$lib/testing/sharing.js';
import { fakeDiveAdmin } from './__fixtures__/dive.js';

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

/** A backend that answers by path; anything unscripted gets the stored dive back. */
function fakeFetch(routes: Record<string, () => Response> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({
        url,
        method,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const route = routes[`${method} ${url}`] ?? routes[url];
      if (route) return route();
      return new Response(JSON.stringify(fakeDiveAdmin()), { status: 200 });
    }),
  );
  return calls;
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

const anna = {
  id: 'anna',
  slug: 'anna',
  name: 'Anna',
  first_name: 'Anna',
  last_name: null,
  aliases: [],
} as unknown as PersonPrivate;

type Props = {
  dive: DiveAdmin | null;
  template?: DiveTemplateOut | null;
  sites?: ReturnType<typeof fakeSite>[];
  trips?: Trip[];
  setups?: GearSetup[];
  drafts?: number[];
  prefill?: { site?: string; date?: string; person?: string; trip?: string } | null;
};

/** Mount the editor on a dive the test can swap, the way a reload hands the page a new one. */
function render({
  dive,
  template = null,
  sites,
  trips = [],
  setups = [],
  drafts = [],
  prefill = null,
  onSavedNew,
}: Props & { onSavedNew?: () => void }) {
  let current = dive;
  const target = document.createElement('div');
  document.body.append(target);
  const props = {
    get dive() {
      return current;
    },
    nextNumber: 8,
    sites: sites ?? [fakeSite()],
    trips,
    people: [anna],
    setups,
    regions: [],
    template,
    drafts,
    prefill,
    onSavedNew,
  };
  const app = mount(DiveForm, { target, props });
  flushSync();
  return {
    target,
    app,
    swap(next: DiveAdmin) {
      current = next;
    },
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

const saveButton = (target: HTMLElement) =>
  target.querySelector<HTMLButtonElement>('.save-bar button[type="submit"]')!;

const button = (target: HTMLElement, text: string) =>
  [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

/** The control a `<label for>` with this text points at. */
const control = (target: HTMLElement, text: string) => {
  const label = [...target.querySelectorAll('label')].find(
    (l) => l.textContent?.replace('*', '').trim() === text,
  );
  return (
    label?.htmlFor ? document.getElementById(label.htmlFor) : null
  ) as HTMLInputElement | null;
};

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function key(el: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

const sectionOpen = (target: HTMLElement, name: string) =>
  [...target.querySelectorAll('details')].find((d) =>
    d.querySelector('summary')?.textContent?.trim().startsWith(name),
  )?.open;

function template(overrides: Partial<DiveTemplateOut> = {}): DiveTemplateOut {
  return {
    date: '2026-02-08',
    next_number: 8,
    previous: {
      ...emptyDiveInput(6),
      date: '2026-02-08',
      time_in: '08:00',
      time_out: '08:50',
      duration_min: 50,
      max_depth_m: 20,
      site_id: 'mex-tortuga',
      section: 'upstream',
      people_ids: ['anna'],
      suit: '3 mm',
      mode: 'sidemount',
      profile: null,
    } as unknown as DiveTemplateOut['previous'],
    at_site: null,
    recent_sites: [],
    frequent_people: [{ id: 'anna', slug: 'anna', name: 'Anna', dives: 12 }],
    trip_for_date: null,
    ...overrides,
  };
}

/** A `Storage` in memory; the test DOM has no session storage of its own. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('localStorage', memoryStorage());
  vi.mocked(goto).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('DiveForm save', () => {
  it('keeps a cover set after the form opened, and the stored flags', async () => {
    const calls = fakeFetch();
    const { target, app, swap } = render({ dive: fakeDiveAdmin() });
    swap(fakeDiveAdmin({ cover_attachment_id: 'p2', private: { flags: ['late'] } as never }));

    saveButton(target).click();
    await settle();

    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].body?.cover_attachment_id).toBe('p2');
    expect(puts[0].body?.flags).toEqual(['late']);
    expect(puts[0].body).not.toHaveProperty('gas');
    expect(puts[0].body).not.toHaveProperty('o2_pct');
    expect(target.querySelector('.save-bar .saved')?.textContent).toMatch(/^Saved \d\d:\d\d$/);
    unmount(app);
  });

  it('saves with Ctrl-S and Cmd-S', async () => {
    const calls = fakeFetch();
    const { app } = render({ dive: fakeDiveAdmin() });
    const ctrl = key(window.document.body, { key: 's', ctrlKey: true });
    await settle();
    expect(ctrl.defaultPrevented).toBe(true);
    key(window.document.body, { key: 'S', metaKey: true });
    await settle();
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PUT']);
    unmount(app);
  });

  it('labels every control, the publish state apart from the visibility in metres', () => {
    const { target, app } = render({ dive: fakeDiveAdmin() });
    expect(control(target, 'Published as')?.tagName).toBe('SELECT');
    expect(control(target, 'Water temp (°C)')).not.toBeNull();
    expect(control(target, 'Surface water (°C)')).not.toBeNull();
    expect(control(target, 'Visibility (m)')).not.toBeNull();
    expect(control(target, 'Site')?.getAttribute('role')).toBe('combobox');
    expect(control(target, 'Buddies')?.getAttribute('role')).toBe('combobox');
    const fields = target.querySelectorAll(
      'form.dive-form input:not([type=hidden]), form.dive-form select, form.dive-form textarea',
    );
    const unlabelled = [...fields]
      .filter((el) => !el.closest('.route-editor'))
      .filter(
        (el) =>
          !el.getAttribute('aria-label') &&
          ![...target.querySelectorAll('label')].some((l) => l.htmlFor === el.id) &&
          !el.closest('label'),
      );
    expect(unlabelled).toEqual([]);
    unmount(app);
  });

  it('asks for the missing essentials instead of sending a half-filled dive', async () => {
    const calls = fakeFetch();
    const { target, app } = render({ dive: null });
    saveButton(target).click();
    await settle();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    const duration = control(target, 'Duration (min)')!;
    expect(duration.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(duration);
    const errorId = duration.getAttribute('aria-describedby')!.split(' ')[0];
    expect(document.getElementById(errorId)?.textContent).toContain('how long');
    expect(control(target, 'Max depth (m)')!.getAttribute('aria-invalid')).toBe('true');
    unmount(app);
  });

  it('shows a 422 at its field and opens the section it is in', async () => {
    fakeFetch({
      'PUT /api/v1/admin/dives/7': json(
        {
          detail: [
            { loc: ['body', 'tanks', 0, 'o2_pct'], msg: 'Input should be at most 100' },
            { loc: ['body', 'rating'], msg: 'Input should be at most 5' },
          ],
        },
        422,
      ),
    });
    const dive = fakeDiveAdmin({
      tanks: [
        {
          cylinder: 'D12',
          volume_l: 24,
          gas: 'nitrox',
          o2_pct: 32,
          o2_measured_pct: null,
          he_pct: null,
          pressure_in_bar: null,
          pressure_out_bar: null,
          role: 'back',
        },
      ],
    });
    const { target, app } = render({ dive });
    saveButton(target).click();
    await settle();
    const o2 = target.querySelector<HTMLInputElement>('#dl-dive-tanks-0-o2_pct')!;
    expect(o2.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(o2);
    expect(target.querySelector('#dl-dive-rating')?.getAttribute('aria-invalid')).toBe('true');
    expect(target.querySelector('.save-bar .error')?.textContent).toContain('did not accept');
    unmount(app);
  });

  it('saves and opens a new dive on the same day with Save & new', async () => {
    const calls = fakeFetch({ 'POST /api/v1/admin/dives': json(fakeDiveAdmin({ number: 8 })) });
    const { target, app } = render({ dive: null, prefill: { date: '2026-02-08' } });
    type(control(target, 'Duration (min)')!, '45');
    type(control(target, 'Max depth (m)')!, '18');
    button(target, 'Save & new').click();
    await settle();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      number: 8,
      duration_min: 45,
      max_depth_m: 18,
      date: '2026-02-08',
    });
    expect(goto).toHaveBeenCalledWith('/admin/dives/new?date=2026-02-08', { invalidateAll: true });
    unmount(app);
  });

  it('offers Save & next draft on a draft and goes there', async () => {
    fakeFetch();
    const { target, app } = render({
      dive: fakeDiveAdmin({ visibility: 'draft' }),
      drafts: [5, 7, 9],
    });
    expect(target.querySelector('.save-bar a[href="/admin/dives/5"]')?.textContent).toContain(
      'Previous draft',
    );
    button(target, 'Save & next draft').click();
    await settle();
    expect(goto).toHaveBeenCalledWith('/admin/dives/9');
    unmount(app);
  });

  it('saves as a draft from the publishing section', async () => {
    const calls = fakeFetch();
    const { target, app } = render({ dive: fakeDiveAdmin() });
    button(target, 'Save as draft').click();
    await settle();
    expect(calls.find((c) => c.method === 'PUT')?.body?.visibility).toBe('draft');
    unmount(app);
  });
});

describe('DiveForm Enter', () => {
  it('does not submit from a one-line field', async () => {
    const calls = fakeFetch();
    const { target, app } = render({ dive: fakeDiveAdmin() });
    const title = control(target, 'Title')!;
    expect(key(title, { key: 'Enter' }).defaultPrevented).toBe(true);
    const story = target.querySelector('textarea')!;
    expect(key(story, { key: 'Enter' }).defaultPrevented).toBe(false);
    await settle();
    expect(calls).toHaveLength(0);
    unmount(app);
  });

  it('picks the first matching site with Enter, without submitting', async () => {
    const calls = fakeFetch();
    const sites = [
      fakeSite({ id: 'mex-tortuga', slug: 'tortuga', name: 'Cenote Tortuga' }),
      fakeSite({ id: 'mex-taj-mahal', slug: 'taj-mahal', name: 'Taj Mahal' }),
    ];
    const { target, app } = render({ dive: fakeDiveAdmin(), sites });
    const search = control(target, 'Site')!;
    type(search, 'taj');
    expect(key(search, { key: 'Enter' }).defaultPrevented).toBe(true);
    flushSync();
    expect(search.value).toBe('Taj Mahal');
    expect(target.querySelector('a[href="/dive/sites/taj-mahal"]')).not.toBeNull();
    await settle();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    unmount(app);
  });
});

describe('DiveForm on a new dive', () => {
  it('starts without a made-up depth, duration or gas, with the first two sections open', () => {
    fakeFetch();
    const { target, app } = render({ dive: null });
    expect(control(target, 'Duration (min)')!.value).toBe('');
    expect(control(target, 'Max depth (m)')!.value).toBe('');
    expect(sectionOpen(target, 'Essentials')).toBe(true);
    expect(sectionOpen(target, 'Gas & kit')).toBe(true);
    expect(sectionOpen(target, 'Conditions')).toBe(false);
    expect(sectionOpen(target, 'Private')).toBe(false);
    expect(sectionOpen(target, 'Transcription')).toBe(false);
    unmount(app);
  });

  it('starts from the prefilled site, buddy and date', () => {
    fakeFetch();
    const sites = [fakeSite({ id: 'mex-tortuga', name: 'Cenote Tortuga' })];
    const { target, app } = render({
      dive: null,
      sites,
      prefill: { site: 'mex-tortuga', person: 'anna', date: '2026-01-02' },
    });
    expect(control(target, 'Site')!.value).toBe('Cenote Tortuga');
    expect(control(target, 'Date')!.value).toBe('2026-01-02');
    expect(target.querySelector('.dl-combobox-chip')?.textContent).toContain('Anna');
    unmount(app);
  });

  it('derives the duration from the times until it is typed over', () => {
    fakeFetch();
    const { target, app } = render({ dive: null });
    type(control(target, 'Time in')!, '09:30');
    type(control(target, 'Time out')!, '10:22');
    const duration = control(target, 'Duration (min)')!;
    expect(duration.value).toBe('52');
    expect(target.textContent).toContain('from time in and out');
    type(duration, '50');
    type(control(target, 'Time out')!, '10:40');
    expect(duration.value).toBe('50');
    expect(button(target, 'Use 70 from times')).toBeDefined();
    unmount(app);
  });

  it('fills the blanks from the previous dive and the surface interval from its time out', () => {
    fakeFetch();
    const sites = [fakeSite({ id: 'mex-tortuga', name: 'Cenote Tortuga' })];
    const { target, app } = render({
      dive: null,
      sites,
      template: template(),
      prefill: { date: '2026-02-08' },
    });
    type(control(target, 'Suit')!, 'drysuit');
    button(target, 'Same as previous dive').click();
    flushSync();
    expect(control(target, 'Site')!.value).toBe('Cenote Tortuga');
    expect(control(target, 'Section / line')!.value).toBe('upstream');
    expect(control(target, 'Suit')!.value).toBe('drysuit');
    expect((control(target, 'Mode') as unknown as HTMLSelectElement).value).toBe('sidemount');
    type(control(target, 'Time in')!, '10:05');
    expect(control(target, 'Surface interval')!.value).toBe('1:15');
    expect(target.textContent).toContain("from #6's time out");
    expect(button(target, 'Same as previous dive').disabled).toBe(true);
    unmount(app);
  });

  it('takes the water temperature from the last dive at the site', () => {
    fakeFetch();
    const sites = [fakeSite({ id: 'mex-tortuga', name: 'Cenote Tortuga' })];
    const { target, app } = render({
      dive: null,
      sites,
      prefill: { site: 'mex-tortuga' },
      template: template({
        at_site: {
          number: 4,
          date: '2026-01-02',
          section: 'downstream',
          map_id: null,
          water_temp_c: 25.5,
          surface_temp_c: null,
          air_temp_c: null,
          visibility_m: null,
        },
      }),
    });
    expect(control(target, 'Water temp (°C)')!.value).toBe('25.5');
    expect(target.textContent).toContain('from #4, the last dive here');
    expect(target.textContent).toContain('last time: downstream');
    unmount(app);
  });

  it('fills tanks, suit and weights from a gear setup', () => {
    fakeFetch();
    const setups = [
      {
        id: 'sm',
        slug: 'sm',
        name: 'Sidemount',
        description_md: '',
        description_html: '',
        sort: 0,
        items: [],
        dive_count: 0,
        tanks: [
          {
            cylinder: 'AL80',
            volume_l: 11.1,
            gas: 'nitrox',
            o2_pct: 32,
            o2_measured_pct: null,
            he_pct: null,
            pressure_in_bar: null,
            pressure_out_bar: null,
            role: 'back',
          },
        ],
        suit: '3 mm',
        weights_kg: 1,
      },
    ] as GearSetup[];
    const { target, app } = render({ dive: null, setups });
    const select = control(target, 'Gear setup') as unknown as HTMLSelectElement;
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(target.querySelector<HTMLInputElement>('#dl-dive-tanks-0-cylinder')?.value).toBe('AL80');
    expect(control(target, 'Suit')!.value).toBe('3 mm');
    expect(control(target, 'Weights (kg)')!.value).toBe('1');
    unmount(app);
  });

  it('queues files chosen before the first save and uploads them after it', async () => {
    const calls = fakeFetch({ 'POST /api/v1/admin/dives': json(fakeDiveAdmin({ number: 8 })) });
    const { target, app } = render({ dive: null });
    const input = target.querySelector<HTMLInputElement>('.photos input[type=file]')!;
    const file = new File(['x'], 'reef.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(target.querySelector('.queued')?.textContent).toContain('reef.jpg');
    type(control(target, 'Duration (min)')!, '45');
    type(control(target, 'Max depth (m)')!, '18');
    saveButton(target).click();
    await settle();
    await settle();
    expect(calls.map((c) => `${c.method} ${c.url.split('?')[0]}`)).toEqual([
      'POST /api/v1/admin/dives',
      'POST /api/v1/admin/dives/8/attachments',
    ]);
    expect(goto).toHaveBeenCalledWith('/admin/dives/8', { invalidateAll: true });
    unmount(app);
  });

  it('restores an unsaved backup with a notice, and can discard it', async () => {
    fakeFetch();
    const backup = { ...emptyDiveInput(8), title: 'Half typed', max_depth_m: 12 };
    sessionStorage.setItem(backupKey(null), serializeBackup(backup, ''));
    const { target, app } = render({ dive: null });
    await settle();
    expect(control(target, 'Title')!.value).toBe('Half typed');
    expect(target.querySelector('.notice')?.textContent).toContain('were restored');
    button(target, 'Discard them').click();
    flushSync();
    expect(control(target, 'Title')!.value).toBe('');
    expect(sessionStorage.getItem(backupKey(null))).toBeNull();
    unmount(app);
  });
});

describe('DiveForm map', () => {
  it('picks the only drawn map of the site', () => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    fakeFetch();
    const map = fakeMap({ id: 'm1', title: 'Main line' });
    const site = fakeSite({ id: 'mex-tortuga', maps: [drawnRef(map)] });
    const { target, app } = render({
      dive: fakeDiveAdmin({ site_id: 'mex-tortuga' }),
      sites: [site],
    });
    const select = target.querySelector<HTMLSelectElement>('.route-editor select')!;
    expect(select.value).toBe('m1');
    unmount(app);
  });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tortuga = () => fakeSite({ id: 'mex-tortuga', slug: 'tortuga', name: 'Cenote Tortuga' });
const hemmoor = () =>
  fakeSite({ id: 'deu-hemmoor', slug: 'hemmoor', name: 'Kreidesee Hemmoor', country: 'DEU' });

const atTortuga = (water: number) =>
  template({
    at_site: {
      number: 4,
      date: '2026-01-02',
      section: 'downstream',
      map_id: null,
      water_temp_c: water,
      surface_temp_c: null,
      air_temp_c: null,
      visibility_m: null,
    },
  });

const trip = (slug: string) =>
  ({ slug, name: slug, start_date: '2026-02-01', end_date: '2026-02-14' }) as unknown as Trip;

function pickSite(target: HTMLElement, text: string) {
  const search = control(target, 'Site')!;
  type(search, text);
  key(search, { key: 'Enter' });
  flushSync();
}

describe('DiveForm derivations', () => {
  it('leaves a published dive as stored: no guessed interval or water, nothing unsaved', async () => {
    const calls = fakeFetch();
    const dive = fakeDiveAdmin({
      site_id: 'mex-tortuga',
      surface_interval: null,
      water_temp_c: null,
      time_in: '10:05',
    });
    const { target, app } = render({ dive, sites: [tortuga()], template: atTortuga(25.5) });
    await settle();
    expect(control(target, 'Surface interval')!.value).toBe('');
    expect(control(target, 'Water temp (°C)')!.value).toBe('');
    expect(target.querySelector('.save-bar .unsaved')).toBeNull();
    saveButton(target).click();
    await settle();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body?.surface_interval).toBeNull();
    expect(put.body?.water_temp_c).toBeNull();
    unmount(app);
  });

  it('clears a derived interval and water temperature when their source goes away', () => {
    fakeFetch();
    const { target, app } = render({
      dive: null,
      sites: [tortuga(), hemmoor()],
      template: atTortuga(25.5),
      prefill: { site: 'mex-tortuga', date: '2026-02-08' },
    });
    type(control(target, 'Time in')!, '10:05');
    expect(control(target, 'Surface interval')!.value).toBe('1:15');
    type(control(target, 'Time in')!, '');
    expect(control(target, 'Surface interval')!.value).toBe('');
    expect(control(target, 'Water temp (°C)')!.value).toBe('25.5');
    pickSite(target, 'Hemmoor');
    expect(control(target, 'Water temp (°C)')!.value).toBe('');
    unmount(app);
  });

  it('keeps the values of a restored backup instead of deriving over them', async () => {
    fakeFetch();
    const backup = {
      ...emptyDiveInput(8),
      date: '2026-02-08',
      site_id: 'mex-tortuga',
      time_in: '10:05',
      water_temp_c: 18,
      surface_interval: '0:30',
    };
    sessionStorage.setItem(backupKey(null), serializeBackup(backup, ''));
    const { target, app } = render({
      dive: null,
      sites: [tortuga()],
      template: atTortuga(25.5),
      prefill: { site: 'mex-tortuga', date: '2026-02-08' },
    });
    await settle();
    expect(control(target, 'Water temp (°C)')!.value).toBe('18');
    expect(control(target, 'Surface interval')!.value).toBe('0:30');
    expect(button(target, 'Use 1:15')).toBeDefined();
    unmount(app);
  });

  it('follows the trip of the date, and drops it when the date leaves the trip', async () => {
    fakeFetch({
      'GET /api/v1/admin/dives/template?date=2026-03-01': json(template({ trip_for_date: null })),
    });
    const { target, app } = render({
      dive: null,
      trips: [trip('mexico')],
      template: template({ trip_for_date: trip('mexico') }),
      prefill: { date: '2026-02-08' },
    });
    expect(control(target, 'Trip')!.value).toBe('mexico');
    expect(target.textContent).toContain('from the date');
    type(control(target, 'Date')!, '2026-03-01');
    await wait(300);
    await settle();
    expect(control(target, 'Trip')!.value).toBe('');
    unmount(app);
  });

  it('keeps a trip given in the link when the date leaves it', async () => {
    fakeFetch({
      'GET /api/v1/admin/dives/template?date=2026-03-01': json(template({ trip_for_date: null })),
    });
    const { target, app } = render({
      dive: null,
      trips: [trip('mexico')],
      template: template({ trip_for_date: trip('mexico') }),
      prefill: { date: '2026-02-08', trip: 'mexico' },
    });
    type(control(target, 'Date')!, '2026-03-01');
    await wait(300);
    await settle();
    expect(control(target, 'Trip')!.value).toBe('mexico');
    unmount(app);
  });

  it('ignores a template answer that arrives after a newer one', async () => {
    let answerSlow: (r: Response) => void = () => {};
    const slow = new Promise<Response>((resolve) => (answerSlow = resolve));
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith('date=2026-02-10')) return slow;
        return new Response(JSON.stringify(template({ trip_for_date: null })), { status: 200 });
      }),
    );
    const { target, app } = render({
      dive: null,
      trips: [trip('mexico'), trip('stale')],
      template: template({ trip_for_date: trip('mexico') }),
      prefill: { date: '2026-02-08' },
    });
    type(control(target, 'Date')!, '2026-02-10');
    await wait(300);
    type(control(target, 'Date')!, '2026-03-01');
    await wait(300);
    await settle();
    expect(control(target, 'Trip')!.value).toBe('');
    answerSlow(new Response(JSON.stringify(template({ trip_for_date: trip('stale') }))));
    await settle();
    expect(control(target, 'Trip')!.value).toBe('');
    expect(calls).toHaveLength(2);
    unmount(app);
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function chooseFile(target: HTMLElement, name: string) {
  const input = target.querySelector<HTMLInputElement>('.photos input[type=file]')!;
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('DiveForm save flow', () => {
  it('tells the page after Save & new reloaded the new-dive page', async () => {
    fakeFetch({ 'POST /api/v1/admin/dives': json(fakeDiveAdmin({ number: 8 })) });
    const onSavedNew = vi.fn();
    const { target, app } = render({ dive: null, onSavedNew });
    type(control(target, 'Duration (min)')!, '45');
    type(control(target, 'Max depth (m)')!, '18');
    button(target, 'Save & new').click();
    await settle();
    expect(onSavedNew).toHaveBeenCalledOnce();
    unmount(app);
  });

  it('keeps edits typed during the upload after a create, under the new dive', async () => {
    const upload = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/attachments')
          ? upload.promise
          : new Response(JSON.stringify(fakeDiveAdmin({ number: 8 })), { status: 200 }),
      ),
    );
    const { target, app } = render({ dive: null });
    chooseFile(target, 'reef.jpg');
    type(control(target, 'Duration (min)')!, '45');
    type(control(target, 'Max depth (m)')!, '18');
    saveButton(target).click();
    await settle();
    type(control(target, 'Title')!, 'Typed while uploading');
    upload.resolve(new Response('{}', { status: 200 }));
    await settle();
    expect(goto).toHaveBeenCalledWith('/admin/dives/8', { invalidateAll: true });
    expect(sessionStorage.getItem(backupKey(null))).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(backupKey(8))!).form.title).toBe(
      'Typed while uploading',
    );
    unmount(app);
  });

  it('keeps the visibility when a Save as draft does not go through', async () => {
    const calls = fakeFetch();
    const { target, app } = render({ dive: null });
    button(target, 'Save as draft').click();
    await settle();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect((control(target, 'Published as') as unknown as HTMLSelectElement).value).toBe('public');
    unmount(app);
  });

  it('disables Delete while a save runs', async () => {
    const put = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => put.promise),
    );
    const { target, app } = render({ dive: fakeDiveAdmin() });
    saveButton(target).click();
    await settle();
    expect(button(target, 'Delete').disabled).toBe(true);
    put.resolve(new Response(JSON.stringify(fakeDiveAdmin()), { status: 200 }));
    await settle();
    expect(button(target, 'Delete').disabled).toBe(false);
    unmount(app);
  });

  it('re-pins without saving the other edits still open in the form', async () => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const calls = fakeFetch();
    const map = fakeMap({ id: 'm1', revision: 2 });
    const site = fakeSite({ id: 'mex-tortuga', maps: [drawnRef(map)] });
    const annotation = {
      map_id: 'm1',
      revision: 1,
      route: [{ from: 'a', to: 'b' }],
      turn: null,
      pins: [],
      path: [],
      turn_at: null,
      note: '',
    };
    const { target, app } = render({
      dive: fakeDiveAdmin({ site_id: 'mex-tortuga', map_annotation: annotation }),
      sites: [site],
    });
    type(control(target, 'Title')!, 'Not ready yet');
    button(target, 'Re-pin route to the current map').click();
    await settle();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    expect(target.querySelector('.save-bar .unsaved')).not.toBeNull();
    unmount(app);
  });

  it('leaves on the back button by going back, not by adding a history entry', async () => {
    fakeFetch();
    vi.mocked(beforeNavigate).mockClear();
    vi.stubGlobal('confirm', () => true);
    const back = vi.spyOn(history, 'go').mockImplementation(() => {});
    const { target, app } = render({ dive: fakeDiveAdmin() });
    type(control(target, 'Title')!, 'Unsaved');
    const guard = vi.mocked(beforeNavigate).mock.calls[0][0];
    const cancel = vi.fn();
    guard({
      type: 'popstate',
      delta: -1,
      to: { url: new URL('http://localhost/admin/dives') },
      cancel,
    } as never);
    await settle();
    expect(cancel).toHaveBeenCalled();
    expect(back).toHaveBeenCalledWith(-1);
    expect(goto).not.toHaveBeenCalled();
    back.mockRestore();
    unmount(app);
  });

  it('writes the backup at once when the page is hidden or left', () => {
    fakeFetch();
    const { target, app } = render({ dive: fakeDiveAdmin() });
    type(control(target, 'Title')!, 'Before the lock screen');
    expect(sessionStorage.getItem(backupKey(7))).toBeNull();
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(JSON.parse(sessionStorage.getItem(backupKey(7))!).form.title).toBe(
      'Before the lock screen',
    );
    state.mockRestore();
    type(control(target, 'Title')!, 'Before leaving');
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(sessionStorage.getItem(backupKey(7))!).form.title).toBe('Before leaving');
    unmount(app);
  });
});

/** A button in the list footer of a combobox, after typing `query` into it. */
function footerButton(target: HTMLElement, label: string, query: string, text: string) {
  const search = control(target, label)!;
  search.focus();
  type(search, query);
  return [...target.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.trim().startsWith(text),
  )!;
}

const openDialog = () => document.querySelector<HTMLDialogElement>('dialog[open]');

describe('DiveForm dialogs', () => {
  it('opens the new-site dialog like the site in the form: name, country, type and water', async () => {
    fakeFetch();
    const like = fakeSite({
      id: 'deu-hemmoor',
      name: 'Kreidesee Hemmoor',
      country: 'DEU',
      country_name: 'Germany',
      region: 'niedersachsen',
      site_type: 'quarry lake',
      water: 'fresh',
    });
    const { target, app } = render({
      dive: null,
      sites: [like],
      prefill: { site: 'deu-hemmoor' },
    });
    footerButton(target, 'Site', 'Hemmoor Nord', '+ New site').click();
    await settle();
    const dialog = openDialog()!;
    expect(dialog.querySelector('h2')?.textContent).toBe('New site');
    const select = (label: string) =>
      [...dialog.querySelectorAll('label')]
        .find((l) => l.textContent?.replace('*', '').trim() === label)
        ?.htmlFor;
    const value = (label: string) =>
      (document.getElementById(select(label)!) as HTMLInputElement | HTMLSelectElement).value;
    expect(value('Name')).toBe('Hemmoor Nord');
    expect(value('Country')).toBe('DEU');
    expect(value('Type')).toBe('quarry lake');
    expect(value('Water')).toBe('fresh');
    unmount(app);
  });

  it('starts a new site as a sea site when there is nothing to go by', async () => {
    fakeFetch();
    const { target, app } = render({ dive: null, sites: [] });
    footerButton(target, 'Site', 'Somewhere', '+ New site').click();
    await settle();
    const dialog = openDialog()!;
    const type = dialog.querySelector<HTMLSelectElement>('select[id$="-type"]')!;
    const water = dialog.querySelector<HTMLSelectElement>('select[id$="-water"]')!;
    expect(type.value).toBe('sea');
    expect(water.value).toBe('salt');
    unmount(app);
  });

  it('does not save with Ctrl-S while a dialog is open, and closes the dialog with Escape', async () => {
    const calls = fakeFetch();
    const { target, app } = render({ dive: fakeDiveAdmin() });
    footerButton(target, 'Site', 'Hemmoor', '+ New site').click();
    await settle();
    expect(openDialog()).not.toBeNull();
    key(document.body, { key: 's', ctrlKey: true });
    await settle();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    key(openDialog()!, { key: 'Escape' });
    await settle();
    expect(openDialog()).toBeNull();
    unmount(app);
  });

  it('opens the new-trip dialog prefilled with the name and the day of the dive', async () => {
    fakeFetch();
    const { target, app } = render({ dive: null, prefill: { date: '2026-02-08' } });
    footerButton(target, 'Trip', 'Hemmoor weekend', '+ New trip').click();
    await settle();
    const dialog = openDialog()!;
    expect(dialog.querySelector('h2')?.textContent).toBe('New trip');
    const [name, start, end] = [...dialog.querySelectorAll<HTMLInputElement>('input')];
    expect(name.value).toBe('Hemmoor weekend');
    expect(start.value).toBe('2026-02-08');
    expect(end.value).toBe('2026-02-08');
    expect(document.activeElement).toBe(name);
    button(dialog as unknown as HTMLElement, 'Cancel').click();
    await settle();
    expect(openDialog()).toBeNull();
    unmount(app);
  });
});

describe('DiveForm on a phone', () => {
  it('opens the keypad that fits each number, and a full keyboard where a minus is needed', () => {
    fakeFetch();
    const { target, app } = render({ dive: null });
    target.querySelector<HTMLButtonElement>('.tank-actions button')!.click();
    flushSync();
    const mode = (label: string) => control(target, label)!.getAttribute('inputmode');
    const tank = (field: string) =>
      target.querySelector(`#dl-dive-tanks-0-${field}`)!.getAttribute('inputmode');
    expect(mode('Number')).toBe('numeric');
    expect(mode('Duration (min)')).toBe('numeric');
    expect(mode('Max depth (m)')).toBe('decimal');
    expect(mode('Weights (kg)')).toBe('decimal');
    expect(mode('Safety stop (min)')).toBe('numeric');
    expect(mode('Thermocline (m)')).toBe('decimal');
    expect(mode('Visibility (m)')).toBe('numeric');
    expect(mode('Rating (1–5)')).toBe('numeric');
    expect(tank('volume_l')).toBe('decimal');
    expect(tank('o2_pct')).toBe('numeric');
    expect(tank('o2_measured_pct')).toBe('decimal');
    expect(tank('pressure_in_bar')).toBe('numeric');
    expect(mode('Air temp (°C)')).toBeNull();
    expect(mode('Water temp (°C)')).toBeNull();
    expect(mode('Surface interval')).toBeNull();
    unmount(app);
  });

  it('writes a surface interval typed as 1.15 as 1:15', () => {
    fakeFetch();
    const { target, app } = render({ dive: null });
    const interval = control(target, 'Surface interval')!;
    type(interval, '1.15');
    interval.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(interval.value).toBe('1:15');
    unmount(app);
  });

  it('offers the camera for photos and any file for other kinds', () => {
    fakeFetch();
    const { target, app } = render({ dive: null });
    const inputs = () => [...target.querySelectorAll<HTMLInputElement>('.photos input[type=file]')];
    expect(inputs().map((i) => [i.accept, i.getAttribute('capture')])).toEqual([
      ['image/*', null],
      ['image/*', 'environment'],
    ]);
    const kind = target.querySelector<HTMLSelectElement>('#dl-dive-queue-kind')!;
    kind.value = 'scan';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(inputs().map((i) => [i.accept, i.getAttribute('capture')])).toEqual([['', null]]);
    unmount(app);
  });
});

