import { describe, expect, it } from 'vitest';
import { backHref, fromState } from './back.js';

const origin = 'https://example.com';

describe('backHref', () => {
  it('falls back to the list without a source', () => {
    expect(backHref('/dive', { origin })).toBe('/dive');
  });

  it('prefers the history state over the navigation and the referrer', () => {
    expect(
      backHref('/dive', {
        origin,
        stateFrom: '/dive?tag=cave',
        navigatedFrom: 'https://example.com/dive?tag=wreck',
        referrer: 'https://example.com/dive?year=2020',
      }),
    ).toBe('/dive?tag=cave');
  });

  it('uses the previous client-side URL when there is no state', () => {
    expect(
      backHref('/dive', { origin, navigatedFrom: new URL('https://example.com/dive?site=x') }),
    ).toBe('/dive?site=x');
  });

  it('uses a same-origin referrer under the list path', () => {
    expect(backHref('/dive', { origin, referrer: 'https://example.com/dive/?q=reef' })).toBe(
      '/dive/?q=reef',
    );
  });

  it('ignores another origin, another path and junk', () => {
    expect(backHref('/dive', { origin, referrer: 'https://evil.test/dive?q=x' })).toBe('/dive');
    expect(backHref('/dive', { origin, navigatedFrom: 'https://example.com/dive/sites' })).toBe(
      '/dive',
    );
    expect(backHref('/dive', { origin, stateFrom: 42, referrer: '' })).toBe('/dive');
    expect(backHref('/dive', { origin, stateFrom: 'http://[bad' })).toBe('/dive');
  });

  it('keeps the list under another base path', () => {
    expect(backHref('/log/sites', { origin, stateFrom: '/log/sites?country=EG&type=reef' })).toBe(
      '/log/sites?country=EG&type=reef',
    );
  });

  it('builds the state a list hands to the detail page', () => {
    expect(fromState({ pathname: '/dive', search: '?tag=cave' })).toEqual({
      from: '/dive?tag=cave',
    });
  });
});
