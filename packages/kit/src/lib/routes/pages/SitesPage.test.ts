import { afterEach, describe, expect, it, vi } from 'vitest';

const location = vi.hoisted(() => ({
  url: new URL('http://localhost/dive/sites'),
  state: {} as Record<string, unknown>,
}));
const navigation = vi.hoisted(() => ({ replaceState: vi.fn() }));

vi.mock('$app/state', () => ({ page: location }));
vi.mock('$app/navigation', () => navigation);
vi.mock('$lib/components/anim/reveal', () => ({ reveal: () => {} }));

import { flushSync } from 'svelte';
import SitesPage from './SitesPage.svelte';
import { groupSites } from '../public.js';
import type { Site } from '$lib/core/dive/types.js';
import { atlasSite, commonsSite, fakeSite } from '$lib/testing/sharing.js';
import { render, settle } from '$lib/components/ui/__fixtures__/test-utils.js';

let destroy: (() => void) | undefined;
afterEach(() => {
  destroy?.();
  navigation.replaceState.mockClear();
  location.url = new URL('http://localhost/dive/sites');
});

function sites(list: Site[]) {
  const rendered = render(SitesPage, {
    data: {
      page: 'sites',
      countries: groupSites(list, []),
      types: [...new Set(list.map((s) => s.site_type))].sort(),
      total: list.length,
      editHref: '/admin/sites',
      owner: null,
    },
  } as never);
  destroy = rendered.destroy;
  return rendered.target;
}

const names = (target: HTMLElement) =>
  [...target.querySelectorAll('.site-name')].map((n) => n.textContent);
const toggle = (target: HTMLElement) =>
  [...target.querySelectorAll<HTMLLabelElement>('label')].find((l) =>
    l.textContent?.includes('Only my dives'),
  );

describe('SitesPage undived sites', () => {
  it('marks a site without dives as not dived in text', () => {
    const target = sites([fakeSite(), commonsSite(), atlasSite()]);
    const card = target.querySelector<HTMLAnchorElement>('a.site[href="/dive/sites/fra-cabouy"]')!;
    expect(card.classList.contains('undived')).toBe(true);
    expect(card.querySelector('[data-dived="no"]')?.textContent).toBe('not dived');
    expect(card.textContent).not.toContain('0 dives');
    const dived = target.querySelector('a.site[href="/dive/sites/fra-ressel"]')!;
    expect(dived.classList.contains('undived')).toBe(false);
    expect(dived.querySelector('[data-dived]')).toBeNull();
    expect(dived.textContent).toContain('2 dives');
  });

  it('offers only my dives when undived sites are listed, and mirrors it in the URL', async () => {
    const target = sites([fakeSite(), commonsSite(), atlasSite()]);
    expect(names(target)).toEqual(['Example Quarry', 'Émergence du Ressel', 'Cabouy']);
    const input = toggle(target)!.querySelector('input')!;
    expect(input.type).toBe('checkbox');
    input.click();
    flushSync();
    expect(names(target)).toEqual(['Example Quarry', 'Émergence du Ressel']);
    await settle();
    expect(navigation.replaceState).toHaveBeenLastCalledWith('/dive/sites?mine=1', {});
    input.click();
    flushSync();
    expect(names(target)).toHaveLength(3);
  });

  it('starts filtered from mine=1', () => {
    location.url = new URL('http://localhost/dive/sites?mine=1');
    const target = sites([commonsSite(), atlasSite()]);
    expect(toggle(target)!.querySelector('input')!.checked).toBe(true);
    expect(names(target)).toEqual(['Émergence du Ressel']);
  });

  it('has no toggle when every site was dived', () => {
    const target = sites([fakeSite(), commonsSite()]);
    expect(toggle(target)).toBeUndefined();
    expect(target.querySelector('[data-dived]')).toBeNull();
  });
});
