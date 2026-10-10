import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

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

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('AdminSiteEditPage workspace', () => {
  it('opens on Details with the header, origin badge and view link', () => {
    const { target, app, tabs, selected } = render(fakeSite());
    expect(target.querySelector('h1')?.textContent).toBe('Example Quarry');
    expect(target.querySelector('[data-origin]')?.textContent).toBe('personal');
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(
      expect.arrayContaining(['Details', 'Maps', 'Photos']),
    );
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
});
