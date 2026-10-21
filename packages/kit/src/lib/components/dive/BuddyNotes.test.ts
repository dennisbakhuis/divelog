import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuddyNotes from './BuddyNotes.svelte';
import type { Buddy, BuddyNote } from '$lib/core/dive/types.js';
import { render } from '$lib/components/ui/__fixtures__/test-utils.js';

const alex = { slug: 'alex', name: 'Alex' } as Buddy;
const kim = { slug: 'kim', name: 'Kim' } as Buddy;

function note(overrides: Partial<BuddyNote> = {}): BuddyNote {
  return {
    person: 'alex',
    comment: 'Cold feet, great vis.',
    strokes: [
      [
        [10, 300],
        [18, 290],
      ],
      [[500, 200]],
    ],
    signed_at: '2026-10-27T19:40:00+02:00',
    public: true,
    ...overrides,
  };
}

let destroy: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
});
afterEach(() => {
  destroy?.();
  vi.useRealTimers();
});

function mountNotes(notes: BuddyNote[], buddies: Buddy[] = [alex, kim]) {
  const view = render(BuddyNotes, { notes, buddies });
  destroy = view.destroy;
  return view.target;
}

describe('BuddyNotes', () => {
  it('shows each note with its signature, comment and linked name', () => {
    const target = mountNotes([note()]);
    const section = target.querySelector('section')!;
    expect(section.getAttribute('aria-labelledby')).toBe('dl-buddy-notes-title');
    expect(section.querySelector('h2')!.textContent).toBe('Buddy notes');
    const svg = section.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Signature of Alex');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 400');
    expect(svg.style.maxWidth).toBe('240px');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M10 300 L18 290 M500 200 L500 200');
    expect(section.querySelector('blockquote')!.textContent).toBe('“Cold feet, great vis.”');
    const link = section.querySelector('figcaption a')!;
    expect(link.textContent).toBe('Alex');
    expect(link.getAttribute('href')).toBe('/dive/people/alex');
    expect(section.querySelector('figcaption')!.textContent).toContain('signed 27 October');
  });

  it('is not there without notes', () => {
    expect(mountNotes([]).querySelector('section')).toBeNull();
  });

  it('shows a note without strokes as its comment alone', () => {
    const target = mountNotes([note({ strokes: null })]);
    expect(target.querySelector('svg')).toBeNull();
    expect(target.querySelector('blockquote')!.textContent).toBe('“Cold feet, great vis.”');
  });

  it('shows a note without a comment as its signature alone', () => {
    const target = mountNotes([note({ person: 'kim', comment: null })]);
    expect(target.querySelector('blockquote')).toBeNull();
    expect(target.querySelector('svg')!.getAttribute('aria-label')).toBe('Signature of Kim');
  });

  it('names a buddy missing from the dive without a link', () => {
    const target = mountNotes([note({ person: 'sam' })], [alex]);
    expect(target.querySelector('figcaption a')).toBeNull();
    expect(target.querySelector('figcaption')!.textContent).toContain('sam');
  });
});
