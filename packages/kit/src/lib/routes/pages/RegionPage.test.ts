import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({
  page: { url: new URL('http://localhost/dive/regions/fra-lot'), state: {} },
}));
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn(), goto: vi.fn() }));

import RegionPage from './RegionPage.svelte';
import type { MapSite, RegionSite } from '$lib/core/dive/types.js';
import { render } from '$lib/components/ui/__fixtures__/test-utils.js';

function site(slug: string, name: string, dives: number): RegionSite {
  return {
    slug,
    name,
    country_code: 'FR',
    country_name: 'France',
    region: 'fra-lot',
    area: null,
    lat: 44.6,
    lon: 1.7,
    site_type: 'cave',
    water: 'fresh',
    dives,
  };
}

function marker(slug: string, name: string, dives: number) {
  const year = dives ? 2024 : null;
  const dot: MapSite = {
    slug,
    name,
    country_code: 'FR',
    lat: 44.6,
    lon: 1.7,
    dives,
    minutes: dives * 60,
    site_type: 'cave',
    max_depth_m: dives ? 30 : 0,
    first_year: year,
    last_year: year,
  };
  return { ...dot, point: { x: 10, y: 10 } };
}

let destroy: (() => void) | undefined;
afterEach(() => destroy?.());

function region() {
  const rendered = render(RegionPage, {
    data: {
      page: 'region',
      region: {
        id: 'fra-lot',
        name: 'Lot',
        country: 'FRA',
        country_code: 'FR',
        waters: [],
        body_md: '',
        body_html: '',
        sites: [site('fra-ressel', 'Ressel', 4), site('fra-cabouy', 'Cabouy', 0)],
        dives: 4,
        stats: null,
        map_sites: [],
      },
      map: {
        landPath: 'M0 0',
        spherePath: 'M0 0',
        width: 100,
        height: 50,
        dots: [marker('fra-ressel', 'Ressel', 4), marker('fra-cabouy', 'Cabouy', 0)],
      },
      editHref: '/admin/regions/fra-lot',
      owner: null,
    },
  } as never);
  destroy = rendered.destroy;
  return rendered.target;
}

describe('RegionPage undived sites', () => {
  it('badges the sites without dives in the list', () => {
    const items = [...region().querySelectorAll('aside .sites li')];
    expect(items.map((li) => li.querySelector('a')?.textContent)).toEqual(['Ressel', 'Cabouy']);
    expect(items.map((li) => li.classList.contains('undived'))).toEqual([false, true]);
    expect(items[1].querySelector('[data-dived="no"]')?.textContent).toBe('not dived');
    expect(items[0].querySelector('[data-dived]')).toBeNull();
  });

  it('draws their markers hollow and names them not dived', () => {
    const target = region();
    const links = [...target.querySelectorAll('svg a.site')];
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Ressel, 4 dives',
      'Cabouy, not dived',
    ]);
    expect(links[1].classList.contains('undived')).toBe(true);
    expect(links[1].querySelector('.dot.hollow')).not.toBeNull();
    expect(links[0].querySelector('.dot.hollow')).toBeNull();
    expect(target.querySelector('.legend')?.textContent).toContain('not dived');
  });
});
