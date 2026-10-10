import { describe, expect, it } from 'vitest';

import { matchRoute } from './table.js';
import {
  adminRoutes,
  diveEditRoute,
  diveNewRoute,
  divesRoute,
  newDivePrefill,
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
    ['dives', divesRoute, []],
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

  it.each(['nope', 'sites/a/b', 'login'])('has no route for %j', (path) => {
    expect(matchRoute(adminRoutes, path)).toBeNull();
  });
});

describe('admin loaders', () => {
  it('loads one template for a new dive, with the prefill from the query', async () => {
    const template = { date: '2026-02-08', next_number: 12, previous: null };
    const divelog = fakeDivelog({
      ...FORM,
      '/api/v1/admin/dives/template?site=mex-tortuga&date=2026-02-08': template,
    });
    const event = fakeEvent('/admin/dives/new?site=mex-tortuga&date=2026-02-08&person=anna');
    const data = await diveNewRoute.load(divelog, [], event);
    expect(data.nextNumber).toBe(12);
    expect(data.template).toEqual(template);
    expect(data.prefill).toEqual({
      site: 'mex-tortuga',
      trip: null,
      person: 'anna',
      date: '2026-02-08',
    });
    expect(data.sites).toEqual([{ id: 's' }]);
  });

  it("drops a malformed prefill date and asks for today's template", async () => {
    const divelog = fakeDivelog({
      ...FORM,
      '/api/v1/admin/dives/template': { date: '2026-02-08', next_number: 1, previous: null },
    });
    const data = await diveNewRoute.load(divelog, [], fakeEvent('/admin/dives/new?date=08-02'));
    expect(data.prefill.date).toBeNull();
    expect(data.nextNumber).toBe(1);
    expect(newDivePrefill(new URLSearchParams('trip=%20mexico%20'))).toMatchObject({
      trip: 'mexico',
    });
  });

  it('loads a dive with the form data and its template, and 404s a bad number', async () => {
    const divelog = fakeDivelog({
      ...FORM,
      '/api/v1/admin/dives/650': { number: 650, date: '2026-02-08', site_id: 'x' },
      '/api/v1/admin/dives/template?site=x&date=2026-02-08&before=650': {
        previous: { number: 649 },
        at_site: { number: 640 },
      },
    });
    const data = await diveEditRoute.load(divelog, ['650'], fakeEvent());
    expect(data).toMatchObject({
      page: 'dive-edit',
      dive: { number: 650 },
      regions: [{ id: 'lot' }],
      template: { previous: { number: 649 }, at_site: { number: 640 } },
      drafts: [],
    });
    expect(await thrown(diveEditRoute.load(divelog, ['x'], fakeEvent()))).toMatchObject({
      status: 404,
    });
  });

  it('asks for the dive logged before a draft, also on the same day, and lists the drafts', async () => {
    const divelog = fakeDivelog({
      ...FORM,
      '/api/v1/admin/dives/651': {
        number: 651,
        date: '2026-02-08',
        site_id: null,
        visibility: 'draft',
      },
      '/api/v1/admin/dives/template?date=2026-02-08&before=651': {
        previous: { number: 650 },
        at_site: null,
      },
      '/api/v1/admin/dives/page?offset=0&limit=1000&status=draft&sort=date&asc=true': {
        items: [{ number: 649 }, { number: 651 }, { number: 652 }],
        total: 3,
      },
    });
    const data = await diveEditRoute.load(divelog, ['651'], fakeEvent());
    expect(data.template.previous).toEqual({ number: 650 });
    expect(data.drafts).toEqual([649, 651, 652]);
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
      '/api/v1/admin/dives/page?offset=0&limit=100&sort=depth&asc=true': {
        items: [{ number: 3 }],
        total: 1,
      },
      '/api/v1/admin/dives/page?offset=0&limit=1&status=draft&sort=date&asc=false': {
        items: [],
        total: 4,
      },
      '/api/v1/admin/gear/items': [],
      '/api/v1/admin/imports': [],
    });
    const event = fakeEvent();
    expect(
      await divesRoute.load(divelog, [], fakeEvent('/admin?sort=depth&asc=1&status=nope')),
    ).toEqual({
      page: 'dives',
      query: { q: '', status: null, sort: 'depth', asc: true },
      rows: [{ number: 3 }],
      total: 1,
      drafts: 4,
    });
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
