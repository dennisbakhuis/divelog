import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';

const location = vi.hoisted(() => ({ url: new URL('http://localhost/admin') }));

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/state', () => ({ page: location }));

import AdminShell from './AdminShell.svelte';
import { fakeRepoStatus } from '$lib/testing/sharing.js';

const children = createRawSnippet(() => ({ render: () => '<p>page</p>' }));

function currentAt(pathname: string): string[] {
  location.url = new URL(`http://localhost${pathname}`);
  const target = document.createElement('div');
  const app = mount(AdminShell, { target, props: { owner: 'owner@example.com', children } });
  flushSync();
  const current = [...target.querySelectorAll('nav a[aria-current="page"]')].map(
    (a) => a.textContent?.trim() ?? '',
  );
  unmount(app);
  return current;
}

afterEach(() => vi.unstubAllGlobals());

describe('AdminShell navigation', () => {
  it.each([
    ['/admin', 'Dives'],
    ['/admin/', 'Dives'],
    ['/admin/dives/650', 'Dives'],
    ['/admin/dives/new', 'Dives'],
    ['/admin/sites', 'Sites'],
    ['/admin/sites/nld-vinkeveen/maps', 'Sites'],
    ['/admin/regions/nld-zeeland', 'Sites'],
    ['/admin/people', 'People'],
    ['/admin/people/kim', 'People'],
    ['/admin/trips', 'Trips'],
    ['/admin/gear', 'Gear'],
    ['/admin/import', 'Import'],
  ])('marks exactly one section current on %s', (pathname, section) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(fakeRepoStatus()), { status: 200 })),
    );
    expect(currentAt(pathname)).toEqual([section]);
  });

  it('marks nothing current on a page outside the sections', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    expect(currentAt('/admin/divesite')).toEqual([]);
    expect(currentAt('/admin/login')).toEqual([]);
  });
});
