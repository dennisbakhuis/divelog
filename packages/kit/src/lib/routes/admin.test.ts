import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/core/admin/dive-input', () => ({
  diveTemplate: (dive: { number: number }) => ({ from: dive.number }),
}));

import { matchRoute } from './table.js';
import {
  adminRoutes,
  diveEditRoute,
  diveNewRoute,
  divesRoute,
  gearRoute,
  importRoute,
  peopleRoute,
  personEditRoute,
  personNewRoute,
  regionEditRoute,
  regionNewRoute,
  regionsRoute,
  siteEditRoute,
  siteMapsRoute,
  siteNewRoute,
  sitesRoute,
  tripEditRoute,
  tripNewRoute,
  tripsRoute,
} from './admin.js';
import { fakeDivelog, fakeEvent, thrown } from '../testing/fake.js';

const FORM = {
  '/api/v1/admin/sites': [{ id: 's' }],
  '/api/v1/admin/trips': [],
  '/api/v1/admin/people': [],
  '/api/v1/admin/gear/setups': [],
  '/api/v1/dive/regions': [{ id: 'lot' }],
};

describe('the admin table', () => {
  it.each([
    ['', divesRoute, []],
    ['dives/new', diveNewRoute, []],
    ['dives/650', diveEditRoute, ['650']],
    ['sites', sitesRoute, []],
    ['sites/new', siteNewRoute, []],
    ['sites/fra-ressel', siteEditRoute, ['fra-ressel']],
    ['sites/fra-ressel/maps', siteMapsRoute, ['fra-ressel']],
    ['regions', regionsRoute, []],
    ['regions/new', regionNewRoute, []],
    ['regions/lot-karst', regionEditRoute, ['lot-karst']],
    ['people', peopleRoute, []],
    ['people/new', personNewRoute, []],
    ['people/andrea', personEditRoute, ['andrea']],
    ['trips', tripsRoute, []],
    ['trips/new', tripNewRoute, []],
    ['trips/mexico', tripEditRoute, ['mexico']],
    ['gear', gearRoute, []],
    ['import', importRoute, []],
  ])('routes %j', (path, route, params) => {
    expect(matchRoute(adminRoutes, path)).toEqual({ route, params });
  });

  it.each(['dives', 'nope', 'sites/a/b', 'login'])('has no route for %j', (path) => {
    expect(matchRoute(adminRoutes, path)).toBeNull();
  });
});

describe('admin loaders', () => {
  it('offers the latest dive as the template for a new one', async () => {
    const divelog = fakeDivelog({
      ...FORM,
      '/api/v1/admin/dives/next-number': { number: 12 },
      '/api/v1/admin/dives': [
        { number: 10, title: '', site_name: 'Ressel' },
        { number: 11, title: '', site_name: null },
      ],
      '/api/v1/admin/dives/11': { number: 11, title: '', site: null },
    });
    const data = await diveNewRoute.load(divelog, [], fakeEvent());
    expect(data.nextNumber).toBe(12);
    expect(data.sites).toEqual([{ id: 's' }]);
    expect(data.template).toEqual({ number: 11, label: 'Untitled', input: { from: 11 } });
  });

  it('has no template before the first dive', async () => {
    const divelog = fakeDivelog({
      ...FORM,
      '/api/v1/admin/dives/next-number': { number: 1 },
      '/api/v1/admin/dives': [],
    });
    expect((await diveNewRoute.load(divelog, [], fakeEvent())).template).toBeNull();
  });

  it('loads a dive with the form data and 404s a bad number', async () => {
    const divelog = fakeDivelog({ ...FORM, '/api/v1/admin/dives/650': { number: 650 } });
    const data = await diveEditRoute.load(divelog, ['650'], fakeEvent());
    expect(data).toMatchObject({
      page: 'dive-edit',
      dive: { number: 650 },
      regions: [{ id: 'lot' }],
    });
    expect(await thrown(diveEditRoute.load(divelog, ['x'], fakeEvent()))).toMatchObject({
      status: 404,
    });
  });

  it('encodes ids into the admin API paths', async () => {
    const divelog = fakeDivelog({
      '/api/v1/admin/sites/a%20b': { id: 'a b' },
      '/api/v1/dive/regions': [],
      '/api/v1/admin/people/a%20b': { id: 'a b' },
      '/api/v1/admin/trips/a%20b': { slug: 'a b' },
    });
    expect((await siteEditRoute.load(divelog, ['a b'], fakeEvent())).site).toEqual({ id: 'a b' });
    expect((await siteMapsRoute.load(divelog, ['a b'], fakeEvent())).site).toEqual({ id: 'a b' });
    expect((await personEditRoute.load(divelog, ['a b'], fakeEvent())).person).toEqual({
      id: 'a b',
    });
    expect((await tripEditRoute.load(divelog, ['a b'], fakeEvent())).trip).toEqual({
      slug: 'a b',
    });
  });

  it('finds a region in the list or 404s', async () => {
    const divelog = fakeDivelog({ '/api/v1/admin/regions': [{ id: 'lot' }] });
    expect((await regionEditRoute.load(divelog, ['lot'], fakeEvent())).region).toEqual({
      id: 'lot',
    });
    expect(await thrown(regionEditRoute.load(divelog, ['gone'], fakeEvent()))).toMatchObject({
      status: 404,
    });
    expect((await regionsRoute.load(divelog, [], fakeEvent())).regions).toHaveLength(1);
  });

  it('loads the list pages', async () => {
    const divelog = fakeDivelog({
      ...FORM,
      '/api/v1/admin/dives': [],
      '/api/v1/admin/gear/items': [],
      '/api/v1/admin/imports': [],
    });
    const event = fakeEvent();
    expect(await divesRoute.load(divelog, [], event)).toEqual({ dives: [], page: 'dives' });
    expect(await sitesRoute.load(divelog, [], event)).toMatchObject({ sites: [{ id: 's' }] });
    expect(await siteNewRoute.load(divelog, [], event)).toMatchObject({ regions: [{ id: 'lot' }] });
    expect(await peopleRoute.load(divelog, [], event)).toMatchObject({ people: [] });
    expect(await tripsRoute.load(divelog, [], event)).toMatchObject({ trips: [] });
    expect(await gearRoute.load(divelog, [], event)).toMatchObject({ items: [], setups: [] });
    expect(await importRoute.load(divelog, [], event)).toMatchObject({ imports: [] });
    expect(await regionNewRoute.load(divelog, [], event)).toEqual({ page: 'region-new' });
    expect(await personNewRoute.load(divelog, [], event)).toEqual({ page: 'person-new' });
    expect(await tripNewRoute.load(divelog, [], event)).toEqual({ page: 'trip-new' });
  });
});
