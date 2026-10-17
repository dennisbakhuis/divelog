import { describe, expect, it } from 'vitest';
import {
  EMPTY_SITES_FILTER,
  NOT_DIVED,
  notDived,
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
      mine: false,
    });
    expect(sitesFilterFromParams(new URLSearchParams('mine=1')).mine).toBe(true);
  });

  it('writes set values, drops empty ones and keeps other parameters', () => {
    const params = sitesFilterToParams(
      { q: '', country: 'NL', type: '', mine: false },
      new URLSearchParams('type=cave&utm=x'),
    );
    expect(params.toString()).toBe('utm=x&country=NL');
  });

  it('round-trips', () => {
    const filter = { q: 'blue hole', country: 'EG', type: 'reef', mine: true };
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

  it('writes only my dives as mine=1 and drops it when off', () => {
    const on = sitesFilterToParams(
      { ...EMPTY_SITES_FILTER, mine: true },
      new URLSearchParams('x=1'),
    );
    expect(on.toString()).toBe('x=1&mine=1');
    expect(sitesFilterToParams(EMPTY_SITES_FILTER, on).toString()).toBe('x=1');
  });

  it('keeps the undived sites out with only my dives', () => {
    const mine = { ...EMPTY_SITES_FILTER, mine: true };
    const undived = { name: 'Commons Spring', site_type: 'cave', dives: 0 };
    expect(siteMatches(undived, 'Lot', EMPTY_SITES_FILTER)).toBe(true);
    expect(siteMatches(undived, 'Lot', mine)).toBe(false);
    expect(siteMatches({ ...undived, dives: 3 }, 'Lot', mine)).toBe(true);
    expect(siteMatches({ name: 'No count', site_type: 'cave' }, 'Lot', mine)).toBe(true);
  });

  it('calls a site without dives not dived', () => {
    expect(notDived({ dives: 0 })).toBe(true);
    expect(notDived({ dives: 1 })).toBe(false);
    expect(NOT_DIVED).toBe('not dived');
  });
});
