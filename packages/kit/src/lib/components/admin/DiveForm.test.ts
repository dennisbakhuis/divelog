import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/navigation', () => ({
  beforeNavigate: vi.fn(),
  goto: vi.fn(async () => {}),
  invalidateAll: vi.fn(async () => {}),
}));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin/dives/7') } }));

import DiveForm from './DiveForm.svelte';
import type { DiveAdmin } from '$lib/core/dive/types.js';
import { fakeSite } from '$lib/testing/sharing.js';
import { fakeDiveAdmin } from './__fixtures__/dive.js';

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

function fakeFetch() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify(fakeDiveAdmin()), { status: 200 });
    }),
  );
  return calls;
}

/** Mount the editor on a dive the test can swap, the way a reload hands the page a new one. */
function render(initial: DiveAdmin | null, sites = [fakeSite()]) {
  let current = initial;
  const target = document.createElement('div');
  document.body.append(target);
  const props = {
    get dive() {
      return current;
    },
    nextNumber: 8,
    sites,
    trips: [],
    people: [],
    setups: [],
    regions: [],
  };
  const app = mount(DiveForm, { target, props });
  flushSync();
  return {
    target,
    app,
    swap(next: DiveAdmin) {
      current = next;
    },
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

const saveButton = (target: HTMLElement) =>
  target.querySelector<HTMLButtonElement>('.save-bar button[type="submit"]')!;

const inputLabelled = (target: HTMLElement, text: string) =>
  [...target.querySelectorAll('label')]
    .find((l) => l.textContent?.trim().startsWith(text))
    ?.querySelector('input, select') as HTMLInputElement | null;

function key(el: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('DiveForm save', () => {
  it('keeps a cover set after the form opened, and the stored flags', async () => {
    const calls = fakeFetch();
    const { target, app, swap } = render(fakeDiveAdmin());
    swap(fakeDiveAdmin({ cover_attachment_id: 'p2', private: { flags: ['late'] } as never }));

    saveButton(target).click();
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].body?.cover_attachment_id).toBe('p2');
    expect(calls[0].body?.flags).toEqual(['late']);
    expect(calls[0].body).not.toHaveProperty('gas');
    expect(calls[0].body).not.toHaveProperty('o2_pct');
    unmount(app);
  });

  it('saves with Ctrl-S and Cmd-S', async () => {
    const calls = fakeFetch();
    const { app } = render(fakeDiveAdmin());
    const ctrl = key(window.document.body, { key: 's', ctrlKey: true });
    await settle();
    expect(ctrl.defaultPrevented).toBe(true);
    key(window.document.body, { key: 'S', metaKey: true });
    await settle();
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PUT']);
    unmount(app);
  });

  it('labels the publish state and the water temperatures apart from visibility', () => {
    const { target, app } = render(fakeDiveAdmin());
    expect(inputLabelled(target, 'Published as')?.tagName).toBe('SELECT');
    expect(inputLabelled(target, 'Water temp (°C)')).not.toBeNull();
    expect(inputLabelled(target, 'Surface water (°C)')).not.toBeNull();
    expect(inputLabelled(target, 'Visibility (m)')).not.toBeNull();
    unmount(app);
  });
});

describe('DiveForm Enter', () => {
  it('does not submit from a one-line field', async () => {
    const calls = fakeFetch();
    const { target, app } = render(fakeDiveAdmin());
    const title = inputLabelled(target, 'Title')!;
    expect(key(title, { key: 'Enter' }).defaultPrevented).toBe(true);
    const story = target.querySelector('textarea')!;
    expect(key(story, { key: 'Enter' }).defaultPrevented).toBe(false);
    await settle();
    expect(calls).toHaveLength(0);
    unmount(app);
  });

  it('picks the first matching site from the search, and Escape clears the search', async () => {
    const calls = fakeFetch();
    const sites = [
      fakeSite({ id: 'mex-tortuga', slug: 'tortuga', name: 'Cenote Tortuga' }),
      fakeSite({ id: 'mex-taj-mahal', slug: 'taj-mahal', name: 'Taj Mahal' }),
    ];
    const { target, app } = render(fakeDiveAdmin(), sites);
    const search = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'taj';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(key(search, { key: 'Enter' }).defaultPrevented).toBe(true);
    flushSync();
    expect(search.value).toBe('');
    expect(search.placeholder).toContain('Taj Mahal');

    search.value = 'cen';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    key(search, { key: 'Escape' });
    flushSync();
    expect(search.value).toBe('');
    expect(search.placeholder).toContain('Taj Mahal');
    await settle();
    expect(calls).toHaveLength(0);
    unmount(app);
  });
});

describe('DiveForm on a new dive', () => {
  it('starts without a made-up depth, duration or gas', () => {
    fakeFetch();
    const { target, app } = render(null);
    expect(inputLabelled(target, 'Duration (min)')!.value).toBe('');
    expect(inputLabelled(target, 'Max depth (m)')!.value).toBe('');
    unmount(app);
  });
});
