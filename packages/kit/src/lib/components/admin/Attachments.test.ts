import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const navigation = vi.hoisted(() => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => navigation);

import Attachments from './Attachments.svelte';
import { toast } from '$lib/components/stores/toast.svelte';
import { fakeAttachment, fakeDiveAdmin } from './__fixtures__/dive.js';

type Call = { url: string; method: string; body: unknown };

function fakeFetch(status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return status === 200
        ? new Response('{}', { status })
        : new Response(JSON.stringify({ detail: 'Dive is locked' }), { status });
    }),
  );
  return calls;
}

const dive = fakeDiveAdmin({
  cover_attachment_id: 'a',
  attachments: [
    fakeAttachment({ id: 'a', sort: 0, original_name: 'a.jpg' }),
    fakeAttachment({ id: 'b', sort: 1, original_name: 'b.jpg' }),
    fakeAttachment({ id: 'c', sort: 2, original_name: 'c.jpg' }),
  ],
});

function render() {
  const target = document.createElement('div');
  const app = mount(Attachments, { target, props: { dive } });
  flushSync();
  return { target, app };
}

const buttons = (target: HTMLElement, label: string) =>
  [...target.querySelectorAll('button')].filter(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  );

async function settle() {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

beforeEach(() => {
  navigation.invalidateAll.mockClear();
  for (const t of [...toast.items]) toast.dismiss(t.id);
});
afterEach(() => vi.unstubAllGlobals());

describe('Attachments', () => {
  it('sets the cover with a PATCH of the cover alone', async () => {
    const calls = fakeFetch();
    const { target, app } = render();
    buttons(target, 'Set cover')[0].click();
    await settle();
    expect(calls).toEqual([
      { url: '/api/v1/admin/dives/7', method: 'PATCH', body: { cover_attachment_id: 'b' } },
    ]);
    expect(navigation.invalidateAll).toHaveBeenCalledOnce();
    unmount(app);
  });

  it('moves an attachment with one ordered PUT', async () => {
    const calls = fakeFetch();
    const { target, app } = render();
    buttons(target, 'Move down')[0].click();
    await settle();
    expect(calls).toEqual([
      {
        url: '/api/v1/admin/dives/7/attachments/order',
        method: 'PUT',
        body: ['b', 'a', 'c'],
      },
    ]);
    buttons(target, 'Move up')[0].click();
    await settle();
    expect(calls).toHaveLength(1);
    unmount(app);
  });

  it('shows a rejected request as an error toast instead of failing silently', async () => {
    fakeFetch(409);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const { target, app } = render();
    buttons(target, 'Set cover')[0].click();
    await settle();
    buttons(target, 'Delete')[0].click();
    await settle();
    const caption = target.querySelector<HTMLInputElement>('input[placeholder="Caption"]')!;
    caption.value = 'Blue';
    caption.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(toast.items.map((t) => [t.kind, t.message])).toEqual([
      ['error', 'Could not set the cover: Dive is locked'],
      ['error', 'Could not delete a.jpg: Dive is locked'],
      ['error', 'Could not update a.jpg: Dive is locked'],
    ]);
    expect(navigation.invalidateAll).not.toHaveBeenCalled();
    unmount(app);
  });
});
