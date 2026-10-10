import { describe, expect, it } from 'vitest';
import { diveSitemapEntries } from './sitemap';
import { fakeDivelog } from '../testing/fake';

describe('diveSitemapEntries', () => {
  it('lists trips then dives at priority 0.5', async () => {
    const divelog = fakeDivelog({
      '/api/v1/dive/dives': { dives: [{ number: 3 }, { number: 1 }] },
      '/api/v1/dive/trips': [{ slug: 'red-sea' }],
    });
    expect(await diveSitemapEntries(divelog, fetch)).toEqual([
      { path: '/dive/trips/red-sea', priority: '0.5' },
      { path: '/dive/3', priority: '0.5' },
      { path: '/dive/1', priority: '0.5' },
    ]);
  });

  it('is empty when the backend is down', async () => {
    const divelog = fakeDivelog({
      '/api/v1/dive/dives': new Error('down'),
      '/api/v1/dive/trips': [],
    });
    expect(await diveSitemapEntries(divelog, fetch)).toEqual([]);
  });
});
