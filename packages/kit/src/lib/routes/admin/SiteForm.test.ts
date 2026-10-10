import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import SiteForm from './SiteForm.svelte';
import type { Site } from '$lib/core/dive/types.js';
import { commonsSite, fakeSite, forkSite, stalePinSite } from '$lib/testing/sharing.js';

type Call = { url: string; method: string; body: unknown };

function fakeFetch(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${method} ${url}`;
    if (!(key in answers)) return new Response(JSON.stringify({ detail: key }), { status: 500 });
    const value = answers[key];
    return value === null
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(value), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function render(site: Site) {
  const onSaved = vi.fn();
  const target = document.createElement('div');
  const app = mount(SiteForm, { target, props: { site, regions: [], onSaved } });
  flushSync();
  return { target, onSaved, app };
}

const button = (target: HTMLElement, text: string) =>
  [...target.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SiteForm sharing actions', () => {
  it('forks a commons site with the form values, after explaining what a fork is', async () => {
    const site = commonsSite();
    const forked = forkSite({ id: site.id, forked_from: 'commons@6' });
    const calls = fakeFetch({ 'PUT /api/v1/admin/sites/fra-ressel?fork=true': forked });
    const { target, onSaved, app } = render(site);

    expect(target.textContent).toContain('A fork is a full personal copy');
    expect(button(target, 'Drop fork')).toBeUndefined();
    button(target, 'Fork this site')!.click();
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect((calls[0].body as { site_id: string; name: string }).site_id).toBe('fra-ressel');
    expect((calls[0].body as { name: string }).name).toBe(site.name);
    expect(onSaved).toHaveBeenCalledWith(forked);
    unmount(app);
  });

  it('drops a fork and hands back the commons record', async () => {
    const site = forkSite();
    const restored = commonsSite({ id: site.id });
    const calls = fakeFetch({
      'DELETE /api/v1/admin/sites/fra-goul': null,
      'GET /api/v1/admin/sites/fra-goul': restored,
    });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const { target, onSaved, app } = render(site);

    expect(button(target, 'Fork this site')).toBeUndefined();
    button(target, 'Drop fork, back to the commons record')!.click();
    await settle();

    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'GET']);
    expect(onSaved).toHaveBeenCalledWith(restored);
    unmount(app);
  });

  it('keeps the fork when the drop is not confirmed, and shows API errors', async () => {
    const calls = fakeFetch({});
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const { target, app } = render(forkSite());
    button(target, 'Drop fork')!.click();
    await settle();
    expect(calls).toHaveLength(0);
    unmount(app);

    const failing = render(commonsSite());
    button(failing.target, 'Fork this site')!.click();
    await settle();
    expect(failing.target.querySelector('.error')?.textContent).toContain('PUT');
    expect(failing.onSaved).not.toHaveBeenCalled();
    unmount(failing.app);
  });

  it('offers no sharing action on a personal site, and the review on a stale pin', () => {
    const personal = render(fakeSite());
    expect(button(personal.target, 'Fork')).toBeUndefined();
    expect(button(personal.target, 'Drop fork')).toBeUndefined();
    unmount(personal.app);

    const stale = render(stalePinSite());
    expect(stale.target.textContent).toContain(
      'Written against commons revision 4, commons is at 6',
    );
    expect(button(stale.target, 'Mark as reviewed against revision 6')).toBeDefined();
    unmount(stale.app);
  });
});

describe('SiteForm site id', () => {
  const type = (el: HTMLInputElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function renderNew() {
    const target = document.createElement('div');
    const app = mount(SiteForm, { target, props: { site: null, regions: [], onSaved: vi.fn() } });
    flushSync();
    const field = (label: string) =>
      [...target.querySelectorAll('label')]
        .find((l) => l.textContent?.trim().startsWith(label))
        ?.querySelector('input') as HTMLInputElement;
    return {
      target,
      app,
      name: field('Name'),
      id: target.querySelector<HTMLInputElement>('#site-id')!,
      hint: () => target.querySelector('#site-id-hint')?.textContent?.replace(/\s+/g, ' ').trim(),
    };
  }

  it('previews the id from country and name, and says when it is free', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(`GET ${url}`);
        return new Response(JSON.stringify({ detail: 'Site not found' }), { status: 404 });
      }),
    );
    const { app, name, id, hint } = renderNew();
    type(name, 'Vinkeveense Plassen');
    expect(hint()).toContain('Will be nld-vinkeveense-plassen.');
    expect(id.getAttribute('aria-describedby')).toBe('site-id-hint');
    await wait(450);
    await settle();
    expect(calls).toEqual(['GET /api/v1/admin/sites/nld-vinkeveense-plassen']);
    expect(hint()).toContain('Available.');
    unmount(app);
  });

  it('flags an id already in use', async () => {
    fakeFetch({ 'GET /api/v1/admin/sites/nld-example': fakeSite() });
    const { app, id, hint } = renderNew();
    type(id, 'nld-example');
    await wait(450);
    await settle();
    expect(hint()).toContain('Already in use');
    expect(id.getAttribute('aria-invalid')).toBe('true');
    unmount(app);
  });

  it('slugifies a typed id on blur and asks for a country prefix', async () => {
    const calls = fakeFetch({});
    const { app, id, hint } = renderNew();
    type(id, '  Blue Hole — Gozo ');
    id.dispatchEvent(new Event('blur'));
    flushSync();
    expect(id.value).toBe('blue-hole-gozo');
    expect(hint()).toContain('Needs a country prefix');
    await wait(450);
    expect(calls).toHaveLength(0);
    unmount(app);
  });

  it('checks nothing while editing an existing site', async () => {
    const calls = fakeFetch({});
    const { target, app } = render(fakeSite());
    expect(target.querySelector('#site-id-hint')).toBeNull();
    await wait(450);
    expect(calls).toHaveLength(0);
    unmount(app);
  });
});
