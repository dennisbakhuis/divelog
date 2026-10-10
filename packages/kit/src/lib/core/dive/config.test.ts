import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, createUrls, escapeRegExp, queryString, titleSuffix } from './config';

describe('createUrls with the default config', () => {
  const urls = createUrls(DEFAULT_CONFIG);

  it('builds the public paths the site has always used', () => {
    expect(urls.base).toBe('/dive');
    expect(urls.log()).toBe('/dive');
    expect(urls.log('')).toBe('/dive');
    expect(urls.log('tag=cave&min=30')).toBe('/dive?tag=cave&min=30');
    expect(urls.log('?year=2024')).toBe('/dive?year=2024');
    expect(urls.log(new URLSearchParams({ site: 'fra-ressel' }))).toBe('/dive?site=fra-ressel');
    expect(urls.filter({ tag: 'cave' })).toBe('/dive?tag=cave');
    expect(urls.filter({ min: 30 })).toBe('/dive?min=30');
    expect(urls.filter({ region: 'lot-karst' })).toBe('/dive?region=lot-karst');
    expect(urls.filter({ setup: 'sidemount' })).toBe('/dive?setup=sidemount');
    expect(urls.filter({ with: 'kim' })).toBe('/dive?with=kim');
    expect(urls.filter({ country: 'FR', with: 'kim' })).toBe('/dive?country=FR&with=kim');
    expect(urls.filter({ site: 'mex-tortuga', section: 'Upstream A' })).toBe(
      '/dive?site=mex-tortuga&section=Upstream%20A',
    );
    expect(urls.filter({ tag: 'cave', site: null, year: undefined })).toBe('/dive?tag=cave');
    expect(urls.dive(650)).toBe('/dive/650');
    expect(urls.dive('654')).toBe('/dive/654');
    expect(urls.sites()).toBe('/dive/sites');
    expect(urls.site('fra-ressel')).toBe('/dive/sites/fra-ressel');
    expect(urls.trips()).toBe('/dive/trips');
    expect(urls.trip('2024-mexico')).toBe('/dive/trips/2024-mexico');
    expect(urls.people()).toBe('/dive/people');
    expect(urls.person('kim')).toBe('/dive/people/kim');
    expect(urls.region('lot-karst')).toBe('/dive/regions/lot-karst');
    expect(urls.gear()).toBe('/dive/gear');
    expect(urls.gear('sidemount')).toBe('/dive/gear#sidemount');
    expect(urls.og('dive', 409)).toBe('/dive/og/dive/409.png');
    expect(urls.og('site', 'mex-mayan-blue')).toBe('/dive/og/site/mex-mayan-blue.png');
  });

  it('builds the editor paths the site has always used', () => {
    const a = urls.admin;
    expect(a.base).toBe('/admin');
    expect(a.root()).toBe('/admin');
    expect(a.dives()).toBe('/admin/dives');
    expect(a.dive(650)).toBe('/admin/dives/650');
    expect(a.dive(650, 'map')).toBe('/admin/dives/650#map');
    expect(a.newDive()).toBe('/admin/dives/new');
    expect(a.sites()).toBe('/admin/sites');
    expect(a.site('fra-ressel')).toBe('/admin/sites/fra-ressel');
    expect(a.siteMaps('fra-ressel')).toBe('/admin/sites/fra-ressel/maps');
    expect(a.newSite()).toBe('/admin/sites/new');
    expect(a.regions()).toBe('/admin/regions');
    expect(a.region('lot-karst')).toBe('/admin/regions/lot-karst');
    expect(a.newRegion()).toBe('/admin/regions/new');
    expect(a.people()).toBe('/admin/people');
    expect(a.person('p-kim')).toBe('/admin/people/p-kim');
    expect(a.newPerson()).toBe('/admin/people/new');
    expect(a.trips()).toBe('/admin/trips');
    expect(a.trip('2024-mexico')).toBe('/admin/trips/2024-mexico');
    expect(a.newTrip()).toBe('/admin/trips/new');
    expect(a.gear()).toBe('/admin/gear');
    expect(a.import()).toBe('/admin/import');
    expect(a.login()).toBe('/admin/login');
    expect(a.login('/admin/dives/650')).toBe('/admin/login?next=%2Fadmin%2Fdives%2F650');
  });

  it('builds the API, media and tile paths the site has always used', () => {
    expect(urls.api('/dive/stats')).toBe('/api/v1/dive/stats');
    expect(urls.api('/admin/dives/650')).toBe('/api/v1/admin/dives/650');
    expect(urls.media('sites/fra-ressel.jpg')).toBe('/media/sites/fra-ressel.jpg');
    expect(urls.media('/sites/fra-ressel.jpg')).toBe('/media/sites/fra-ressel.jpg');
    expect(urls.tilesBase).toBe('/media/tiles');
    expect(urls.tiles('index.json')).toBe('/media/tiles/index.json');
  });
});

describe('createUrls with another mount', () => {
  const urls = createUrls({
    ...DEFAULT_CONFIG,
    basePath: '/logbook/',
    adminPath: '/editor',
    apiBase: 'https://api.example.org/v2/',
    mediaBase: 'https://cdn.example.org',
    tilesBase: '/tiles/',
  });

  it('moves every path with the config', () => {
    expect(urls.log()).toBe('/logbook');
    expect(urls.dive(1)).toBe('/logbook/1');
    expect(urls.site('x')).toBe('/logbook/sites/x');
    expect(urls.og('dive', 1)).toBe('/logbook/og/dive/1.png');
    expect(urls.admin.dive(1)).toBe('/editor/dives/1');
    expect(urls.admin.login('/editor')).toBe('/editor/login?next=%2Feditor');
    expect(urls.api('/dive/stats')).toBe('https://api.example.org/v2/dive/stats');
    expect(urls.media('a.jpg')).toBe('https://cdn.example.org/a.jpg');
    expect(urls.tiles('index.json')).toBe('/tiles/index.json');
  });

  it('mounts at the root', () => {
    const root = createUrls({ ...DEFAULT_CONFIG, basePath: '/', adminPath: '/' });
    expect(root.log()).toBe('/');
    expect(root.log({ tag: 'cave' })).toBe('/?tag=cave');
    expect(root.dive(3)).toBe('/3');
    expect(root.admin.root()).toBe('/');
    expect(root.admin.sites()).toBe('/sites');
  });
});

describe('queryString', () => {
  it('handles every input shape', () => {
    expect(queryString()).toBe('');
    expect(queryString('a=1')).toBe('a=1');
    expect(queryString(new URLSearchParams([['a', 'x y']]))).toBe('a=x+y');
    expect(queryString({ a: 'x y', b: 2, c: '' })).toBe('a=x%20y&b=2&c=');
  });
});

describe('escapeRegExp', () => {
  it('makes a path literal inside a pattern', () => {
    const pattern = new RegExp(`^${escapeRegExp('/dive.log')}\\/\\d+$`);
    expect(pattern.test('/dive.log/12')).toBe(true);
    expect(pattern.test('/divexlog/12')).toBe(false);
  });
});

describe('titleSuffix', () => {
  it('defaults to the owner name and takes an explicit suffix', () => {
    expect(titleSuffix(DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.ownerName);
    expect(titleSuffix({ ...DEFAULT_CONFIG, titleSuffix: 'Log' })).toBe('Log');
  });
});
