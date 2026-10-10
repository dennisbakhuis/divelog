import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import SiteForm from './SiteForm.svelte';
import { resetLookups } from '$lib/core/admin/lookups.js';
import { siteFormFrom, type SiteFormState } from '$lib/core/admin/site-form.js';
import type { Site } from '$lib/core/dive/types.js';
import { commonsSite, fakeSite, forkSite } from '$lib/testing/sharing.js';

type Call = { url: string; method: string; body: unknown };

const SITE_FIELDS = {
  objective: [
    'name',
    'full_name',
    'region',
    'country',
    'type',
    'lat',
    'lon',
    'access',
    'location_visibility',
    'water',
  ],
  personal: ['prices', 'notes'],
  additive: ['aliases', 'maps', 'media'],
  preference: ['site_id', 'summary', 'default_map'],
};

function fakeFetch(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const key = `${method} ${url}`;
      if (key === 'GET /api/v1/admin/meta/site-fields')
        return new Response(JSON.stringify(SITE_FIELDS), { status: 200 });
      if (key === 'GET /api/v1/meta/countries') return new Response('[]', { status: 200 });
      if (!(key in answers)) return new Response(JSON.stringify({ detail: key }), { status: 500 });
      const value = answers[key];
      if (value instanceof Response) return value;
      return new Response(JSON.stringify(value), { status: 200 });
    }),
  );
  return calls;
}

function render(site: Site, props: Record<string, unknown> = {}) {
  const onSaved = vi.fn();
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(SiteForm, { target, props: { site, regions: [], onSaved, ...props } });
  flushSync();
  const byLabel = <T extends HTMLElement>(text: string) => {
    const label = [...target.querySelectorAll('label')].find(
      (l) =>
        l.textContent?.trim().replace(/\*$/, '') === text || l.textContent?.trim().startsWith(text),
    );
    return (label ? document.getElementById(label.htmlFor) : null) as T;
  };
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  const save = () => target.querySelector('form')!.requestSubmit();
  return { target, onSaved, app, byLabel, button, save };
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
  for (let i = 0; i < 3; i++) await tick();
}

function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  resetLookups();
  HTMLFormElement.prototype.requestSubmit ??= function (this: HTMLFormElement) {
    this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SiteForm on a commons site', () => {
  it('locks the objective fields, says why, and marks the overlay ones as yours', async () => {
    fakeFetch({});
    const { target, app, byLabel, button } = render(commonsSite());
    await settle();
    expect(target.textContent).toContain('This site comes from the shared commons');
    expect(button('Fork to edit')).toBeDefined();
    const name = byLabel<HTMLInputElement>('Name');
    expect(name.readOnly).toBe(true);
    expect(name.getAttribute('aria-describedby')).toContain('lock-note');
    expect(byLabel<HTMLSelectElement>('Type').disabled).toBe(true);
    expect(byLabel<HTMLInputElement>('Summary').readOnly).toBe(false);
    expect(byLabel<HTMLInputElement>('Also known as').readOnly).toBe(false);
    const chips = [...target.querySelectorAll('.chip')].map((c) => c.textContent?.trim());
    expect(chips).toContain('🔒 commons');
    expect(chips).toContain('yours');
    unmount(app);
  });

  it('unlocks in place to fork, and the save forks with the edited values', async () => {
    const site = commonsSite();
    const forked = forkSite({ id: site.id, forked_from: 'commons@6' });
    const calls = fakeFetch({ 'PUT /api/v1/admin/sites/fra-ressel?fork=true': forked });
    const { app, byLabel, button, save, onSaved } = render(site);
    await settle();
    button('Fork to edit')!.click();
    flushSync();
    const name = byLabel<HTMLInputElement>('Name');
    expect(name.readOnly).toBe(false);
    expect(button('Fork & save')).toBeDefined();
    type(name, 'Ressel (my copy)');
    type(byLabel<HTMLInputElement>('What changed'), 'Own name for the resurgence');
    save();
    await settle();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/v1/admin/sites/fra-ressel?fork=true');
    expect(put.body).toMatchObject({
      site_id: 'fra-ressel',
      name: 'Ressel (my copy)',
      note: 'Own name for the resurgence',
    });
    expect(onSaved).toHaveBeenCalledWith(forked);
    unmount(app);
  });

  it('puts the record back when the fork is cancelled', async () => {
    const site = commonsSite();
    fakeFetch({});
    const { app, byLabel, button } = render(site);
    await settle();
    button('Fork to edit')!.click();
    flushSync();
    type(byLabel<HTMLInputElement>('Name'), 'Changed');
    type(byLabel<HTMLInputElement>('Summary'), 'My summary');
    button('Cancel fork')!.click();
    flushSync();
    expect(byLabel<HTMLInputElement>('Name').value).toBe(site.name);
    expect(byLabel<HTMLInputElement>('Name').readOnly).toBe(true);
    expect(byLabel<HTMLInputElement>('Summary').value).toBe('My summary');
    unmount(app);
  });

  it('shows a commons position read-only on the Location section', async () => {
    fakeFetch({});
    const { target, app } = render(commonsSite(), { section: 'location' });
    await settle();
    const text = target.querySelector('.readonly-pos')?.textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('fork the site to move it');
    expect(target.querySelector('.dl-picker')).toBeNull();
    unmount(app);
  });
});

describe('SiteForm on a personal site', () => {
  it('saves with the note, without forking, and has nothing locked', async () => {
    const site = fakeSite();
    const saved = fakeSite({ revision: 2 });
    const calls = fakeFetch({ 'PUT /api/v1/admin/sites/nld-example': saved });
    const { target, app, byLabel, save, onSaved } = render(site);
    await settle();
    expect(target.textContent).not.toContain('shared commons');
    expect(byLabel<HTMLInputElement>('Name').readOnly).toBe(false);
    expect(byLabel<HTMLInputElement>('Site id').readOnly).toBe(true);
    type(byLabel<HTMLInputElement>('What changed'), 'Fixed the area');
    type(byLabel<HTMLInputElement>('Area / town'), 'Maarssen');
    expect(target.querySelector('.status')?.textContent).toBe('Unsaved changes');
    save();
    await settle();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/v1/admin/sites/nld-example');
    expect(put.body).toMatchObject({
      area: 'Maarssen',
      note: 'Fixed the area',
      type: 'quarry lake',
    });
    expect(calls.some((c) => c.url.includes('site-fields'))).toBe(false);
    expect(onSaved).toHaveBeenCalledWith(saved);
    unmount(app);
  });

  it('marks the server field errors and focuses the first', async () => {
    fakeFetch({
      'PUT /api/v1/admin/sites/nld-example': new Response(
        JSON.stringify({
          detail: [{ loc: ['body', 'lat'], msg: 'Input should be less than or equal to 90' }],
        }),
        { status: 422 },
      ),
    });
    const { target, app, save, onSaved } = render(fakeSite(), { section: 'location' });
    await settle();
    save();
    await settle();
    expect(onSaved).not.toHaveBeenCalled();
    const coords = target.querySelector<HTMLInputElement>('.dl-picker input[type="text"]')!;
    expect(coords.getAttribute('aria-invalid')).toBe('true');
    expect(target.textContent).toContain('less than or equal to 90');
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('check the marked');
    expect(document.activeElement).toBe(coords);
    unmount(app);
  });

  it('refuses half an entry point before asking the server', async () => {
    const calls = fakeFetch({});
    const form: SiteFormState = { ...siteFormFrom(fakeSite()), access_lat: 52.1, access_lon: null };
    const { target, app, save } = render(fakeSite(), { section: 'location', form });
    await settle();
    save();
    await settle();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    expect(target.textContent).toContain('Give both coordinates of the entry point');
    unmount(app);
  });

  it('takes a pasted position with its provenance, and clears the entry point', async () => {
    fakeFetch({});
    const form = $state(
      siteFormFrom(fakeSite({ access: { lat: 52.1, lon: 5.1, note: 'stairs' } })),
    );
    const { target, app, button } = render(fakeSite(), { section: 'location', form });
    await settle();
    const coords = target.querySelector<HTMLInputElement>('.dl-picker input[type="text"]')!;
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => '52.2, 5.2' } });
    coords.dispatchEvent(event);
    flushSync();
    expect(form.lat).toBe(52.2);
    expect(form.lon).toBe(5.2);
    expect(form.geo_source).toMatch(/^pasted coordinates, /);
    button('Remove entry point')!.click();
    flushSync();
    expect(form.access_lat).toBeNull();
    expect(form.access_note).toBe('');
    unmount(app);
  });
});
