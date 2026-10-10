import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ImportSites from './ImportSites.svelte';
import type { ImportSite } from '$lib/core/dive/types.js';

const sites: ImportSite[] = [
  {
    subsurface_uuid: 'a1',
    name: 'Ressel',
    site_id: 'fra-ressel',
    outcome: 'matched',
    matched_by: 'alias',
    distance_m: 42,
    origin: 'commons',
  },
  {
    subsurface_uuid: 'b2',
    name: 'Vinkeveen',
    site_id: 'nld-vinkeveen',
    outcome: 'matched',
    matched_by: 'uuid',
    distance_m: null,
    origin: 'log',
  },
  {
    subsurface_uuid: null,
    name: 'New quarry',
    site_id: 'nld-new-quarry',
    outcome: 'created',
    matched_by: null,
    distance_m: null,
    origin: 'log',
  },
];

describe('ImportSites', () => {
  it('lists each imported site with its match and origin', () => {
    const target = document.createElement('div');
    const app = mount(ImportSites, { target, props: { sites } });
    flushSync();
    const rows = [...target.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['Ressel', 'fra-ressel', 'matched by alias · 42 m', 'commons'],
      ['Vinkeveen', 'nld-vinkeveen', 'matched by Subsurface id', 'personal'],
      ['New quarry', 'nld-new-quarry', 'created as a personal site', 'personal'],
    ]);
    expect(target.querySelector('tbody a')?.getAttribute('href')).toBe('/admin/sites/fra-ressel');
    expect(target.querySelector('[data-origin="commons"]')).not.toBeNull();
    expect(target.querySelectorAll('tr.created')).toHaveLength(1);
    unmount(app);
  });

  it('renders nothing for an import without sites', () => {
    const target = document.createElement('div');
    const app = mount(ImportSites, { target, props: { sites: [] } });
    flushSync();
    expect(target.querySelector('table')).toBeNull();
    unmount(app);
  });
});
