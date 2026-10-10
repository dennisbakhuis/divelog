import { describe, expect, it } from 'vitest';
import { forkedFromRevision, pinMessage, revisionLine } from './revision.js';

describe('revisionLine', () => {
  it('is null while the changelog is empty', () => {
    expect(revisionLine({ revision: 1, changelog: [] })).toBeNull();
  });

  it('names the revision and the date of the newest entry', () => {
    const line = revisionLine({
      revision: 3,
      changelog: [
        { revision: 3, date: '2026-10-10', author: null, note: 'Moved' },
        { revision: 2, date: '2026-09-30', author: 'Kim', note: 'Map' },
      ],
    });
    expect(line).toMatch(/^Revision 3 · changed /);
    expect(line).toContain('2026');
  });
});

describe('forkedFromRevision', () => {
  it.each([
    ['commons@3', 3],
    ['commons@12', 12],
    ['commons@ab12f3c', null],
    ['commons@unknown', null],
    ['commons', null],
    [null, null],
    [undefined, null],
  ])('%j → %j', (value, expected) => {
    expect(forkedFromRevision(value)).toBe(expected);
  });
});

describe('pinMessage', () => {
  it('says a stale pin and where the commons is', () => {
    expect(pinMessage({ pinned_revision: 2, current_revision: 3, stale: true })).toBe(
      'Written against commons revision 2, commons is at 3',
    );
    expect(pinMessage({ pinned_revision: null, current_revision: 2, stale: true })).toBe(
      'Written before commons revisions, commons is at 2',
    );
  });

  it('says a current pin', () => {
    expect(pinMessage({ pinned_revision: 3, current_revision: 3, stale: false })).toBe(
      'Pinned to commons revision 3',
    );
    expect(pinMessage({ pinned_revision: null, current_revision: 1, stale: false })).toBe(
      'Commons revision 1',
    );
  });
});
