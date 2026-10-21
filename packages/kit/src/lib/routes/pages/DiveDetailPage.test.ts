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

import { replaceState } from '$app/navigation';
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
