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

function stubMedia(narrow: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: narrow,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

async function shellAt(pathname: string, repo = fakeRepoStatus()) {
  location.url = new URL(`http://localhost${pathname}`);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(repo), { status: 200 })),
  );
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(AdminShell, { target, props: { owner: 'owner@example.com', children } });
  flushSync();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
  return {
    target,
    destroy: () => {
      unmount(app);
      target.remove();
    },
  };
}

describe('AdminShell bar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the whole cluster inline on a wide screen, with the repo state as text', async () => {
    stubMedia(false);
    const { target, destroy } = await shellAt('/admin/sites');
    const cluster = target.querySelector('.cluster')!;
    expect(cluster).not.toBeNull();
    expect(cluster.textContent).toContain('Sign out');
    const repo = target.querySelector<HTMLButtonElement>('button.repo')!;
    expect(repo.textContent).toBe('Repository: clean');
    expect(repo.hasAttribute('title')).toBe(false);
    repo.click();
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    const panel = document.getElementById(repo.getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('aria-label')).toBe('Repository status');
    expect(panel.textContent).toContain('Everything is committed and pushed.');
    expect(target.querySelector('nav')?.getAttribute('aria-label')).toBe('Admin sections');
    destroy();
  });

  it('folds the cluster into a Menu popover on a narrow screen and keeps New dive', async () => {
    stubMedia(true);
    const { target, destroy } = await shellAt('/admin/dives/650', {
      ...fakeRepoStatus(),
      state: 'unpushed',
      ahead: 2,
    });
    expect(target.querySelector('.cluster')).toBeNull();
    expect(target.querySelector('a.new-dive')?.getAttribute('href')).toBe('/admin/dives/new');
    const menu = target.querySelector<HTMLButtonElement>('.menu-trigger')!;
    expect(menu.textContent?.replace(/\s+/g, ' ').trim()).toBe('Menu, repository unpushed');
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    menu.click();
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    const panel = document.getElementById(menu.getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('aria-label')).toBe('Admin menu');
    expect(panel.querySelector('button.repo')?.textContent).toBe('Repository: unpushed ↑2');
    const actions = [...panel.querySelectorAll('button, a')].map((el) => el.textContent?.trim());
    expect(actions).toEqual(expect.arrayContaining(['push', 'pull', 'view site', 'Sign out']));
    expect(document.activeElement).toBe(panel.querySelector('button.repo'));

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(document.getElementById(menu.getAttribute('aria-controls')!)).toBeNull();
    expect(document.activeElement).toBe(menu);
    destroy();
  });

  it('opens the repo and commons panels in the flow of the Menu on a narrow screen', async () => {
    stubMedia(true);
    const { target, destroy } = await shellAt('/admin');
    target.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    const menu = target.querySelector('.menu-body')!;
    const repo = menu.querySelector<HTMLButtonElement>('button.repo')!;
    repo.click();
    flushSync();
    const repoPanel = document.getElementById(repo.getAttribute('aria-controls')!)!;
    expect(menu.contains(repoPanel)).toBe(true);
    expect(repoPanel.classList.contains('repo-panel--inline')).toBe(true);
    const notices = [...menu.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('notices'),
    )!;
    notices.click();
    flushSync();
    const noticePanel = document.getElementById(notices.getAttribute('aria-controls')!)!;
    expect(menu.contains(noticePanel)).toBe(true);
    expect(noticePanel.classList.contains('popover--inline')).toBe(true);
    destroy();
  });

  it('keeps the panels floating on a wide screen', async () => {
    stubMedia(false);
    const { target, destroy } = await shellAt('/admin');
    const repo = target.querySelector<HTMLButtonElement>('.cluster button.repo')!;
    repo.click();
    flushSync();
    const panel = document.getElementById(repo.getAttribute('aria-controls')!)!;
    expect(panel.classList.contains('repo-panel')).toBe(true);
    expect(panel.classList.contains('repo-panel--inline')).toBe(false);
    destroy();
  });

  it('publishes the bar height for the toasts and removes it on unmount', async () => {
    stubMedia(true);
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly cb: () => void) {
          observers.push(() => this.cb());
        }
        observe() {
          this.cb();
        }
        disconnect() {}
      },
    );
    const { target, destroy } = await shellAt('/admin');
    const bar = target.querySelector<HTMLElement>('header.bar')!;
    Object.defineProperty(bar, 'offsetHeight', { configurable: true, value: 97 });
    observers.forEach((run) => run());
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--dl-admin-bar-h')).toBe('97px');
    destroy();
    expect(root.style.getPropertyValue('--dl-admin-bar-h')).toBe('');
  });
});
