import { describe, expect, it } from 'vitest';
import {
  EMPTY_SITES_FILTER,
  siteMatches,
  sitesFilterFromParams,
  sitesFilterToParams,
} from './sites-filter.js';

describe('sites filter', () => {
  it('reads the filter from a query and defaults to empty', () => {
    expect(sitesFilterFromParams(new URLSearchParams())).toEqual(EMPTY_SITES_FILTER);
    expect(sitesFilterFromParams(new URLSearchParams('q=reef&country=EG&type=wreck'))).toEqual({
      q: 'reef',
      country: 'EG',
      type: 'wreck',
    });
  });

  it('writes set values, drops empty ones and keeps other parameters', () => {
    const params = sitesFilterToParams(
      { q: '', country: 'NL', type: '' },
      new URLSearchParams('type=cave&utm=x'),
    );
    expect(params.toString()).toBe('utm=x&country=NL');
  });

  it('round-trips', () => {
    const filter = { q: 'blue hole', country: 'EG', type: 'reef' };
    expect(sitesFilterFromParams(sitesFilterToParams(filter))).toEqual(filter);
  });

  it('matches by type and by text over name, area and region', () => {
    const site = { name: 'Coral Garden', area: 'Dahab', site_type: 'reef' };
    expect(siteMatches(site, 'Red Sea', EMPTY_SITES_FILTER)).toBe(true);
    expect(siteMatches(site, 'Red Sea', { ...EMPTY_SITES_FILTER, type: 'cave' })).toBe(false);
    expect(siteMatches(site, 'Red Sea', { ...EMPTY_SITES_FILTER, q: 'dahab' })).toBe(true);
    expect(siteMatches(site, 'Red Sea', { ...EMPTY_SITES_FILTER, q: 'red sea' })).toBe(true);
    expect(siteMatches(site, 'Red Sea', { ...EMPTY_SITES_FILTER, q: 'wreck' })).toBe(false);
  });
});
