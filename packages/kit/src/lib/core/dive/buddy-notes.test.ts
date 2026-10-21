import { describe, expect, it } from 'vitest';
import { signedOn } from './buddy-notes.js';

describe('signedOn', () => {
  const now = new Date('2026-12-30T12:00:00');

  it('names the day as written, without the year of this year', () => {
    expect(signedOn('2026-10-27T19:40:00+02:00', now)).toBe('27 October');
    expect(signedOn('2026-10-27T23:59:00-09:00', now)).toBe('27 October');
  });

  it('adds the year of another year', () => {
    expect(signedOn('2025-03-02T08:00:00Z', now)).toBe('2 March 2025');
  });

  it('leaves anything that is not a date as it is', () => {
    expect(signedOn('soon', now)).toBe('soon');
  });
});
