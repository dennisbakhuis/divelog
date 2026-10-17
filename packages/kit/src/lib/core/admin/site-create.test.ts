import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  draftSiteId,
  emptySiteDraft,
  fetchNearby,
  geoSourceText,
  nearbyPath,
  nearbyReason,
  siteCreateBody,
  siteIdStatus,
  validateDraft,
} from './site-create.js';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe('the new-site draft', () => {
  it('starts with the type water and what the caller knows', () => {
    expect(emptySiteDraft()).toMatchObject({ type: 'sea', water: 'salt', lat: null, name: '' });
    expect(emptySiteDraft({ type: 'cave' }).water).toBe('fresh');
    expect(emptySiteDraft({ name: 'Ressel', country: 'FRA' })).toMatchObject({
      name: 'Ressel',
      country: 'FRA',
    });
  });

  it('derives the id from country and name', () => {
    expect(draftSiteId({ country: 'fra', name: 'Émergence du Ressel' })).toBe(
      'fra-emergence-du-ressel',
    );
    expect(draftSiteId({ country: '', name: 'Somewhere' })).toBe('xxx-somewhere');
    expect(draftSiteId({ country: 'NLD', name: '  ' })).toBe('');
  });

  it('builds the create body', () => {
    const body = siteCreateBody(
      emptySiteDraft({
        name: ' Ressel ',
        country: 'fra',
        type: 'cave',
        lat: 44.5612,
        lon: 1.7344,
        geo_source: 'map pick, 2026-10-10',
        aliases: 'Le Ressel, Ressel spring',
        halocline_m: 12,
      }),
    );
    expect(body).toMatchObject({
      site_id: 'fra-ressel',
      name: 'Ressel',
      country: 'FRA',
      water: 'fresh',
      lat: 44.5612,
      geo_source: 'map pick, 2026-10-10',
      aliases: ['Le Ressel', 'Ressel spring'],
      halocline: false,
      halocline_m: null,
      region: null,
      summary: null,
    });
    const unplaced = siteCreateBody(emptySiteDraft({ name: 'X', geo_source: 'stale' }));
    expect(unplaced).toMatchObject({ lat: null, lon: null, geo_source: null });
  });

  it('validates before posting', () => {
    expect(validateDraft(emptySiteDraft())).toEqual({
      name: 'Give the site a name.',
      country: 'Pick the country, or place the pin and it is filled in.',
    });
    const ok = emptySiteDraft({ name: 'X', country: 'NLD', lat: 52, lon: 5 });
    expect(validateDraft(ok)).toEqual({});
    expect(validateDraft({ ...ok, lon: null }).lat).toContain('both');
    expect(validateDraft({ ...ok, lat: 95 }).lat).toContain('-90 to 90');
    expect(validateDraft({ ...ok, lon: 190 }).lon).toContain('-180 to 180');
    expect(validateDraft({ ...ok, halocline: true, halocline_m: -2 }).halocline_m).toBeDefined();
  });

  it('records where the position came from', () => {
    expect(geoSourceText('pick', '2026-10-10')).toBe('map pick, 2026-10-10');
    expect(geoSourceText('paste', '2026-10-10')).toBe('pasted coordinates, 2026-10-10');
    expect(geoSourceText('geolocation', '2026-10-10')).toBe('device location, 2026-10-10');
    expect(geoSourceText('pick')).toMatch(/^map pick, \d{4}-\d{2}-\d{2}$/);
  });
});

describe('the server checks', () => {
  it('reads a free, taken or unknown id', async () => {
    respond(404, { detail: 'Site not found' });
    expect(await siteIdStatus('nld-new')).toBe('free');
    respond(200, { id: 'nld-new' });
    expect(await siteIdStatus('nld-new')).toBe('taken');
    respond(500);
    expect(await siteIdStatus('nld-new')).toBeNull();
    expect(await siteIdStatus('bad id')).toBeNull();
  });

  it('asks for nearby sites by point and/or name', () => {
    expect(nearbyPath({ name: 'Re', lat: null, lon: null })).toBeNull();
    expect(nearbyPath({ name: 'Ressel', lat: null, lon: null })).toBe(
      '/admin/sites/nearby?name=Ressel&radius_m=300&limit=8',
    );
    expect(nearbyPath({ name: '', lat: 44.5, lon: 1.7 }, { radiusM: 500, limit: 3 })).toBe(
      '/admin/sites/nearby?lat=44.5&lon=1.7&radius_m=500&limit=3',
    );
    expect(nearbyPath({ name: 'Le Ressel', lat: 44.5, lon: 1.7 })).toContain(
      'lat=44.5&lon=1.7&name=Le+Ressel',
    );
  });

  it('gives empty lists when the nearby query fails', async () => {
    respond(500);
    expect(await fetchNearby('/admin/sites/nearby?name=x')).toEqual({ log: [], commons: [] });
    respond(200, { log: [{ site_id: 'a' }], commons: [] });
    expect((await fetchNearby('/admin/sites/nearby?name=x')).log).toHaveLength(1);
  });

  it('says why a nearby site is listed', () => {
    expect(nearbyReason({ matched_by: 'distance', distance_m: 120.4 })).toBe('120 m away');
    expect(nearbyReason({ matched_by: 'distance', distance_m: 2345 })).toBe('2.3 km away');
    expect(nearbyReason({ matched_by: 'distance', distance_m: null })).toBe('nearby');
    expect(nearbyReason({ matched_by: 'name', distance_m: null })).toBe('name matches');
    expect(nearbyReason({ matched_by: 'name', distance_m: 80 })).toBe('name matches, 80 m away');
    expect(nearbyReason({ matched_by: 'alias', distance_m: null })).toBe('matches an alias');
    expect(nearbyReason({ matched_by: 'alias', distance_m: 10 })).toBe(
      'matches an alias, 10 m away',
    );
  });
});
