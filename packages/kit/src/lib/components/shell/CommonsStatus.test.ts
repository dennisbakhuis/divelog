import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import CommonsStatus from './CommonsStatus.svelte';
import { fakeCommonsPull, fakeRepoStatus } from '$lib/testing/sharing';

describe('CommonsStatus', () => {
  it('shows both heads and a badge that opens the notices', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(CommonsStatus, { target, props: { repo: fakeRepoStatus() } });
    flushSync();

    const heads = [...target.querySelectorAll('.head')].map((h) => h.textContent?.trim());
    expect(heads).toEqual(['log 81b54bf', 'commons 3f0c1a2 · clean']);

    const badge = target.querySelector<HTMLButtonElement>('button.badge')!;
    expect(badge.textContent).toBe('2 notices');
    expect(badge.getAttribute('aria-expanded')).toBe('false');
    expect(target.querySelector('[role="dialog"]')).toBeNull();

    badge.click();
    flushSync();
    const items = target.querySelectorAll('[role="dialog"] li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('site fra-goul shadows the commons record');
    expect(items[0].querySelector('a')?.getAttribute('href')).toBe('/admin/sites/fra-goul');
    expect(items[1].querySelector('a')?.getAttribute('href')).toBe('/admin/sites/fra-cabouy');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(target.querySelector('[role="dialog"]')).toBeNull();

    unmount(app);
    target.remove();
  });

  it('has no badge without notices and no commons part without a commons', () => {
    const target = document.createElement('div');
    const app = mount(CommonsStatus, {
      target,
      props: {
        repo: fakeRepoStatus({ notices: [], commons_head: null, commons_state: null }),
      },
    });
    flushSync();
    expect(target.querySelector('button.badge')).toBeNull();
    expect(target.querySelector('.commons')).toBeNull();
    expect(target.querySelector('.head')?.textContent).toBe('log 81b54bf');
    unmount(app);
  });

  it('says "1 notice" for one', () => {
    const target = document.createElement('div');
    const app = mount(CommonsStatus, {
      target,
      props: { repo: fakeRepoStatus({ notices: ['region nld-x shadows the commons record'] }) },
    });
    flushSync();
    expect(target.querySelector('button.badge')?.textContent).toBe('1 notice');
    unmount(app);
  });
});

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

describe('CommonsStatus commons pull', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pulls the commons and lists the new head and the stale sites', async () => {
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method });
        return new Response(JSON.stringify(fakeCommonsPull()));
      }),
    );
    const onPulled = vi.fn();
    const target = document.createElement('div');
    const app = mount(CommonsStatus, { target, props: { repo: fakeRepoStatus(), onPulled } });
    flushSync();

    const button = target.querySelector<HTMLButtonElement>('button.pull')!;
    expect(button.disabled).toBe(false);
    button.click();
    await settle();

    expect(calls).toEqual([{ url: '/api/v1/admin/commons/pull', method: 'POST' }]);
    expect(onPulled).toHaveBeenCalledOnce();
    const dialog = target.querySelector('[role="dialog"][aria-label="Commons pull"]')!;
    expect(dialog.textContent).toContain('Commons 3f0c1a2 → 9a8b7c6');
    expect(dialog.textContent).toContain('log pinned');
    const items = [...dialog.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('a')?.getAttribute('href'))).toEqual([
      '/admin/sites/fra-cabouy',
      '/admin/sites/fra-goul',
    ]);
    expect(items[0].textContent).toContain('r4 → r7');
    expect(items[0].querySelector('.new')).not.toBeNull();
    expect(items[1].querySelector('.new')).toBeNull();
    expect(items[1].querySelector('[data-origin="fork"]')).not.toBeNull();

    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Close')!.click();
    flushSync();
    expect(target.querySelector('[role="dialog"]')).toBeNull();
    unmount(app);
  });

  it('reports an unchanged head without stale sites, and a refused pull', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              fakeCommonsPull({
                previous_head: 'abc1234',
                head: 'abc1234',
                pinned: false,
                stale: [],
              }),
            ),
          ),
      ),
    );
    const target = document.createElement('div');
    const app = mount(CommonsStatus, { target, props: { repo: fakeRepoStatus() } });
    flushSync();
    target.querySelector<HTMLButtonElement>('button.pull')!.click();
    await settle();
    expect(target.textContent).toContain('Commons already at abc1234');
    expect(target.textContent).toContain('No overlay or fork is stale.');
    expect(target.textContent).not.toContain('log pinned');
    unmount(app);

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: 'commons: not a fast-forward' }), { status: 409 }),
      ),
    );
    const refused = document.createElement('div');
    const other = mount(CommonsStatus, { target: refused, props: { repo: fakeRepoStatus() } });
    flushSync();
    refused.querySelector<HTMLButtonElement>('button.pull')!.click();
    await settle();
    expect(refused.querySelector('.error')?.textContent).toBe('commons: not a fast-forward');
    unmount(other);
  });

  it('disables the pull with a reason when git is off for the commons', () => {
    const target = document.createElement('div');
    const app = mount(CommonsStatus, {
      target,
      props: { repo: fakeRepoStatus({ commons_state: 'disabled' }) },
    });
    flushSync();
    const button = target.querySelector<HTMLButtonElement>('button.pull')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('Git is disabled for the commons');
    unmount(app);
  });
});
