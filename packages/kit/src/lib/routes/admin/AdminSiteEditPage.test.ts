import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const navigation = vi.hoisted(() => ({
  goto: vi.fn(),
  invalidateAll: vi.fn(),
  replaceState: vi.fn(),
  beforeNavigate: vi.fn(),
}));
vi.mock('$app/navigation', () => navigation);

import AdminSiteEditPage from './AdminSiteEditPage.svelte';
import { fakeSite } from '$lib/testing/sharing.js';
import type { Site } from '$lib/core/dive/types.js';

function render(site: Site, page: 'site-edit' | 'site-maps' = 'site-edit') {
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(AdminSiteEditPage, {
    target,
    props: { data: { page, site, regions: [], owner: 'owner@example.com' } },
  });
  flushSync();
  const tabs = () => [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const selected = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true');
  return { target, app, tabs, selected };
}

function stubFetch() {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.startsWith('/api/v1/admin/dives/page'))
        return new Response(
          JSON.stringify({
            items: [
              {
                number: 7,
                date: '2024-05-12',
                title: 'Morning',
                site_id: 'nld-example',
                max_depth_m: 12,
                duration_min: 50,
                visibility: 'public',
              },
              {
                number: 9,
                date: '2024-06-01',
                title: 'Elsewhere',
                site_id: 'nld-other',
                max_depth_m: 8,
                duration_min: 40,
                visibility: 'public',
              },
              {
                number: 8,
                date: '2024-05-13',
                title: '',
                site_id: 'nld-example',
                max_depth_m: 15,
                duration_min: 45,
                visibility: 'draft',
              },
            ],
            total: 3,
            offset: 0,
            limit: 1000,
          }),
          { status: 200 },
        );
      return new Response('[]', { status: 200 });
    }),
  );
  return urls;
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

describe('AdminSiteEditPage workspace', () => {
  it('opens on Details with the header, origin badge and view link', () => {
    const { target, app, tabs, selected } = render(fakeSite());
    expect(target.querySelector('h1')?.textContent).toBe('Example Quarry');
    expect(target.querySelector('[data-origin]')?.textContent).toBe('personal');
    expect(tabs().map((t) => t.textContent?.trim())).toEqual([
      'Details',
      'Location',
      'Maps',
      'Photos',
      'Dives (2)',
    ]);
    expect(selected()?.textContent?.trim()).toBe('Details');
    expect(target.querySelector('form')).not.toBeNull();
    unmount(app);
  });

  it('opens the Maps tab from the maps deep link', () => {
    const { target, app, selected } = render(fakeSite(), 'site-maps');
    expect(selected()?.textContent?.trim()).toBe('Maps');
    expect(target.textContent).toContain('No drawn maps yet');
    unmount(app);
  });

  it('switches tabs and keeps the URL in step', () => {
    const { target, app, tabs, selected } = render(fakeSite());
    tabs()
      .find((t) => t.textContent?.trim() === 'Maps')!
      .click();
    flushSync();
    expect(selected()?.textContent?.trim()).toBe('Maps');
    expect(navigation.replaceState).toHaveBeenLastCalledWith('/admin/sites/nld-example/maps', {});
    tabs()
      .find((t) => t.textContent?.trim() === 'Photos')!
      .click();
    flushSync();
    expect(navigation.replaceState).toHaveBeenLastCalledWith('/admin/sites/nld-example#photos', {});
    expect(target.textContent).toContain('Photos & uploaded maps');
    unmount(app);
  });

  const tabNamed = (tabs: () => HTMLButtonElement[], name: string) =>
    tabs().find((t) => t.textContent?.trim().startsWith(name))!;

  it('keeps what was typed when moving between Details and Location', () => {
    const { target, app, tabs } = render(fakeSite());
    const area = () =>
      [...target.querySelectorAll('label')].find((l) =>
        l.textContent?.trim().startsWith('Area / town'),
      )?.control as HTMLInputElement;
    area().value = 'Maarssen';
    area().dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    tabNamed(tabs, 'Location').click();
    flushSync();
    expect(target.querySelector('.dl-picker')).not.toBeNull();
    expect(target.textContent).toContain('Unsaved changes');
    tabNamed(tabs, 'Details').click();
    flushSync();
    expect(area().value).toBe('Maarssen');
    unmount(app);
  });

  it('opens a tab from the hash and lists the dives at the site', async () => {
    history.replaceState(null, '', '/admin/sites/nld-example#dives');
    const { target, app, selected } = render(fakeSite());
    await settle();
    expect(selected()?.textContent?.trim()).toBe('Dives (2)');
    const rows = [...target.querySelectorAll('.site-dives li a')].map((a) =>
      a.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['#7 12 May 2024 Morning', '#8 13 May 2024 Example Quarry']);
    expect(target.querySelector('.site-dives .chip')?.textContent).toBe('draft');
    const log = [...target.querySelectorAll('a')].find((a) => a.textContent === 'Log a dive here');
    expect(log?.getAttribute('href')).toBe('/admin/dives/new?site=nld-example');
    unmount(app);
  });

  it('marks a site without a position on the Location tab', () => {
    const { app, tabs } = render(fakeSite({ lat: null, lon: null }));
    expect(tabNamed(tabs, 'Location').textContent).toBe('Location (not placed)');
    unmount(app);
  });
});
