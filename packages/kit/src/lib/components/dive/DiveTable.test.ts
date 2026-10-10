import { afterEach, describe, expect, it, vi } from 'vitest';

const location = vi.hoisted(() => ({ url: new URL('http://localhost/dive?tag=cave'), state: {} }));
const navigation = vi.hoisted(() => ({ goto: vi.fn(async () => undefined) }));

vi.mock('$app/state', () => ({ page: location }));
vi.mock('$app/navigation', () => navigation);

import DiveTable from './DiveTable.svelte';
import type { DiveListItem } from '$lib/core/dive/types.js';
import { render } from '$lib/components/ui/__fixtures__/test-utils.js';

function dive(overrides: Partial<DiveListItem> = {}): DiveListItem {
  return {
    number: 650,
    title: '',
    date: '2026-02-08',
    time_in: null,
    duration_min: 62,
    max_depth_m: 14.2,
    water_temp_c: 25,
    tags: ['cave'],
    gas: 'nitrox',
    gases: ['EAN32'],
    mode: 'OC',
    site: {
      slug: 'mex-nohoch',
      name: 'Cenote Nohoch Nah Chich',
      country_code: 'MX',
      country_name: 'Mexico',
      region: 'quintana-roo',
      area: 'Tulum',
      lat: 20.3,
      lon: -87.4,
      site_type: 'cenote',
      water: 'fresh',
    },
    section: null,
    buddies: [
      { slug: 'kim', name: 'Kim', avatar_url: null },
      { slug: 'alex', name: 'Alex', avatar_url: null },
    ],
    gear_setup: null,
    rating: null,
    has_photos: false,
    has_profile: false,
    spark: null,
    cover_url: null,
    search_text: '',
    trip: { slug: 'mexico-2026', name: 'Mexico 2026' },
    ...overrides,
  };
}

let destroy: (() => void) | undefined;
afterEach(() => {
  destroy?.();
  navigation.goto.mockClear();
});

function table(props: Record<string, unknown>) {
  const rendered = render(DiveTable, props as never);
  destroy = rendered.destroy;
  return rendered.target;
}

describe('DiveTable rows', () => {
  it('links the title with a short name and the site, first buddy and trip separately', () => {
    const target = table({ dives: [dive()] });
    const links = [...target.querySelectorAll('li a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dive/650',
      '/dive/sites/mex-nohoch',
      '/dive/people/kim',
      '/dive/trips/mexico-2026',
    ]);
    const row = target.querySelector('.row-link')!;
    expect(row.getAttribute('aria-label')).toBe('Dive #650, Cenote Nohoch Nah Chich, 8 Feb 2026');
    expect(row.textContent?.trim()).toBe('Cenote Nohoch Nah Chich');
    expect(target.querySelector('.where')?.textContent).toContain('with Kim, Alex');
    expect(target.querySelector('.cover')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the trip to the month header when grouped by month', () => {
    const target = table({ dives: [dive()], groupBy: 'month' });
    expect(target.querySelector('.month')?.textContent).toContain('February 2026');
    expect(target.querySelector('.month a')?.getAttribute('href')).toBe('/dive/trips/mexico-2026');
    expect(target.querySelector('.trip-link')).toBeNull();
  });

  it('names a titled dive by its title and links the buddy on a site page', () => {
    const target = table({
      dives: [dive({ title: 'Through the Wakulla room', section: 'Main line' })],
      hideSite: true,
    });
    expect(target.querySelector('.row-link')?.getAttribute('aria-label')).toBe(
      'Dive #650, Through the Wakulla room, 8 Feb 2026',
    );
    expect(target.querySelector('a[href="/dive/sites/mex-nohoch"]')).toBeNull();
    expect(target.querySelector('.where a')?.getAttribute('href')).toBe('/dive/people/kim');
  });

  it('opens the dive with the filtered list as history state', () => {
    const target = table({ dives: [dive()] });
    const link = target.querySelector<HTMLAnchorElement>('.row-link')!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigation.goto).toHaveBeenCalledWith('/dive/650', {
      state: { from: '/dive?tag=cave' },
    });
  });

  it('says so when nothing matches', () => {
    expect(table({ dives: [] }).textContent).toContain('No dives match');
  });
});
