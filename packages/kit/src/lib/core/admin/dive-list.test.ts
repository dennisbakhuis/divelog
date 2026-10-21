import { describe, expect, it } from 'vitest';
import type { ImportResult } from '$lib/core/dive/types.js';
import {
  DEFAULT_LIST_QUERY,
  ariaSort,
  draftNeighbours,
  importLines,
  listParams,
  listSearch,
  numberRanges,
  pagePath,
  parseListQuery,
  toggleSort,
} from './dive-list.js';

describe('the list query', () => {
  it('reads the filter and sort from the URL, falling back to the defaults', () => {
    expect(parseListQuery(new URLSearchParams(''))).toEqual(DEFAULT_LIST_QUERY);
    expect(
      parseListQuery(new URLSearchParams('q=%20ressel%20&status=draft&sort=depth&asc=1')),
    ).toEqual({ q: 'ressel', status: 'draft', sort: 'depth', asc: true });
    expect(parseListQuery(new URLSearchParams('status=gone&sort=x&asc=true'))).toEqual({
      ...DEFAULT_LIST_QUERY,
      asc: true,
    });
  });

  it('writes only what differs from the defaults', () => {
    expect(listSearch(DEFAULT_LIST_QUERY)).toBe('');
    const query = { q: 'anna', status: 'draft' as const, sort: 'number' as const, asc: true };
    expect(listSearch(query)).toBe('?q=anna&status=draft&sort=number&asc=1');
    expect(parseListQuery(listParams(query))).toEqual(query);
  });

  it('asks the API for one page with every parameter', () => {
    expect(pagePath(DEFAULT_LIST_QUERY)).toBe(
      '/admin/dives/page?offset=0&limit=100&sort=date&asc=false',
    );
    expect(pagePath({ q: 'a b', status: 'public', sort: 'duration', asc: true }, 200, 50)).toBe(
      '/admin/dives/page?offset=200&limit=50&q=a+b&status=public&sort=duration&asc=true',
    );
  });

  it('flips the direction on the same column and starts a new one largest first', () => {
    const byDepth = toggleSort(DEFAULT_LIST_QUERY, 'depth');
    expect(byDepth).toMatchObject({ sort: 'depth', asc: false });
    expect(toggleSort(byDepth, 'depth')).toMatchObject({ sort: 'depth', asc: true });
    expect(ariaSort(byDepth, 'depth')).toBe('descending');
    expect(ariaSort(toggleSort(byDepth, 'depth'), 'depth')).toBe('ascending');
    expect(ariaSort(byDepth, 'date')).toBe('none');
  });
});

describe('drafts', () => {
  it('finds the drafts before and after one', () => {
    expect(draftNeighbours([3, 5, 9], 5)).toEqual({ previous: 3, next: 9 });
    expect(draftNeighbours([3, 5, 9], 3)).toEqual({ previous: null, next: 5 });
    expect(draftNeighbours([3, 5, 9], 9)).toEqual({ previous: 5, next: null });
    expect(draftNeighbours([3, 5], 7)).toEqual({ previous: null, next: 3 });
    expect(draftNeighbours([], 7)).toEqual({ previous: null, next: null });
  });

  it('collapses runs of numbers', () => {
    expect(numberRanges([14, 12, 13, 20, 20])).toBe('#12–#14, #20');
    expect(numberRanges([])).toBe('');
  });
});

describe('importLines', () => {
  const base: ImportResult = {
    import_id: '',
    created: [651, 652],
    updated: [650],
    skipped: 1,
    sites_created: 1,
    sites_matched: 2,
    sites: [],
    dry_run: true,
    dives_in_file: 4,
    first_date: '2026-02-07',
    last_date: '2026-02-08',
    dives: [],
  };

  it('says what a dry run would do', () => {
    expect(importLines(base)).toEqual([
      '4 dives in the file from 2026-02-07 to 2026-02-08',
      '2 new drafts would be created',
      '1 logged dive would get a profile',
      '1 already imported, skipped',
      '2 sites matched, 1 new site to create',
    ]);
  });

  it('says what an import did', () => {
    const done = {
      ...base,
      dry_run: false,
      created: [651],
      updated: [],
      skipped: 0,
      sites_created: 0,
      sites_matched: 0,
      dives_in_file: 1,
      last_date: '2026-02-07',
    };
    expect(importLines(done)).toEqual([
      '1 dive in the file on 2026-02-07',
      '1 new draft created',
      '0 logged dives got a profile',
    ]);
    expect(importLines({ ...done, dives_in_file: 0, sites_created: 2 })).toContain(
      '0 sites matched, 2 new sites created',
    );
  });
});
