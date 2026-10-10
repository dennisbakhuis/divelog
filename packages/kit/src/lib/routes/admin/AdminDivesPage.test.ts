import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AdminDivesPage from './AdminDivesPage.svelte';
import type { AdminDiveListItem } from '$lib/core/dive/types';

const dives: AdminDiveListItem[] = [
  {
    number: 12,
    date: '2026-02-22',
    title: 'Sump two',
    site_name: 'Ressel',
    max_depth_m: 31.5,
    duration_min: 95,
    tags: ['cave', 'scooter'],
    attachments: 3,
    visibility: 'public',
  },
  {
    number: 11,
    date: '2026-02-21',
    title: '',
    site_name: 'Cabouy',
    max_depth_m: 12,
    duration_min: 40,
    tags: [],
    attachments: 0,
    visibility: 'draft',
  },
  {
    number: 10,
    date: '2026-01-02',
    title: '',
    site_name: null,
    max_depth_m: 6,
    duration_min: 30,
    tags: [],
    attachments: 0,
    visibility: 'private',
  },
];

function render() {
  const target = document.createElement('div');
  const app = mount(AdminDivesPage, {
    target,
    props: { data: { page: 'dives', dives, owner: 'owner@example.com' } },
  });
  flushSync();
  return { target, app };
}

function cells(target: HTMLElement): string[][] {
  return [...target.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? ''),
  );
}

describe('AdminDivesPage', () => {
  it('renders every column of every row and counts the drafts', () => {
    const { target, app } = render();
    expect(target.querySelector('h1')?.textContent).toContain('3');
    expect(target.querySelector('.drafts')?.textContent).toBe('1 draft');
    const rows = cells(target);
    expect(rows).toHaveLength(3);
    expect(rows[0][2]).toMatch(/^Sump two\s*· Ressel$/);
    expect([...rows[0].slice(0, 2), ...rows[0].slice(3, 8)]).toEqual([
      '12',
      '22 Feb 2026',
      '31.5 m',
      '95 min',
      'cave, scooter',
      '3',
      'public',
    ]);
    expect(rows[1][2]).toBe('Cabouy');
    expect(rows[1][6]).toBe('');
    expect(rows[2][2]).toBe('Untitled');
    const links = target.querySelectorAll('tbody tr:first-child a');
    expect(links[0].getAttribute('href')).toBe('/admin/dives/12');
    expect(links[1].getAttribute('href')).toBe('/dive/12');
    unmount(app);
  });

  it('filters by text, including the site name, and by status', () => {
    const { target, app } = render();
    const search = target.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'cabouy';
    search.dispatchEvent(new Event('input'));
    flushSync();
    expect(cells(target).map((r) => r[0])).toEqual(['11']);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    const status = target.querySelector<HTMLSelectElement>('select')!;
    status.value = 'private';
    status.dispatchEvent(new Event('change'));
    flushSync();
    expect(cells(target).map((r) => r[0])).toEqual(['10']);
    unmount(app);
  });
});
