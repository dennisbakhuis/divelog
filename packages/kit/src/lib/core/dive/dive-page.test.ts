import { describe, expect, it } from 'vitest';
import {
  buddyRawAddsNothing,
  profileSpark,
  routeLine,
  sameDepth,
  typesRawAddsNothing,
} from './dive-page';

describe('typesRawAddsNothing', () => {
  it('is true for empty input', () => {
    expect(typesRawAddsNothing(null, ['cave'])).toBe(true);
    expect(typesRawAddsNothing('', [])).toBe(true);
  });

  it('ignores case, spacing and separators', () => {
    expect(typesRawAddsNothing('Cave / Scooter', ['cave', 'scooter'])).toBe(true);
    expect(typesRawAddsNothing('cave, deep', ['deep', 'cave', 'night'])).toBe(true);
  });

  it('is false when a ticked type is not a tag', () => {
    expect(typesRawAddsNothing('cave / photo', ['cave'])).toBe(false);
  });
});

describe('buddyRawAddsNothing', () => {
  const person = (first: string, last: string | null = null, aliases: string[] = []) => ({
    first_name: first,
    last_name: last,
    alias: null,
    aliases,
  });
  const team = [person('Patrick', 'de Vries'), person('Xavier', 'Visser'), person('Kim', 'Jansen')];

  it('is true for empty input and for first names of linked people', () => {
    expect(buddyRawAddsNothing(null, team)).toBe(true);
    expect(buddyRawAddsNothing('Patrick / Xavier', team)).toBe(true);
    expect(buddyRawAddsNothing('Kim Jansen', team)).toBe(true);
  });

  it('ignores a nickname in brackets and accepts aliases', () => {
    expect(buddyRawAddsNothing('Andrea Rossi (mara)', [person('Andrea', 'Rossi')])).toBe(
      true,
    );
    expect(buddyRawAddsNothing('JP', [person('Jean-Paul', 'X', ['JP'])])).toBe(true);
  });

  it('is false when the page names someone who is not linked', () => {
    expect(buddyRawAddsNothing('Kim / Dirk', team)).toBe(false);
    expect(buddyRawAddsNothing('Kimberly', team)).toBe(false);
  });
});

describe('profileSpark', () => {
  it('is empty below two samples', () => {
    expect(profileSpark([{ t: 0, d: 0 }], 100, 40)).toEqual({ line: '', area: '' });
  });

  it('puts the surface on top and the deepest point on the bottom edge', () => {
    const s = profileSpark(
      [
        { t: 0, d: 0 },
        { t: 50, d: 20 },
        { t: 100, d: 10 },
      ],
      104,
      44,
    );
    expect(s.line).toBe('M2 2 L52 42 L102 22');
    expect(s.area).toBe('M2 2 L52 42 L102 22 L102 0 L2 0 Z');
  });
});

describe('routeLine', () => {
  it('joins the known parts', () => {
    expect(
      routeLine(1320.4, {
        turnedAt: 'Roundabout',
        deepest: { label: 'First Strike Run', depth: 26 },
      }),
    ).toBe('1320 m swum · turned at Roundabout · deepest 26 m at First Strike Run');
  });

  it('skips missing parts', () => {
    expect(routeLine(0, { turnedAt: 'T1', deepest: null })).toBe('turned at T1');
    expect(routeLine(0, { turnedAt: null, deepest: null })).toBe('');
  });
});

describe('sameDepth', () => {
  it('compares formatted depths', () => {
    expect(sameDepth(26.8, 26.8)).toBe(true);
    expect(sameDepth(28, 26.8)).toBe(false);
    expect(sameDepth(null, 26.8)).toBe(false);
  });
});
