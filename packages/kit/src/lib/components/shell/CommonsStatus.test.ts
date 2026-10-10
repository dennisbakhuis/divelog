import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CommonsStatus from './CommonsStatus.svelte';
import { fakeRepoStatus } from '$lib/testing/sharing';

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
