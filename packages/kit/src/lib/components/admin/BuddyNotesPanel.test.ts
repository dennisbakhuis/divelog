import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuddyNotesPanel from './BuddyNotesPanel.svelte';
import type { BuddyRow } from '$lib/core/dive/buddy-notes.js';
import { render, settle } from '$lib/components/ui/__fixtures__/test-utils.js';
import { toast } from '$lib/components/stores/toast.svelte';
import * as confirmModule from '$lib/core/ui/confirm.js';

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

  describe('under hostile input', () => {
    const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script>"\'&amp;';
    const signed = (overrides: Partial<BuddyRow> = {}) =>
      row({
        state: 'signed',
        note: {
          person: 'kim',
          comment: HOSTILE,
          strokes: [
            [
              ['<x>', NaN],
              [1, 2],
            ],
            null,
            [[3, 4]],
          ] as unknown as number[][][],
          signed_at: '2026-10-27T10:00:00Z',
          public: true,
        },
        ...overrides,
      });

    it('writes names and comments as text and keeps odd strokes from breaking the row', () => {
      const { target } = mountPanel([signed({ name: HOSTILE })]);
      expect(target.querySelector('img[src="x"]')).toBeNull();
      expect(target.querySelector('script')).toBeNull();
      expect(target.querySelector('[onerror]')).toBeNull();
      expect(target.querySelector('.comment')!.textContent).toBe(`“${HOSTILE}”`);
      expect(target.querySelector('svg path')!.getAttribute('d')).toBe('M1 2 L1 2 M3 4 L3 4');
      expect(target.querySelector('svg')!.getAttribute('aria-label')).toBe(
        `Signature of ${HOSTILE}`,
      );
    });

    it('encodes a person id into the link to the person page', () => {
      const { target } = mountPanel([signed({ id: '../x?y=1#"><b>' })]);
      const href = target.querySelector('.who a')!.getAttribute('href')!;
      expect(href).toBe('/admin/people/..%2Fx%3Fy%3D1%23%22%3E%3Cb%3E');
      expect(target.querySelector('.who b')).toBeNull();
    });

    it('words a request whose dates are broken instead of throwing', () => {
      const request = {
        person: 'kim',
        state: 'open' as const,
        sent_at: 'not a date',
        expires_at: '2026-13-40T00:00:00Z',
        signed_at: null,
      };
      const { target } = mountPanel([row({ state: 'open', request })]);
      expect(texts(target)[0]).toBe('asked on not a date, expires on 2026-13-40T00:00:00Z');
    });
  });

  describe('when the server refuses', () => {
    const note = {
      person: 'kim',
      comment: 'Hi',
      strokes: null,
      signed_at: '2026-10-27T10:00:00Z',
      public: true,
    };
    beforeEach(() => {
      vi.spyOn(confirmModule, 'confirmDialog').mockResolvedValue(true);
    });
    afterEach(() => vi.restoreAllMocks());

    it('keeps the note and says so when the delete fails', async () => {
      const show = vi.spyOn(toast, 'show');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{"detail":"locked"}', { status: 500 })),
      );
      const { target, props } = mountPanel([row({ state: 'signed', note })]);
      [...target.querySelectorAll('button')]
        .find((b) => b.textContent?.startsWith('Delete'))!
        .click();
      await settle();
      expect(props.ondeleted).not.toHaveBeenCalled();
      expect(show).toHaveBeenCalledWith({
        kind: 'error',
        message: 'Deleting the note failed: locked',
      });
      expect(
        [...target.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Delete'))!
          .disabled,
      ).toBe(false);
    });

    it('sends the delete to the slug, not the person id', async () => {
      const fetch = vi.fn(async () => new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', fetch);
      const { target, props } = mountPanel([
        row({ id: 'kim_de_boer', slug: 'kim', state: 'signed', note }),
      ]);
      [...target.querySelectorAll('button')]
        .find((b) => b.textContent?.startsWith('Delete'))!
        .click();
      await settle();
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/admin/dives/7/buddy-notes/kim',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(props.ondeleted).toHaveBeenCalledWith('kim');
    });

    it('says the buddy signed meanwhile when a resend is skipped', async () => {
      const show = vi.spyOn(toast, 'show');
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                sent: [],
                skipped: [{ person: 'kim', reason: 'signed' }],
                sign_requests: [],
              }),
              { status: 200 },
            ),
        ),
      );
      const request = {
        person: 'kim',
        state: 'open' as const,
        sent_at: '2026-10-25T10:00:00Z',
        expires_at: '2026-11-01T10:00:00Z',
        signed_at: null,
      };
      const { target } = mountPanel([row({ state: 'open', request })]);
      [...target.querySelectorAll('button')]
        .find((b) => b.textContent?.startsWith('Resend'))!
        .click();
      await settle();
      expect(show).toHaveBeenCalledWith({
        kind: 'info',
        message: 'Nobody new to ask; Kim signed already',
      });
    });
  });
});
