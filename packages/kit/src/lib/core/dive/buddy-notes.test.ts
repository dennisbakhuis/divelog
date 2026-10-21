import { describe, expect, it } from 'vitest';
import { buddyRows, listNames, signRequestsMessage, signedOn } from './buddy-notes.js';
import type { BuddyNote, SignRequest } from './types.js';

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

describe('buddyRows', () => {
  const kim = { id: 'kim_de_boer', slug: 'kim', first_name: 'Kim', email: 'kim@example.com' };
  const robin = { id: 'robin', slug: 'robin', first_name: 'Robin', email: null };
  const request = (person: string, state: SignRequest['state'], sent_at: string | null = null) =>
    ({ person, state, sent_at, expires_at: null, signed_at: null }) as SignRequest;
  const note = (person: string) =>
    ({
      person,
      comment: 'Hi',
      strokes: null,
      signed_at: '2026-10-27T10:00:00Z',
      public: true,
    }) as BuddyNote;

  it('pairs notes and requests with buddies by slug, not by person id', () => {
    const rows = buddyRows(['kim_de_boer'], [kim], [note('kim')], [request('kim', 'signed')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'kim_de_boer', slug: 'kim', name: 'Kim', state: 'signed' });
    expect(rows[0].note?.person).toBe('kim');
    expect(rows[0].request?.person).toBe('kim');
    expect(buddyRows(['kim_de_boer'], [kim], [note('kim_de_boer')], [])[0].note).toBeNull();
  });

  it('keeps the order of the dive and skips unknown people', () => {
    const rows = buddyRows(['robin', 'nobody', 'kim_de_boer'], [kim, robin], [], []);
    expect(rows.map((r) => r.slug)).toEqual(['robin', 'kim']);
  });

  it('says not asked or no e-mail for a buddy without a request', () => {
    const rows = buddyRows(['kim_de_boer', 'robin'], [kim, robin], [], []);
    expect(rows.map((r) => r.state)).toEqual(['none', 'no_email']);
  });

  it('lets a note win over the request and a deleted note fall back', () => {
    expect(
      buddyRows(['kim_de_boer'], [kim], [note('kim')], [request('kim', 'open')])[0].state,
    ).toBe('signed');
    const asked = request('kim', 'signed', '2026-10-25T10:00:00Z');
    expect(buddyRows(['kim_de_boer'], [kim], [], [asked])[0].state).toBe('expired');
    expect(buddyRows(['kim_de_boer'], [kim], [], [request('kim', 'signed')])[0].state).toBe('none');
  });
});

describe('listNames', () => {
  it('joins names the English way', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['Kim'])).toBe('Kim');
    expect(listNames(['Kim', 'Alex'])).toBe('Kim and Alex');
    expect(listNames(['Kim', 'Alex', 'Robin'])).toBe('Kim, Alex and Robin');
  });
});

describe('signRequestsMessage', () => {
  const names: Record<string, string> = { kim: 'Kim', alex: 'Alex', robin: 'Robin', sam: 'Sam' };
  const nameOf = (slug: string) => names[slug] ?? slug;

  it('names whom it mailed and who was asked before', () => {
    expect(
      signRequestsMessage({ sent: ['kim'], skipped: [{ person: 'alex', reason: 'open' }] }, nameOf),
    ).toEqual({ kind: 'success', message: 'Sent to Kim; Alex was already asked' });
  });

  it('says nobody new was asked on a second save', () => {
    expect(
      signRequestsMessage(
        {
          sent: [],
          skipped: [
            { person: 'kim', reason: 'expired' },
            { person: 'alex', reason: 'open' },
            { person: 'sam', reason: 'signed' },
          ],
        },
        nameOf,
      ),
    ).toEqual({
      kind: 'info',
      message: 'Nobody new to ask; Kim and Alex were already asked; Sam signed already',
    });
    expect(signRequestsMessage({ sent: [], skipped: [] }, nameOf).message).toBe(
      'Nobody new to ask',
    );
  });

  it('names the buddies without an e-mail address', () => {
    expect(
      signRequestsMessage(
        { sent: ['kim', 'alex'], skipped: [{ person: 'robin', reason: 'no_email' }] },
        nameOf,
      ).message,
    ).toBe('Sent to Kim and Alex; Robin has no e-mail address');
  });
});
