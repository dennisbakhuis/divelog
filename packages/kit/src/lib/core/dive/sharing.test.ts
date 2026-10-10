import { describe, expect, it } from 'vitest';
import {
  annotationHealth,
  attributionText,
  commonsSearchPath,
  importMatchLabel,
  isPersonalMapId,
  isUrl,
  legLabel,
  mapFromCommons,
  matchesOrigin,
  noticeSiteId,
  repinAnnotation,
  shortRef,
  sourceName,
  splitHits,
  staleMessage,
} from './sharing';
import type { ImportSite } from './types';
import {
  COMMONS_ATTRIBUTION,
  commonsSite,
  fakeCommonsHits,
  fakeMap,
  fakeRepoStatus,
  fakeSite,
  forkSite,
  staleAnnotation,
  stalePinSite,
} from '$lib/testing/sharing';

describe('attribution helpers', () => {
  it('shortens commit hashes and leaves other refs alone', () => {
    expect(shortRef(COMMONS_ATTRIBUTION.ref)).toBe('3f0c1a2');
    expect(shortRef('v1.2')).toBe('v1.2');
    expect(shortRef(null)).toBeNull();
    expect(shortRef('')).toBeNull();
  });

  it('recognises http(s) URLs only', () => {
    expect(isUrl('https://github.com/divelog/divelog-sites')).toBe(true);
    expect(isUrl('http://example.org/x')).toBe(true);
    expect(isUrl('divelog-sites')).toBe(false);
    expect(isUrl('ftp://example.org')).toBe(false);
    expect(isUrl(null)).toBe(false);
  });

  it('names the source after its repository', () => {
    expect(sourceName('https://github.com/divelog/divelog-sites')).toBe('divelog-sites');
    expect(sourceName('https://example.org/sites.git')).toBe('sites');
    expect(sourceName('https://example.org/')).toBe('divelog-sites');
    expect(sourceName('my-commons')).toBe('my-commons');
    expect(sourceName(null)).toBe('divelog-sites');
  });

  it('writes the licence line', () => {
    expect(attributionText(COMMONS_ATTRIBUTION)).toBe(
      'Site data © divelog-sites contributors (ODbL), descriptions and maps CC BY-SA 4.0',
    );
    expect(attributionText(null)).toContain('divelog-sites contributors');
  });
});

describe('map origin', () => {
  it('tells personal map ids by their -p<n> suffix', () => {
    expect(isPersonalMapId('fra-ressel-p1')).toBe(true);
    expect(isPersonalMapId('fra-ressel-1')).toBe(false);
    expect(isPersonalMapId('fra-pont-1')).toBe(false);
  });

  it('takes drawn maps and sketches of commons sites and forks from the commons', () => {
    const [commons, personal] = commonsSite().maps;
    expect(mapFromCommons(commons, 'commons')).toBe(true);
    expect(mapFromCommons(commons, 'fork')).toBe(true);
    expect(mapFromCommons(personal, 'commons')).toBe(false);
    expect(mapFromCommons(commons, 'log')).toBe(false);
    expect(mapFromCommons({ ref: 'seed:fra-ressel', collection: 'seed' }, 'commons')).toBe(true);
    expect(mapFromCommons({ ref: 'reference:scan.png', collection: 'reference' }, 'commons')).toBe(
      false,
    );
    expect(mapFromCommons({ ref: 'fra-ressel-2', collection: 'drawn' }, 'commons')).toBe(true);
  });
});

describe('origin filter', () => {
  const sites = [fakeSite(), commonsSite(), stalePinSite(), forkSite()];
  const ids = (filter: Parameters<typeof matchesOrigin>[1]) =>
    sites.filter((s) => matchesOrigin(s, filter)).map((s) => s.id);

  it('splits personal records from commons ones and finds the stale', () => {
    expect(ids('all')).toHaveLength(4);
    expect(ids('personal')).toEqual(['nld-example', 'fra-goul']);
    expect(ids('commons')).toEqual(['fra-ressel', 'fra-cabouy']);
    expect(ids('stale')).toEqual(['fra-cabouy', 'fra-goul']);
  });
});

describe('repo notices', () => {
  it('finds the site a notice is about', () => {
    const [shadow, stale] = fakeRepoStatus().notices;
    expect(noticeSiteId(shadow)).toBe('fra-goul');
    expect(noticeSiteId(stale)).toBe('fra-cabouy');
    expect(noticeSiteId('map fra-ressel-1 shadows the commons record')).toBeNull();
  });
});

describe('stale routes', () => {
  it('reports the revisions and the legs that no longer resolve', () => {
    const { map, annotation } = staleAnnotation();
    const health = annotationHealth(annotation, map);
    expect(health).toEqual({ stale: true, from: 2, to: 3, dropped: [{ from: 'b', to: 'x' }] });
    expect(staleMessage(health)).toBe(
      'The map changed since this route was drawn (map revision 2 → 3); 1 leg no longer resolves.',
    );
  });

  it('is not stale on the current revision with every leg on the map', () => {
    const { map, annotation } = staleAnnotation();
    const current = { ...annotation, revision: 3, route: [{ from: 'b', to: 'a' }] };
    expect(annotationHealth(current, map).stale).toBe(false);
  });

  it('words the other cases', () => {
    expect(staleMessage({ stale: true, from: 1, to: 2, dropped: [] })).toBe(
      'The map changed since this route was drawn (map revision 1 → 2); every leg still resolves.',
    );
    expect(
      staleMessage({
        stale: true,
        from: 2,
        to: 2,
        dropped: [
          { from: 'a', to: 'x' },
          { from: 'x', to: 'y' },
        ],
      }),
    ).toBe('Part of this route is no longer on the map; 2 legs no longer resolve.');
  });

  it('re-pins to the current revision without the unresolved legs and turn', () => {
    const { map, annotation } = staleAnnotation();
    const { annotation: pinned, dropped } = repinAnnotation(annotation, map);
    expect(pinned.revision).toBe(3);
    expect(pinned.route).toEqual([{ from: 'a', to: 'b' }]);
    expect(pinned.turn).toBeNull();
    expect(dropped).toEqual([{ from: 'b', to: 'x' }]);
    expect(annotationHealth(pinned, map).stale).toBe(false);
  });

  it('labels legs by node label, falling back to the id', () => {
    expect(legLabel({ from: 'b', to: 'x' }, fakeMap())).toBe('B → x');
    expect(legLabel({ from: 'b', to: 'x' })).toBe('b → x');
  });
});

describe('import site report', () => {
  const row = (patch: Partial<ImportSite>): ImportSite => ({
    subsurface_uuid: 'u1',
    name: 'Ressel',
    site_id: 'fra-ressel',
    outcome: 'matched',
    matched_by: 'name',
    distance_m: null,
    origin: 'commons',
    ...patch,
  });

  it('says how each site matched', () => {
    expect(importMatchLabel(row({}))).toBe('matched by name');
    expect(importMatchLabel(row({ matched_by: 'distance', distance_m: 120.4 }))).toBe(
      'matched by distance · 120 m',
    );
    expect(importMatchLabel(row({ matched_by: 'uuid' }))).toBe('matched by Subsurface id');
    expect(importMatchLabel(row({ matched_by: null }))).toBe('matched by id');
    expect(importMatchLabel(row({ outcome: 'created', matched_by: null, origin: 'log' }))).toBe(
      'created as a personal site',
    );
  });
});

describe('commons search', () => {
  it('builds the query', () => {
    expect(commonsSearchPath(' ressel ')).toBe('?q=ressel&limit=20');
    expect(commonsSearchPath('', { lat: 44.6, lon: 1.7 }, 5)).toBe('?near=44.6%2C1.7&limit=5');
  });

  it('offers sites neither dived nor forked', () => {
    const { fresh, known } = splitHits(fakeCommonsHits());
    expect(fresh.map((h) => h.id)).toEqual(['fra-fontaine-de-truffe', 'fra-saint-sauveur']);
    expect(known.map((h) => h.id)).toEqual(['fra-emergence-du-ressel', 'fra-goul']);
  });
});
