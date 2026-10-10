import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ChangeList from './ChangeList.svelte';
import type { ChangeEntry } from '$lib/core/dive/types';

const entries: ChangeEntry[] = [
  { revision: 2, date: '2026-10-09', author: 'dennis', note: 'Added the second sump' },
  { revision: 1, date: '2026-10-01', author: null, note: 'Created' },
];

describe('ChangeList', () => {
  it('lists the entries newest first with revision, note and author', () => {
    const target = document.createElement('div');
    const app = mount(ChangeList, { target, props: { entries } });
    flushSync();
    const items = target.querySelectorAll('ol.dl-changelog li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('r2');
    expect(items[0].textContent).toContain('Added the second sump');
    expect(items[0].textContent).toContain('· dennis');
    expect(items[1].textContent).toContain('r1');
    expect(items[1].textContent).not.toContain('·');
    expect(target.querySelector('.dl-changelog-empty')).toBeNull();
    unmount(app);
  });

  it('shows the empty text when there are no entries', () => {
    const target = document.createElement('div');
    const app = mount(ChangeList, { target, props: { entries: [], empty: 'Never saved.' } });
    flushSync();
    expect(target.querySelector('ol')).toBeNull();
    expect(target.querySelector('.dl-changelog-empty')?.textContent).toBe('Never saved.');
    unmount(app);
  });

  it('falls back to the default empty text', () => {
    const target = document.createElement('div');
    const app = mount(ChangeList, { target, props: { entries: [] } });
    flushSync();
    expect(target.textContent).toContain('No changes recorded yet.');
    unmount(app);
  });
});
