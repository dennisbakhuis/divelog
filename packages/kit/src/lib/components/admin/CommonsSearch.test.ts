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
    expect(rows[1].textContent).toContain('Gramat · FRA · cave · 12.8 km');
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
