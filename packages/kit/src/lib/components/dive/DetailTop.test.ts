import { afterEach, describe, expect, it, vi } from 'vitest';

const location = vi.hoisted(() => ({
  url: new URL('http://localhost/dive/650'),
  state: {} as Record<string, unknown>,
}));
const navigation = vi.hoisted(() => {
  const listeners: ((nav: { from: { url: URL } | null }) => void)[] = [];
  return {
    listeners,
    afterNavigate: vi.fn((fn: (nav: { from: { url: URL } | null }) => void) => {
      listeners.push(fn);
    }),
    goto: vi.fn(),
  };
});

vi.mock('$app/state', () => ({ page: location }));
vi.mock('$app/navigation', () => navigation);

import { flushSync } from 'svelte';
import DetailTop from './DetailTop.svelte';
import { render, settle } from '$lib/components/ui/__fixtures__/test-utils.js';

let destroy: (() => void) | undefined;
afterEach(() => {
  destroy?.();
  navigation.listeners.length = 0;
  location.state = {};
});

function top(props: Record<string, unknown> = {}) {
  const rendered = render(DetailTop, {
    back: { href: '/dive', label: 'Dive log' },
    label: 'Dive navigation',
    ...props,
  } as never);
  destroy = rendered.destroy;
  return rendered.target;
}

describe('DetailTop', () => {
  it('is a labelled navigation landmark with the plain list as fallback', async () => {
    const target = top();
    await settle();
    const nav = target.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Dive navigation');
    const back = nav.querySelector('a.back')!;
    expect(back.getAttribute('href')).toBe('/dive');
    expect(back.textContent).toBe('← Dive log');
  });

  it('goes back to the filtered list the visitor came from', async () => {
    location.state = { from: '/dive?tag=cave&year=2024' };
    const target = top();
    await settle();
    expect(target.querySelector('a.back')?.getAttribute('href')).toBe('/dive?tag=cave&year=2024');
  });

  it('uses the previous client-side URL when it was the list', async () => {
    const target = top();
    for (const listener of navigation.listeners)
      listener({ from: { url: new URL('http://localhost/dive?site=mex-nohoch') } });
    flushSync();
    await settle();
    expect(target.querySelector('a.back')?.getAttribute('href')).toBe('/dive?site=mex-nohoch');
  });

  it('ignores a previous page that is not the list', async () => {
    const target = top();
    for (const listener of navigation.listeners)
      listener({ from: { url: new URL('http://localhost/dive/sites/x?q=1') } });
    await settle();
    expect(target.querySelector('a.back')?.getAttribute('href')).toBe('/dive');
  });

  it('shows the owner links inline', async () => {
    const target = top({
      owner: { edit: { label: 'Edit', href: '/admin/dives/650' }, actions: [] },
    });
    await settle();
    expect(target.querySelector('.owner-bar a')?.getAttribute('href')).toBe('/admin/dives/650');
  });
});
