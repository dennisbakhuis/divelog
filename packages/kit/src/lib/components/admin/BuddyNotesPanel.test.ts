import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuddyNotesPanel from './BuddyNotesPanel.svelte';
import type { BuddyRow } from '$lib/core/dive/buddy-notes.js';
import { render, settle } from '$lib/components/ui/__fixtures__/test-utils.js';

function row(overrides: Partial<BuddyRow>): BuddyRow {
  return {
    id: 'kim_de_boer',
    slug: 'kim',
    name: 'Kim',
    email: 'kim@example.com',
    note: null,
    request: null,
    state: 'none',
    ...overrides,
  };
}

let destroy: (() => void) | undefined;
afterEach(() => {
  destroy?.();
  vi.unstubAllGlobals();
});

function mountPanel(rows: BuddyRow[], extra: Record<string, unknown> = {}) {
  const props = {
    number: 7,
    rows,
    choices: [],
    open: true,
    onpublic: vi.fn(),
    onrequests: vi.fn(),
    ondeleted: vi.fn(),
    ...extra,
  };
  const view = render(BuddyNotesPanel, props);
  destroy = view.destroy;
  return { ...view, props };
}

const texts = (target: HTMLElement) =>
  [...target.querySelectorAll('li')].map((li) => li.querySelector('.state')?.textContent);

describe('BuddyNotesPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('words every state of a request', () => {
    const { target } = mountPanel([
      row({ state: 'none' }),
      row({ id: 'robin', slug: 'robin', name: 'Robin', email: null, state: 'no_email' }),
      row({
        id: 'alex',
        slug: 'alex',
        name: 'Alex',
        state: 'expired',
        request: {
          person: 'alex',
          state: 'expired',
          sent_at: '2025-10-01T10:00:00Z',
          expires_at: '2025-10-08T10:00:00Z',
          signed_at: null,
        },
      }),
      row({
        id: 'sam',
        slug: 'sam',
        name: 'Sam',
        state: 'expired',
        request: {
          person: 'sam',
          state: 'expired',
          sent_at: '2026-10-20T10:00:00Z',
          expires_at: '2099-10-27T10:00:00Z',
          signed_at: null,
        },
      }),
    ]);
    expect(texts(target)).toEqual([
      'not asked',
      'no e-mail address',
      'asked on 1 October 2025, expired on 8 October 2025',
      'asked on 20 October; the link no longer signs',
    ]);
    const add = [...target.querySelectorAll('a')].find((a) =>
      a.textContent?.startsWith('Add an e-mail address'),
    )!;
    expect(add.getAttribute('href')).toBe('/admin/people/robin');
    expect(add.textContent).toBe('Add an e-mail address for Robin');
  });

  it('offers Resend on an expired request but not on a draft', () => {
    const expired = row({
      state: 'expired',
      request: {
        person: 'kim',
        state: 'expired',
        sent_at: '2025-10-01T10:00:00Z',
        expires_at: '2025-10-08T10:00:00Z',
        signed_at: null,
      },
    });
    const live = mountPanel([expired]);
    const resend = [...live.target.querySelectorAll('button')].find(
      (b) => b.textContent === 'Resend to Kim',
    )!;
    expect(resend.disabled).toBe(false);
    expect(live.target.textContent).not.toContain('Withdraw');
    destroy?.();
    const draft = mountPanel([expired], { draft: true });
    expect(
      [...draft.target.querySelectorAll('button')].find((b) => b.textContent === 'Resend to Kim')!
        .disabled,
    ).toBe(true);
  });

  it('keeps a note when the owner cancels the delete', async () => {
    vi.stubGlobal('confirm', () => false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { target, props } = mountPanel([
      row({
        state: 'signed',
        note: {
          person: 'kim',
          comment: null,
          strokes: [[[1, 1]]],
          signed_at: '2026-10-27T10:00:00Z',
          public: false,
        },
      }),
    ]);
    expect(target.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(target.querySelector('.comment')).toBeNull();
    [...target.querySelectorAll('button')]
      .find((b) => b.textContent === "Delete Kim's note")!
      .click();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(props.ondeleted).not.toHaveBeenCalled();
  });

  it('reports the public switch of a note the form did not open with', () => {
    const { target, props } = mountPanel([
      row({
        state: 'signed',
        note: {
          person: 'kim',
          comment: 'Hi',
          strokes: null,
          signed_at: '2026-10-27T10:00:00Z',
          public: true,
        },
      }),
    ]);
    expect(target.querySelector('svg')).toBeNull();
    target.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    expect(props.onpublic).toHaveBeenCalledWith('kim', false);
  });
});
