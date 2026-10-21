import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const navigation = vi.hoisted(() => ({
  beforeNavigate: vi.fn(),
  goto: vi.fn(async (_url: string, _opts?: { invalidateAll?: boolean }) => {}),
  invalidateAll: vi.fn(async () => {}),
}));
vi.mock('$app/navigation', () => navigation);
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin/dives/new') } }));

import AdminDiveNewPage from './AdminDiveNewPage.svelte';
import type { AdminDataFor } from '../admin';
import type { DiveTemplateOut } from '$lib/core/dive/types.js';
import { fakeDiveAdmin } from '$lib/components/admin/__fixtures__/dive.js';
import { fakeSite } from '$lib/testing/sharing.js';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
}

function pageData(nextNumber: number): AdminDataFor<'dive-new'> {
  return {
    page: 'dive-new',
    owner: 'owner@example.com',
    sites: [fakeSite()],
    trips: [],
    people: [],
    setups: [],
    regions: [],
    nextNumber,
    template: {
      date: '2026-02-08',
      next_number: nextNumber,
      previous: null,
      at_site: null,
      recent_sites: [],
      frequent_people: [],
      trip_for_date: null,
    } as DiveTemplateOut,
    prefill: { site: null, trip: null, person: null, date: '2026-02-08' },
  };
}

function render(nextNumber = 8) {
  const target = document.createElement('div');
  document.body.append(target);
  const props = $state({ data: pageData(nextNumber) });
  const app = mount(AdminDiveNewPage, { target, props });
  flushSync();
  return { target, app, props };
}

const field = (target: HTMLElement, id: string) =>
  target.querySelector<HTMLInputElement>(`#dl-dive-${id}`)!;

function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(fakeDiveAdmin({ number: 8 })), { status: 200 })),
  );
  navigation.goto.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('AdminDiveNewPage', () => {
  it('starts a blank form after every Save & new, also on the same link', async () => {
    const { target, app, props } = render(8);
    let next = 8;
    navigation.goto.mockImplementation(async (_url: string, opts?: { invalidateAll?: boolean }) => {
      if (opts?.invalidateAll) props.data = pageData(next);
    });
    for (next of [9, 9]) {
      type(field(target, 'duration_min'), '45');
      type(field(target, 'max_depth_m'), '18');
      const saveNew = [...target.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Save & new',
      )!;
      saveNew.click();
      await settle();
      expect(field(target, 'duration_min').value).toBe('');
      expect(field(target, 'number').value).toBe(String(next));
    }
    expect(navigation.goto).toHaveBeenCalledTimes(2);
    expect(navigation.goto).toHaveBeenLastCalledWith('/admin/dives/new?date=2026-02-08', {
      invalidateAll: true,
    });
    unmount(app);
  });

  it('keeps the form and its queued files when a pull reloads the page data', async () => {
    const { target, app, props } = render(8);
    type(field(target, 'title'), 'Hemmoor, E3');
    const input = target.querySelector<HTMLInputElement>('.photos input[type=file]')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'lake.jpg', { type: 'image/jpeg' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    props.data = pageData(9);
    await settle();
    expect(field(target, 'title').value).toBe('Hemmoor, E3');
    expect(target.querySelector('.queued')?.textContent).toContain('lake.jpg');
    expect(field(target, 'number').value).toBe('9');
    type(field(target, 'number'), '20');
    props.data = pageData(10);
    await settle();
    expect(field(target, 'number').value).toBe('20');
    unmount(app);
  });
});
