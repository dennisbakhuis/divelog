import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/navigation', () => ({
  goto: vi.fn(async () => {}),
  invalidateAll: vi.fn(async () => {}),
}));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin') } }));

import { goto, invalidateAll } from '$app/navigation';
import AdminDivesPage from './AdminDivesPage.svelte';
import { DEFAULT_LIST_QUERY, type DiveListQuery } from '$lib/core/admin/dive-list.js';
import type { AdminDiveRow } from '$lib/core/dive/types.js';

function row(overrides: Partial<AdminDiveRow>): AdminDiveRow {
  return {
    number: 1,
    date: '2026-01-01',
    title: '',
    site_name: null,
    max_depth_m: 10,
    duration_min: 30,
    tags: [],
    attachments: 0,
    visibility: 'public',
    time_in: null,
    site_id: null,
    trip: null,
    ...overrides,
  };
}

const rows: AdminDiveRow[] = [
  row({
    number: 12,
    date: '2026-02-22',
    title: 'Sump two',
    site_name: 'Ressel',
    site_id: 'fra-ressel',
    max_depth_m: 31.5,
    duration_min: 95,
    tags: ['cave', 'scooter'],
    attachments: 3,
    trip: { slug: 'lot-2026', name: 'Lot 2026' },
  }),
  row({ number: 11, date: '2026-02-21', site_name: 'Cabouy', visibility: 'draft' }),
  row({ number: 10, date: '2026-01-02', visibility: 'private' }),
];

type Data = { query: DiveListQuery; rows: AdminDiveRow[]; total: number; drafts: number };

function render(data: Partial<Data> = {}) {
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(AdminDivesPage, {
    target,
    props: {
      data: {
        page: 'dives' as const,
        query: DEFAULT_LIST_QUERY,
        rows,
        total: 250,
        drafts: 1,
        owner: 'owner@example.com',
        ...data,
      },
    },
  });
  flushSync();
  return { target, app };
}

function cells(target: HTMLElement): string[][] {
  return [...target.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  );
}

const button = (target: HTMLElement, text: string) =>
  [...target.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text))!;

async function settle() {
  for (let i = 0; i < 4; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

const calls: { url: string; method: string; body?: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.mocked(goto).mockClear();
  vi.mocked(invalidateAll).mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.includes('/admin/dives/publish'))
        return new Response(JSON.stringify({ published: [11], unchanged: [] }));
      return new Response(
        JSON.stringify({ items: [row({ number: 9 })], total: 250, offset: 3, limit: 100 }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('AdminDivesPage', () => {
  it('renders the rows with a title link and secondary site and trip links', () => {
    const { target, app } = render();
    expect(target.querySelector('h1')?.textContent).toContain('250');
    expect(target.querySelector('.drafts')?.getAttribute('href')).toBe('/admin/dives?status=draft');
    const table = cells(target);
    expect(table).toHaveLength(3);
    expect(table[0].slice(1, 3)).toEqual(['12', '22 Feb 2026']);
    expect(table[0][3]).toBe('Sump two Ressel·Lot 2026');
    expect(table[0].slice(4, 9)).toEqual(['31.5 m', '95 min', 'cave, scooter', '3', 'public']);
    expect(table[1][3]).toBe('Cabouy');
    expect(table[2][3]).toBe('Untitled');
    const links = [...target.querySelectorAll('tbody tr:first-child a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual([
      '/admin/dives/12',
      '/admin/sites/fra-ressel',
      '/admin/trips/lot-2026',
      '/dive/12',
    ]);
    expect(target.querySelector('a[href="/admin/dives/new"]')?.textContent).toContain('New dive');
    const shearwater = target.querySelector('a[href="/admin/import#shearwater-cloud"]')!;
    expect(shearwater.textContent?.trim()).toBe('Import from Shearwater');
    expect(shearwater.classList.contains('dl-btn-ghost')).toBe(true);
    expect(shearwater.nextElementSibling?.getAttribute('href')).toBe('/admin/dives/new');
    expect(target.querySelector('[role=status]')?.textContent).toContain('Showing 3 of 250');
    unmount(app);
  });

  it('puts the search and the status in the URL', () => {
    vi.useFakeTimers();
    const { target, app } = render();
    const search = target.querySelector<HTMLInputElement>('#dl-dives-q')!;
    expect(target.querySelector('label[for="dl-dives-q"]')?.textContent).toContain('Search dives');
    search.value = 'cabouy';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(goto).toHaveBeenLastCalledWith(
      '/admin?q=cabouy',
      expect.objectContaining({ keepFocus: true, replaceState: true }),
    );
    button(target, 'Drafts').click();
    expect(goto).toHaveBeenLastCalledWith('/admin?status=draft', expect.anything());
    expect(button(target, 'All').getAttribute('aria-pressed')).toBe('true');
    unmount(app);
  });

  it('sorts by a column and flips it on a second click', () => {
    const { target, app } = render({ query: { ...DEFAULT_LIST_QUERY, sort: 'depth' } });
    const depth = button(target, 'Depth');
    expect(depth.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(button(target, 'Date').closest('th')?.getAttribute('aria-sort')).toBe('none');
    depth.click();
    expect(goto).toHaveBeenLastCalledWith('/admin?sort=depth&asc=1', expect.anything());
    button(target, '#').click();
    expect(goto).toHaveBeenLastCalledWith('/admin?sort=number', expect.anything());
    unmount(app);
  });

  it('shows the next page under the rows', async () => {
    const { target, app } = render();
    button(target, 'Show 100 more').click();
    await settle();
    expect(calls[0].url).toBe('/api/v1/admin/dives/page?offset=3&limit=100&sort=date&asc=false');
    expect(cells(target).map((r) => r[1])).toEqual(['12', '11', '10', '9']);
    unmount(app);
  });

  it('publishes the selected drafts', async () => {
    const { target, app } = render();
    const publish = button(target, 'Publish selected drafts');
    expect(publish.disabled).toBe(true);
    const boxes = target.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].getAttribute('aria-label')).toBe('Select draft #11');
    boxes[0].click();
    flushSync();
    expect(publish.textContent).toContain('(1)');
    publish.click();
    await settle();
    expect(calls[0]).toMatchObject({
      url: '/api/v1/admin/dives/publish',
      method: 'POST',
      body: { numbers: [11] },
    });
    expect(invalidateAll).toHaveBeenCalled();
    unmount(app);
  });

  it('opens the dive from anywhere on its row', () => {
    const { target, app } = render();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const [first, second] = target.querySelectorAll<HTMLTableRowElement>('tbody tr');
    first.querySelectorAll('td')[2].click();
    expect(goto).toHaveBeenLastCalledWith('/admin/dives/12');
    second.querySelector<HTMLElement>('.status')!.click();
    expect(goto).toHaveBeenLastCalledWith('/admin/dives/11');
    expect(open).not.toHaveBeenCalled();
    unmount(app);
  });

  it('opens the row in a new tab with a modifier or the middle button', () => {
    const { target, app } = render();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const date = target.querySelectorAll('tbody tr')[0].querySelectorAll('td')[2];
    date.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
    date.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    date.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    date.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }));
    expect(open).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenCalledWith('/admin/dives/12', '_blank', 'noopener');
    expect(goto).not.toHaveBeenCalled();
    unmount(app);
  });

  it('leaves the controls on and around a row to themselves', () => {
    const { target, app } = render();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    for (const [chip, url] of [
      ['Public', '/admin?status=public'],
      ['Drafts', '/admin?status=draft'],
      ['Private', '/admin?status=private'],
      ['All', '/admin'],
    ]) {
      button(target, chip).click();
      expect(goto).toHaveBeenLastCalledWith(url, expect.anything());
    }
    vi.mocked(goto).mockClear();
    const [first, second] = target.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const draft = second.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    draft.click();
    flushSync();
    expect(draft.checked).toBe(true);
    const stay = (e: Event) => e.preventDefault();
    document.addEventListener('click', stay);
    first.querySelector<HTMLElement>('.secondary a')!.click();
    first.querySelector<HTMLElement>('.view')!.click();
    first.querySelector<HTMLElement>('.row-link')!.click();
    expect(goto).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    document.removeEventListener('click', stay);
    unmount(app);
  });

  it('does not open the row when its text is being selected', () => {
    const { target, app } = render();
    const date = target.querySelectorAll('tbody tr')[0].querySelectorAll('td')[2];
    getSelection()!.selectAllChildren(date);
    date.click();
    expect(goto).not.toHaveBeenCalled();
    getSelection()!.removeAllRanges();
    unmount(app);
  });

  it('says when nothing matches, and invites the first dive', () => {
    const filtered = render({ rows: [], total: 0, query: { ...DEFAULT_LIST_QUERY, q: 'zzz' } });
    expect(filtered.target.textContent).toContain('No dives match');
    unmount(filtered.app);
    const empty = render({ rows: [], total: 0, drafts: 0 });
    expect(empty.target.querySelector('.empty a')?.textContent).toBe('Log your first dive');
    unmount(empty.app);
  });
});
