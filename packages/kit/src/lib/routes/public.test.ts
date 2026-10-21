import { describe, expect, it, vi } from 'vitest';
import { matchRoute } from './table.js';
import {
  diveOgRedirect,
  diveRoute,
  gearRoute,
  groupSites,
  logRoute,
  peopleRoute,
  personRoute,
  publicRoutes,
  regionRoute,
  siteMapRedirect,
  siteOgRedirect,
  siteRoute,
  sitesRoute,
  tripRoute,
  tripsRoute,
} from './public.js';
import { DEFAULT_CONFIG } from '$lib/core/dive/config.js';
import { fakeDivelog, fakeEvent, thrown } from '../testing/fake.js';
import { ApiError } from '../server/api.js';
import { error } from '@sveltejs/kit';
import type { Region, Site } from '$lib/core/dive/types.js';

const API = '/api/v1/dive';

const ressel = { lon: 1.72, lat: 44.56, slug: 'fra-ressel', name: 'Ressel' };

function site(over: Partial<Site>): Site {
  return {
    slug: 's',
    name: 'S',
    site_type: 'cave',
    area: null,
    region: null,
    country_code: 'FR',
    country_name: 'France',
    dives: 1,
    last_dive: null,
    max_depth_m: null,
    maps: [],
    summary: null,
    revision: 1,
    changelog: [],
    forked_from: null,
    ...over,
  } as Site;
}

describe('the public table', () => {
  it.each([
    ['', logRoute, []],
    ['650', diveRoute, ['650']],
    ['650/og.png', diveOgRedirect, ['650']],
    ['sites', sitesRoute, []],
    ['sites/fra-ressel', siteRoute, ['fra-ressel']],
    ['sites/fra-ressel/map', siteMapRedirect, ['fra-ressel']],
    ['sites/fra-ressel/og.png', siteOgRedirect, ['fra-ressel']],
    ['regions/lot-karst', regionRoute, ['lot-karst']],
    ['trips', tripsRoute, []],
    ['trips/mexico-2026-02', tripRoute, ['mexico-2026-02']],
    ['people', peopleRoute, []],
    ['people/kim', personRoute, ['kim']],
    ['gear', gearRoute, []],
  ])('routes %j', (path, route, params) => {
    expect(matchRoute(publicRoutes, path)).toEqual({ route, params });
  });

  it.each(['nonexistent', 'regions', '650/x', 'sites/a/b', 'sites/UPPER/og.png', 'abc/og.png'])(
    'has no route for %j',
    (path) => {
      expect(matchRoute(publicRoutes, path)).toBeNull();
    },
  );
});

describe('redirects', () => {
  it('moves the old card URLs permanently', async () => {
    const divelog = fakeDivelog();
    expect(await thrown(diveOgRedirect.load(divelog, ['650'], fakeEvent()))).toMatchObject({
      status: 301,
      location: '/dive/og/dive/650.png',
    });
    expect(await thrown(siteOgRedirect.load(divelog, ['fra-ressel'], fakeEvent()))).toMatchObject({
      status: 301,
      location: '/dive/og/site/fra-ressel.png',
    });
  });

  it('sends the old map editor URL to the site maps editor by site id', async () => {
    const divelog = fakeDivelog({ [`${API}/sites/fra-ressel`]: { site: { id: 'fra ressel' } } });
    expect(await thrown(siteMapRedirect.load(divelog, ['fra-ressel'], fakeEvent()))).toMatchObject({
      status: 302,
      location: '/admin/sites/fra%20ressel/maps',
    });
  });
});

describe('public loaders', () => {
  it('projects the log map dots and links the editor', async () => {
    const divelog = fakeDivelog({
      [`${API}/stats`]: { map_sites: [ressel] },
      [`${API}/dives`]: { dives: [] },
    });
    const data = await logRoute.load(divelog, [], fakeEvent());
    expect(data.page).toBe('log');
    expect(data.editHref).toBe('/admin');
    expect(data.map.dots).toHaveLength(1);
    expect(data.map.dots[0].point.x).toBeGreaterThan(0);
  });

  it('404s dive number zero and titles a dive', async () => {
    const divelog = fakeDivelog({
      [`${API}/dives/7`]: {
        number: 7,
        title: 'Blue',
        max_depth_m: 30,
        duration_min: 41.6,
        date: '2026-01-02',
        site: { name: 'Ressel' },
      },
    });
    expect(await thrown(diveRoute.load(divelog, ['0'], fakeEvent()))).toMatchObject({
      status: 404,
    });
    const data = await diveRoute.load(divelog, ['7'], fakeEvent());
    expect(data.editHref).toBe('/admin/dives/7');
    expect(data.meta).toEqual({
      title: 'Dive #7 — Blue — Diver',
      description: '30 m for 42 minutes at Ressel on 2026-01-02.',
    });
  });

  describe('a dive opened from a mailed sign link', () => {
    const privateDive = {
      number: 9,
      title: '',
      max_depth_m: 20,
      duration_min: 40,
      date: '2026-10-25',
      site: null,
      visibility: 'private',
    };
    const signPage = {
      state: 'open',
      signer: { slug: 'alex', first_name: 'Alex' },
      expires_at: '2026-11-01T10:00:00Z',
      note: null,
      dive: privateDive,
    };
    const signUrl = (token: string) => `/api/v1/dive/sign/${token}`;
    const notFound = (divelog: ReturnType<typeof fakeDivelog>) => {
      divelog.apiOrError = vi.fn(async () => error(404, 'Not found')) as typeof divelog.apiOrError;
    };

    it('renders a private dive from the sign page, private and unindexed', async () => {
      const divelog = fakeDivelog({ [signUrl('t0k')]: signPage });
      notFound(divelog);
      const event = fakeEvent('/dive/9?sign=t0k');
      const data = await diveRoute.load(divelog, ['9'], event);
      expect(data.dive).toEqual(privateDive);
      expect(data.signing).toEqual({
        state: 'open',
        number: 9,
        token: 't0k',
        signer: { slug: 'alex', first_name: 'Alex' },
        expires_at: '2026-11-01T10:00:00Z',
        note: null,
      });
      expect(event.setHeaders).toHaveBeenCalledWith({
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
      });
      expect(divelog.api).toHaveBeenCalledWith(event.fetch, signUrl('t0k'));
    });

    it('404s the same private dive without a token', async () => {
      const divelog = fakeDivelog({ [signUrl('t0k')]: signPage });
      notFound(divelog);
      const event = fakeEvent('/dive/9');
      expect(await thrown(diveRoute.load(divelog, ['9'], event))).toMatchObject({ status: 404 });
      expect(divelog.api).not.toHaveBeenCalled();
      expect(event.setHeaders).not.toHaveBeenCalled();
    });

    it('loads the page as usual when the token belongs to another dive', async () => {
      const divelog = fakeDivelog({
        [signUrl('t0k')]: signPage,
        [`${API}/dives/7`]: { ...privateDive, number: 7, visibility: 'public' },
      });
      const data = await diveRoute.load(divelog, ['7'], fakeEvent('/dive/7?sign=t0k'));
      expect(data.dive.number).toBe(7);
      expect(data.signing).toBeNull();
    });

    it('marks an expired or unknown token on a public dive', async () => {
      const divelog = fakeDivelog({
        [signUrl('old')]: new ApiError(410, 'This sign link has expired'),
        [`${API}/dives/7`]: { ...privateDive, number: 7, visibility: 'public' },
      });
      const data = await diveRoute.load(divelog, ['7'], fakeEvent('/dive/7?sign=old'));
      expect(data.dive.number).toBe(7);
      expect(data.signing).toEqual({ state: 'expired', number: 7 });
    });

    it('404s an expired token on a private dive', async () => {
      const divelog = fakeDivelog({ [signUrl('old')]: new ApiError(410, 'gone') });
      notFound(divelog);
      expect(
        await thrown(diveRoute.load(divelog, ['9'], fakeEvent('/dive/9?sign=old'))),
      ).toMatchObject({ status: 404 });
    });

    it('loads the page without a box when the sign page fails otherwise', async () => {
      const divelog = fakeDivelog({
        [signUrl('t0k')]: new ApiError(502, 'down'),
        [`${API}/dives/7`]: { ...privateDive, number: 7, visibility: 'public' },
      });
      const data = await diveRoute.load(divelog, ['7'], fakeEvent('/dive/7?sign=t0k'));
      expect(data.signing).toBeNull();
    });

    it('encodes the token into the API path', async () => {
      const divelog = fakeDivelog({
        [signUrl('a%2Fb')]: { ...signPage, dive: { ...privateDive } },
      });
      const data = await diveRoute.load(divelog, ['9'], fakeEvent('/dive/9?sign=a%2Fb'));
      expect(data.signing).toMatchObject({ token: 'a/b' });
    });
  });

  it('groups sites by country and region, busiest first', () => {
    const regions = [{ id: 'lot', name: 'Lot' }] as Region[];
    const countries = groupSites(
      [
        site({ slug: 'a', name: 'A', region: 'lot', dives: 2 }),
        site({ slug: 'b', name: 'B', region: 'lot', dives: 5 }),
        site({ slug: 'c', name: 'C', region: 'gone', dives: 1 }),
        site({
          slug: 'd',
          name: 'D',
          country_code: 'MX',
          country_name: 'Mexico',
          dives: 20,
          maps: [{ collection: 'drawn' }, { collection: 'scan' }] as Site['maps'],
        }),
      ],
      regions,
    );
    expect(countries.map((c) => c.code)).toEqual(['MX', 'FR']);
    expect(countries[0].regions[0]).toMatchObject({ id: null, name: 'Elsewhere' });
    expect(countries[0].regions[0].sites[0].drawn).toBe(1);
    expect(countries[1].regions.map((r) => r.name)).toEqual(['Lot', 'gone']);
    expect(countries[1].regions[0].sites.map((s) => s.slug)).toEqual(['b', 'a']);
  });

  it('lists the site types', async () => {
    const divelog = fakeDivelog({
      [`${API}/sites`]: [site({ site_type: 'wreck' }), site({ site_type: 'cave' })],
      [`${API}/regions`]: [],
    });
    const data = await sitesRoute.load(divelog, [], fakeEvent());
    expect(data).toMatchObject({ types: ['cave', 'wreck'], total: 2, editHref: '/admin/sites' });
  });

  it('places a site and gives it its card', async () => {
    const divelog = fakeDivelog({
      [`${API}/sites/fra-ressel`]: {
        site: { ...ressel, id: 'fra-ressel', summary: null, country_name: 'France' },
        dives: [{}, {}],
        people: [],
        nearby: [],
        routes: [],
      },
    });
    const data = await siteRoute.load(divelog, ['fra-ressel'], fakeEvent());
    expect(data.map.point).not.toBeNull();
    expect(data.meta).toEqual({
      title: 'Ressel — dive site — Diver',
      description: '2 dives at Ressel, France.',
      image: '/dive/og/site/fra-ressel.png',
    });
  });

  it('leaves an unplaced site off the map', async () => {
    const divelog = fakeDivelog({
      [`${API}/sites/x`]: {
        site: { id: 'x', slug: 'x', name: 'X', lat: null, lon: null, summary: 'Deep.' },
        dives: [],
        people: [],
        nearby: [],
        routes: [],
      },
    });
    const data = await siteRoute.load(divelog, ['x'], fakeEvent());
    expect(data.map.point).toBeNull();
    expect(data.meta?.description).toBe('Deep.');
  });

  it('draws a region panel only when it has sites', async () => {
    const divelog = fakeDivelog({
      [`${API}/regions/lot`]: {
        id: 'lot',
        name: 'Lot',
        map_sites: [ressel],
        sites: [{}],
        dives: 3,
      },
      [`${API}/regions/empty`]: { id: 'empty', name: 'Empty', map_sites: [], sites: [], dives: 0 },
    });
    const lot = await regionRoute.load(divelog, ['lot'], fakeEvent());
    expect(lot.map?.dots).toHaveLength(1);
    expect(lot.meta?.title).toBe('Lot — dive region — Diver');
    const empty = await regionRoute.load(divelog, ['empty'], fakeEvent());
    expect(empty.map).toBeNull();
    expect(empty.editHref).toBe('/admin/regions/empty');
  });

  it('loads trips and a trip', async () => {
    const divelog = fakeDivelog({
      [`${API}/trips`]: [],
      [`${API}/trips/t`]: {
        trip: {
          slug: 't',
          name: 'Trip',
          start_date: '2026-02-06',
          end_date: '2026-02-22',
          stats: { dives: 9, sites: 4 },
        },
        dives: [],
        map_sites: [],
      },
    });
    expect(await tripsRoute.load(divelog, [], fakeEvent())).toMatchObject({
      trips: [],
      editHref: '/admin/trips',
    });
    const trip = await tripRoute.load(divelog, ['t'], fakeEvent());
    expect(trip.map).toBeNull();
    expect(trip.editHref).toBe('/admin/trips/t');
    expect(trip.meta?.description).toMatch(/^9 dives at 4 sites, /);
  });

  it('links a person to their editor when the owner sees them', async () => {
    const person = { name: 'Kim', stats: { countries: 2 } };
    const divelog = fakeDivelog({
      [`${API}/people`]: [],
      [`${API}/people/kim`]: {
        person: { ...person, private: { id: 'kim one' } },
        countries: [],
        dives: [{}],
        map_sites: [ressel],
        years: [],
        trips: [],
      },
      [`${API}/people/anon`]: {
        person,
        countries: [],
        dives: [],
        map_sites: [],
        years: [],
        trips: [],
      },
    });
    expect((await peopleRoute.load(divelog, [], fakeEvent())).meta?.title).toBe(
      'Dive buddies — Diver',
    );
    const kim = await personRoute.load(divelog, ['kim'], fakeEvent());
    expect(kim.editHref).toBe('/admin/people/kim%20one');
    expect(kim.map.dots).toHaveLength(1);
    expect(kim.meta?.description).toBe('1 dives together, 2 countries.');
    const anon = await personRoute.load(divelog, ['anon'], fakeEvent());
    expect(anon.editHref).toBe('/admin/people');
  });

  it('loads the gear page', async () => {
    const divelog = fakeDivelog({ [`${API}/gear`]: { items: [] } });
    expect(await gearRoute.load(divelog, [], fakeEvent())).toEqual({
      gear: { items: [] },
      editHref: '/admin/gear',
      page: 'gear',
    });
  });

  it('ends page titles with the configured suffix', async () => {
    const divelog = fakeDivelog(
      { [`${API}/people`]: [] },
      { ...DEFAULT_CONFIG, titleSuffix: 'A. Diver' },
    );
    expect((await peopleRoute.load(divelog, [], fakeEvent())).meta?.title).toBe(
      'Dive buddies — A. Diver',
    );
  });
});
