import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

const nav = vi.hoisted(() => ({
  page: { url: new URL('http://localhost/dive/9?sign=t0k'), state: { from: '/dive?tag=cave' } },
}));

vi.mock('$app/state', () => ({ page: nav.page }));
vi.mock('$app/navigation', () => ({
  afterNavigate: vi.fn(),
  goto: vi.fn(),
  replaceState: vi.fn(),
}));

import { goto, replaceState } from '$app/navigation';
import DiveDetailPage from './DiveDetailPage.svelte';
import type { DiveSigning } from '../public.js';
import type { BuddyNote, Dive } from '$lib/core/dive/types.js';
import { render, settle } from '$lib/components/ui/__fixtures__/test-utils.js';

/** A dive as the public page receives it: no site, no profile, no photos. */
function publicDive(overrides: Partial<Dive> = {}): Dive {
  return {
    number: 9,
    title: 'Lake morning',
    date: '2026-10-25',
    time_in: '10:00',
    time_out: '10:45',
    duration_min: 45,
    max_depth_m: 18,
    avg_depth_m: null,
    water_temp_c: 12,
    surface_temp_c: null,
    air_temp_c: null,
    thermocline_m: null,
    visibility_m: null,
    visibility_raw: null,
    site: null,
    section: null,
    trip: null,
    tags: [],
    types_raw: null,
    gas: 'air',
    he_pct: null,
    gas_raw: null,
    mode: 'OC',
    suit: null,
    weights_kg: null,
    cylinder: null,
    pressure_in_bar: null,
    pressure_out_bar: null,
    tanks: [],
    sac_l_min: null,
    sac_basis: null,
    safety_stop_min: null,
    surface_interval: null,
    conditions: null,
    difficulty: null,
    course: null,
    rating: null,
    gear_setup: null,
    guide: null,
    body_md: '',
    body_html: '',
    notes_nl: null,
    visibility: 'private',
    buddies: [
      {
        slug: 'alex',
        name: 'Alex',
        avatar_url: null,
        dives_together: 1,
        first_together: false,
        first_dive: null,
        last_dive: null,
      },
    ],
    attachments: [],
    cover_attachment_id: null,
    computer: [],
    profile: null,
    profile_meta: null,
    map_annotation: null,
    annotation_stale: false,
    annotation_dropped_legs: 0,
    map: null,
    prev_number: null,
    next_number: null,
    prev_site_name: null,
    next_site_name: null,
    site_dive_index: null,
    day_index: null,
    same_day: [],
    context_facts: [],
    buddy_notes: [],
    private: null,
    ...overrides,
  } as unknown as Dive;
}

const open: DiveSigning = {
  state: 'open',
  number: 9,
  token: 't0k',
  signer: { slug: 'alex', first_name: 'Alex' },
  expires_at: '2026-11-01T10:00:00Z',
  note: null,
};

const note: BuddyNote = {
  person: 'alex',
  comment: 'Cold feet, great vis.',
  strokes: [
    [
      [10, 10],
      [20, 30],
    ],
  ],
  signed_at: '2026-10-27T19:40:00+02:00',
  public: true,
};

let destroy: (() => void) | undefined;
afterEach(() => {
  destroy?.();
  vi.unstubAllGlobals();
  vi.mocked(replaceState).mockClear();
});
beforeEach(() => {
  nav.page.url = new URL('http://localhost/dive/9?sign=t0k');
});

function mountPage(signing: DiveSigning | null, dive: Dive = publicDive()) {
  const rendered = render(DiveDetailPage, {
    data: { page: 'dive', dive, editHref: '/admin/dives/9', signing, owner: null },
  });
  destroy = rendered.destroy;
  return rendered.target;
}

const box = (target: HTMLElement) => target.querySelector('.dl-sign-box');
const signButton = (target: HTMLElement) =>
  [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sign the dive')!;

function draw(target: HTMLElement) {
  const pad = target.querySelector<SVGSVGElement>('.dl-signature-pad')!;
  pad.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 400, right: 1000, bottom: 400 }) as DOMRect;
  pad.setPointerCapture = () => {};
  const at = (type: string, x: number, y: number) => {
    const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
    pad.dispatchEvent(new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'touch' }));
    flushSync();
  };
  at('pointerdown', 100, 100);
  at('pointermove', 200, 150);
  at('pointermove', 300, 200);
  at('pointerup', 300, 200);
}

describe('the dive page opened from a mailed sign link', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('shows the sign box under the title while the link is open', () => {
    const target = mountPage(open);
    const section = box(target)!;
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('Hi Alex, Diver logged this dive with you. Sign it:');
    expect(target.querySelector('header.head')!.nextElementSibling).toBe(section);
    const comment = section.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(comment.getAttribute('enterkeyhint')).toBe('done');
    expect(comment.maxLength).toBe(200);
    const shown = section.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(shown.checked).toBe(true);
    expect(shown.parentElement!.textContent).toContain('Show my note on the dive page');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
  });

  it('replaces the address with the plain dive URL and keeps the token in the page state', async () => {
    mountPage(open);
    await settle();
    expect(replaceState).toHaveBeenCalledWith('/dive/9', { from: '/dive?tag=cave', sign: 't0k' });
  });

  it('submits the comment, the strokes and the choice to show the note, then thanks', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ note: { ...note, public: false } }), { status: 200 });
      }),
    );
    const target = mountPage(open);
    const comment = target.querySelector<HTMLTextAreaElement>('textarea')!;
    comment.value = '  Cold feet, great vis.  ';
    comment.dispatchEvent(new Event('input', { bubbles: true }));
    draw(target);
    const shown = target.querySelector<HTMLInputElement>('.dl-sign-box input[type="checkbox"]')!;
    shown.click();
    flushSync();
    signButton(target).click();
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/v1/dive/sign/t0k');
    expect(calls[0].body).toEqual({
      comment: 'Cold feet, great vis.',
      strokes: [
        [
          [100, 100],
          [200, 150],
          [300, 200],
        ],
      ],
      public: false,
    });
    expect(box(target)!.textContent).toContain('Thank you, Alex');
    expect(box(target)!.textContent).toContain('Your note is kept for Diver');
    expect(signButton(target)).toBeUndefined();
  });

  it('asks for a comment or a drawing before sending anything', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const target = mountPage(open);
    signButton(target).click();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(target.querySelector('[role="alert"]')!.textContent).toBe(
      'Write a comment or draw a signature first.',
    );
  });

  it('says when the link was used meanwhile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'signed' }), { status: 409 })),
    );
    const target = mountPage(open);
    const comment = target.querySelector<HTMLTextAreaElement>('textarea')!;
    comment.value = 'Hi';
    comment.dispatchEvent(new Event('input', { bubbles: true }));
    signButton(target).click();
    await settle();
    expect(target.querySelector('[role="alert"]')!.textContent).toBe(
      'This dive is signed already.',
    );
  });

  it('shows the signing day instead of the box once the link is used', () => {
    const target = mountPage({ ...open, state: 'used', note });
    expect(box(target)!.textContent).toContain('You signed this dive on 27 October');
    expect(target.querySelector('textarea')).toBeNull();
  });

  it('shows no box for a link that belongs to another dive', () => {
    const target = mountPage({ ...open, number: 8 });
    expect(box(target)).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('shows a quiet line for an expired link', async () => {
    nav.page.url = new URL('http://localhost/dive/9?sign=old');
    const target = mountPage({ state: 'expired', number: 9 }, publicDive({ visibility: 'public' }));
    expect(box(target)).toBeNull();
    expect(target.querySelector('.sign-expired')!.textContent).toBe(
      'This sign link has expired; ask Diver for a new one.',
    );
    await settle();
    expect(replaceState).toHaveBeenCalledWith('/dive/9', { from: '/dive?tag=cave' });
  });

  it('is the plain dive page without a link', async () => {
    nav.page.url = new URL('http://localhost/dive/9');
    const target = mountPage(null);
    expect(box(target)).toBeNull();
    expect(target.querySelector('.sign-expired')).toBeNull();
    await settle();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe('the buddy notes on the dive page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    nav.page.url = new URL('http://localhost/dive/9');
  });
  afterEach(() => vi.useRealTimers());

  const section = (target: HTMLElement) => target.querySelector('.dl-buddy-notes');

  it('shows the public notes right after the buddies', () => {
    const target = mountPage(null, publicDive({ buddy_notes: [note] }));
    const notes = section(target)!;
    expect(notes.previousElementSibling!.classList.contains('context-cards')).toBe(true);
    expect(notes.querySelector('svg')!.getAttribute('aria-label')).toBe('Signature of Alex');
    expect(notes.querySelector('blockquote')!.textContent).toBe('“Cold feet, great vis.”');
  });

  it('has no section without notes', () => {
    expect(section(mountPage(null))).toBeNull();
  });

  it("shows the signing buddy's own note on a used link, private or not", () => {
    nav.page.url = new URL('http://localhost/dive/9?sign=t0k');
    const own = { ...note, public: false, comment: 'Only for Sam' };
    const target = mountPage({ ...open, state: 'used', note: own });
    expect(section(target)!.querySelector('blockquote')!.textContent).toBe('“Only for Sam”');
    expect(box(target)!.textContent).toContain('visitors of the dive page do not see it');
  });

  it('adds the note signed on the page', async () => {
    nav.page.url = new URL('http://localhost/dive/9?sign=t0k');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ note }), { status: 200 })),
    );
    const target = mountPage(open);
    expect(section(target)).toBeNull();
    const comment = target.querySelector<HTMLTextAreaElement>('textarea')!;
    comment.value = 'Cold feet, great vis.';
    comment.dispatchEvent(new Event('input', { bubbles: true }));
    signButton(target).click();
    await settle();
    expect(section(target)!.querySelector('blockquote')!.textContent).toBe(
      '“Cold feet, great vis.”',
    );
    expect(box(target)!.textContent).toContain('Your note is on the dive page.');
  });
});

describe('the sign page under hostile input', () => {
  const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script>"\'&amp;';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const inert = (target: HTMLElement) => {
    expect(target.querySelector('img[src="x"]')).toBeNull();
    expect(target.querySelector('script')).toBeNull();
    expect(target.querySelector('[onerror]')).toBeNull();
  };

  it('writes the signer name, the comment and the buddy name as text', () => {
    const hostileNote: BuddyNote = { ...note, comment: HOSTILE };
    const target = mountPage(
      { ...open, signer: { slug: 'alex', first_name: HOSTILE } },
      publicDive({
        buddies: [{ ...publicDive().buddies[0], name: HOSTILE }],
        buddy_notes: [hostileNote],
      }),
    );
    inert(target);
    expect(box(target)!.textContent).toContain(HOSTILE);
    expect(target.querySelector('blockquote')!.textContent).toBe(`“${HOSTILE}”`);
    expect(
      target.querySelector('svg[aria-label^="Signature of"]')!.getAttribute('aria-label'),
    ).toBe(`Signature of ${HOSTILE}`);
  });

  it('shows a note whose strokes are not drawable without failing the page', () => {
    const odd = [
      null,
      5,
      'abc',
      [
        ['<x>', NaN],
        [Infinity, 1],
      ],
      [[1, 2]],
    ] as unknown as number[][][];
    const target = mountPage(null, publicDive({ buddy_notes: [{ ...note, strokes: odd }] }));
    const d = target.querySelector('[aria-label="Signature of Alex"] path')!.getAttribute('d');
    expect(d).toBe('M1 2 L1 2');
    inert(target);
  });

  it('does not show a person-less or comment-less and stroke-less note', () => {
    const target = mountPage(
      null,
      publicDive({ buddy_notes: [{ ...note, comment: null, strokes: null }] }),
    );
    expect(target.querySelector('.dl-buddy-notes')).toBeNull();
  });

  it('falls back to the history when the router is not ready to replace the address', async () => {
    vi.mocked(replaceState).mockImplementationOnce(() => {
      throw new Error('Cannot call replaceState(...) before router is initialized');
    });
    const spy = vi.spyOn(history, 'replaceState');
    mountPage(open);
    await settle();
    expect(spy).toHaveBeenCalledWith(history.state, '', '/dive/9');
    spy.mockRestore();
  });

  it('keeps the other parameters and the hash when it drops the token', async () => {
    nav.page.url = new URL('http://localhost/dive/9?a=1&sign=t0k&b=2#story');
    mountPage(open);
    await settle();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(replaceState).mock.calls[0][0]).toBe('/dive/9?a=1&b=2#story');
  });

  it('replaces the address once, however often the page re-renders', async () => {
    const target = mountPage(open);
    await settle();
    flushSync();
    draw(target);
    await settle();
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it('keeps [ and ] for typing in the comment, and pages elsewhere', () => {
    vi.mocked(goto).mockClear();
    const target = mountPage(open, publicDive({ next_number: 10 }));
    const comment = target.querySelector<HTMLTextAreaElement>('textarea')!;
    comment.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
    expect(goto).not.toHaveBeenCalled();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
    expect(goto).toHaveBeenCalledTimes(1);
  });

  it('sends one request when the form is submitted twice before the answer', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ note }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const target = mountPage(open);
    const comment = target.querySelector<HTMLTextAreaElement>('textarea')!;
    comment.value = 'Hi';
    comment.dispatchEvent(new Event('input', { bubbles: true }));
    const form = target.querySelector('form')!;
    form.requestSubmit();
    form.requestSubmit();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps what was typed and says so when the answer is a server error or no answer', async () => {
    const target = mountPage(open);
    const comment = target.querySelector<HTMLTextAreaElement>('textarea')!;
    comment.value = 'Cold feet';
    comment.dispatchEvent(new Event('input', { bubbles: true }));
    draw(target);
    for (const [reply, message] of [
      [() => new Response('{}', { status: 500 }), /^Signing failed/],
      [() => Promise.reject(new TypeError('offline')), /^Could not reach the dive log/],
      [() => new Response('{}', { status: 429 }), /^Too many tries/],
      [() => new Response('{}', { status: 410 }), /^This sign link has expired/],
      [() => new Response('{}', { status: 422 }), /^The note was not accepted/],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => reply()),
      );
      signButton(target).click();
      await settle();
      expect(target.querySelector('[role="alert"]')!.textContent).toMatch(message);
      expect(comment.value).toBe('Cold feet');
      expect(target.querySelector('.dl-signature-hint')!.textContent).toContain('1 stroke drawn');
      expect(signButton(target).disabled).toBe(false);
    }
  });

  it('names the pad, the comment, the choice and the buttons for assistive technology', () => {
    const target = mountPage(open);
    const section = box(target)!;
    const title = document.getElementById(section.getAttribute('aria-labelledby')!)!;
    expect(title.tagName).toBe('H2');
    const comment = section.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(section.querySelector(`label[for="${comment.id}"]`)?.textContent).toContain('Comment');
    expect(
      document.getElementById(comment.getAttribute('aria-describedby')!)?.textContent,
    ).toContain('200 of 200 characters left');
    const pad = section.querySelector('[role="img"]')!;
    expect(pad.getAttribute('aria-label')).toBe('Your signature or a doodle');
    expect(document.getElementById(pad.getAttribute('aria-describedby')!)).not.toBeNull();
    const names = [...section.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(names).toEqual(['Undo', 'Clear', 'Sign the dive']);
    expect(
      section.querySelector('input[type="checkbox"]')!.closest('label')!.textContent,
    ).toContain('Show my note on the dive page');
  });

  it.fails(
    'shows the box again after going away and back, from the token kept in the history state',
    async () => {
      nav.page.url = new URL('http://localhost/dive/9');
      nav.page.state = { from: '/dive?tag=cave', sign: 't0k' } as typeof nav.page.state;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ ...open, dive: publicDive() })),
      );
      try {
        const target = mountPage(null);
        await settle();
        expect(box(target)).not.toBeNull();
      } finally {
        nav.page.state = { from: '/dive?tag=cave' };
      }
    },
  );
});
