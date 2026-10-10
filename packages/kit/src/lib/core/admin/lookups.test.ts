import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countryOptions,
  fetchCountries,
  fetchLicences,
  fetchSiteFields,
  resetLookups,
} from './lookups.js';

beforeEach(() => resetLookups());
afterEach(() => vi.unstubAllGlobals());

describe('lookups', () => {
  it('fetches each list once and shares it', async () => {
    const fetchMock = vi.fn(
      async (url: string) => new Response(JSON.stringify([{ url }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([fetchCountries(), fetchCountries()]);
    expect(a).toBe(b);
    expect(a).toEqual([{ url: '/api/v1/meta/countries' }]);
    await fetchLicences();
    await fetchSiteFields();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/meta/countries',
      '/api/v1/meta/licences',
      '/api/v1/admin/meta/site-fields',
    ]);
  });

  it('tries again after a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"detail":"down"}', { status: 503 })),
    );
    await expect(fetchCountries()).rejects.toThrow('down');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
    expect(await fetchCountries()).toEqual([]);
  });

  it('keeps codes the server does not list, sorted by name', () => {
    const known = [
      { iso3: 'NLD', iso2: 'NL', name: 'Netherlands' },
      { iso3: 'FRA', iso2: 'FR', name: 'France' },
    ];
    expect(
      countryOptions(known, [
        { iso3: 'JPN', name: 'Japan' },
        { iso3: 'FRA', name: 'France (pin)' },
        { iso3: 'JPN', name: 'Japan again' },
        { iso3: '', name: 'nothing' },
      ]),
    ).toEqual([
      { iso3: 'FRA', name: 'France' },
      { iso3: 'JPN', name: 'Japan' },
      { iso3: 'NLD', name: 'Netherlands' },
    ]);
  });
});
