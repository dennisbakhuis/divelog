import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import SiteHeader from './SiteHeader.svelte';
import type { Site } from '$lib/core/dive/types.js';
import { commonsSite, fakeSite, forkSite, stalePinSite } from '$lib/testing/sharing.js';

type Call = { url: string; method: string };

function fakeFetch(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method });
      const key = `${method} ${url}`;
      if (!(key in answers)) return new Response(JSON.stringify({ detail: key }), { status: 500 });
      const value = answers[key];
      return value === null
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(value), { status: 200 });
    }),
  );
  return calls;
}

function render(site: Site) {
  const onChanged = vi.fn();
  const target = document.createElement('div');
  const app = mount(SiteHeader, { target, props: { site, onChanged } });
  flushSync();
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  return { target, app, onChanged, button };
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SiteHeader', () => {
  it('names the site with its origin, pin state and a view link', () => {
    const { target, app } = render(stalePinSite());
    expect(target.querySelector('h1')?.textContent).toBe('Cabouy');
    expect(target.querySelector('[data-origin]')?.textContent).toBe('commons');
    expect(target.querySelector('[data-pin]')?.textContent).toBe('commons moved: r4 → r6');
    expect(target.querySelector('summary')?.textContent).toContain('review needed');
    expect(target.querySelector('a.view')?.textContent).toContain('opens in a new tab');
    unmount(app);
    const fresh = render(commonsSite());
    expect(fresh.target.querySelector('[data-pin]')?.textContent).toBe('commons r6');
    unmount(fresh.app);
  });

  it('marks a stale pin as reviewed', async () => {
    const site = stalePinSite();
    const pinned = commonsSite({ id: site.id });
    const calls = fakeFetch({ 'POST /api/v1/admin/sites/fra-cabouy/pin': pinned });
    const { app, button, onChanged } = render(site);
    button('Mark as reviewed against revision 6')!.click();
    await settle();
    expect(calls).toEqual([{ url: '/api/v1/admin/sites/fra-cabouy/pin', method: 'POST' }]);
    expect(onChanged).toHaveBeenCalledWith(pinned);
    unmount(app);
  });

  it('drops a fork after confirming, and hands back the commons record', async () => {
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
    const { target, app, button, onChanged } = render(site);
    expect(target.textContent).toContain('forked from commons@4');
    button('Drop fork, back to the commons record')!.click();
    await settle();
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'GET']);
    expect(onChanged).toHaveBeenCalledWith(restored);
    unmount(app);
  });

  it('keeps the fork when the drop is not confirmed, and toasts API errors', async () => {
    const calls = fakeFetch({});
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const { app, button, onChanged } = render(forkSite());
    button('Drop fork')!.click();
    await settle();
    expect(calls).toHaveLength(0);
    expect(onChanged).not.toHaveBeenCalled();
    unmount(app);
  });

  it('offers no fork action on a personal site', () => {
    const { app, button } = render(fakeSite());
    expect(button('Drop fork')).toBeUndefined();
    expect(button('Mark as reviewed')).toBeUndefined();
    unmount(app);
  });
});
