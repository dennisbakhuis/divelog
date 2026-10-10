/**
 * Sample records for the site-sharing features: a personal site, a commons site with an
 * overlay, a stale pin, a fork, a stale route on a changed map and a repo status with notices.
 */
import type {
  Attribution,
  CommonsPullOut,
  CommonsSiteHit,
  MapRef,
  RepoStatus,
  Site,
} from '$lib/core/dive/types';
import type { DiveMapAnnotation, SiteMapOut } from '$lib/core/dive/sitemap';

/** A personal site with every field filled; `overrides` replace fields. */
export function fakeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'nld-example',
    slug: 'nld-example',
    name: 'Example Quarry',
    full_name: null,
    short_name: null,
    aliases: [],
    country: 'NLD',
    country_code: 'NL',
    country_name: 'Netherlands',
    region: null,
    region_name: null,
    area: 'Utrecht',
    system: null,
    site_type: 'quarry lake',
    section_vocabulary: [],
    lat: 52.09,
    lon: 5.12,
    access: null,
    location_visibility: 'exact',
    water: 'fresh',
    halocline: false,
    halocline_m: null,
    summary: 'A flooded sand quarry.',
    description_md: '',
    max_depth_m: 18,
    dives: 2,
    first_dive: '2024-05-12',
    last_dive: '2024-05-12',
    maps: [],
    default_map: null,
    attachments: [],
    prices: [],
    sources: [],
    verified: null,
    geo_source: null,
    origin: 'log',
    attribution: null,
    revision: 1,
    changelog: [],
    forked_from: null,
    private: null,
    description_html: '',
    ...overrides,
  };
}

/** A small stick map, `a – b – c` with a side branch `b – d`; `overrides` replace fields. */
export function fakeMap(overrides: Partial<SiteMapOut> = {}): SiteMapOut {
  const node = (id: string, x: number, y: number): SiteMapOut['nodes'][number] => ({
    id,
    x,
    y,
    type: 't',
    label: id.toUpperCase(),
    depth: null,
    object_kind: null,
    left: null,
    right: null,
    color: null,
  });
  const edge = (from: string, to: string): SiteMapOut['edges'][number] => ({
    from,
    to,
    distance: null,
    azimuth: null,
    note: '',
    style: 'line',
  });
  return {
    id: 'fra-ressel-1',
    site_id: 'fra-ressel',
    sort: 0,
    revision: 1,
    changelog: [],
    updated_at: null,
    version: 3,
    kind: 'stickmap',
    title: 'Lines',
    north: 0,
    to_scale: true,
    nodes: [node('a', 0, 0), node('b', 30, 0), node('c', 60, 0), node('d', 30, 30)],
    edges: [edge('a', 'b'), edge('b', 'c'), edge('b', 'd')],
    areas: [],
    lines: [],
    notes: '',
    origin: null,
    underlay: null,
    ...overrides,
  };
}

/** The map reference a site lists for a drawn map. */
export function drawnRef(map: SiteMapOut): MapRef {
  return {
    ref: `drawn:${map.id}`,
    collection: 'drawn',
    title: map.title,
    url: null,
    public: true,
    credit: null,
    warning: null,
    drawn: map,
  };
}

/** The commons attribution of the sites below: a GitHub source pinned to a commit. */
export const COMMONS_ATTRIBUTION: Attribution = {
  licence: 'ODbL-1.0 + CC-BY-SA-4.0',
  source: 'https://github.com/divelog/divelog-sites',
  ref: '3f0c1a2b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a',
};

/** A commons site with an overlay: a commons map, a personal `-p1` map and a current pin. */
export function commonsSite(overrides: Partial<Site> = {}): Site {
  return fakeSite({
    id: 'fra-ressel',
    slug: 'fra-ressel',
    name: 'Émergence du Ressel',
    country: 'FRA',
    country_code: 'FR',
    country_name: 'France',
    site_type: 'cave',
    origin: 'commons',
    attribution: COMMONS_ATTRIBUTION,
    revision: 6,
    changelog: [{ revision: 6, date: '2026-10-01', author: null, note: 'Second sump surveyed' }],
    maps: [
      drawnRef(fakeMap({ revision: 3 })),
      drawnRef(fakeMap({ id: 'fra-ressel-p1', title: 'My lines' })),
    ],
    private: {
      notes: null,
      reference_maps: [],
      pin: { pinned_revision: 6, current_revision: 6, stale: false },
    },
    ...overrides,
  });
}

/** A commons site whose overlay was written against an older commons revision. */
export function stalePinSite(overrides: Partial<Site> = {}): Site {
  return commonsSite({
    id: 'fra-cabouy',
    slug: 'fra-cabouy',
    name: 'Cabouy',
    private: {
      notes: null,
      reference_maps: [],
      pin: { pinned_revision: 4, current_revision: 6, stale: true },
    },
    ...overrides,
  });
}

/** A fork of a commons site, forked at commons revision 4 and stale against revision 6. */
export function forkSite(overrides: Partial<Site> = {}): Site {
  return fakeSite({
    id: 'fra-goul',
    slug: 'fra-goul',
    name: 'Goul de la Tannerie',
    country: 'FRA',
    country_code: 'FR',
    country_name: 'France',
    site_type: 'cave',
    origin: 'fork',
    revision: 5,
    forked_from: 'commons@4',
    changelog: [
      { revision: 5, date: '2026-10-02', author: null, note: 'Forked from commons revision 4' },
    ],
    private: {
      notes: null,
      reference_maps: [],
      pin: { pinned_revision: 4, current_revision: 6, stale: true },
    },
    ...overrides,
  });
}

/**
 * A route drawn on revision 2 of a map now at revision 3, whose leg `b → x` is gone: the map,
 * the annotation and the dive fields the API sends for it.
 */
export function staleAnnotation(): {
  map: SiteMapOut;
  annotation: DiveMapAnnotation;
  annotation_stale: boolean;
  annotation_dropped_legs: number;
} {
  return {
    map: fakeMap({ revision: 3 }),
    annotation: {
      map_id: 'fra-ressel-1',
      revision: 2,
      route: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'x' },
      ],
      turn: 'x',
      pins: [],
      path: [],
      turn_at: null,
      note: '',
    },
    annotation_stale: true,
    annotation_dropped_legs: 1,
  };
}

/** A repo status with the log clean, the commons checked out and two notices. */
export function fakeRepoStatus(overrides: Partial<RepoStatus> = {}): RepoStatus {
  return {
    state: 'clean',
    ahead: 0,
    behind: 0,
    head: '81b54bf0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
    dirty: false,
    last_push_at: null,
    last_error: null,
    load_errors: [],
    notices: [
      'site fra-goul shadows the commons record',
      'site fra-cabouy: overlay written against commons revision 4, commons is at 6',
    ],
    commons_head: '3f0c1a2b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a',
    commons_state: 'clean',
    ...overrides,
  };
}

/** Hits of a commons search near Lot: two not in the log yet, one dived, one forked. */
export function fakeCommonsHits(): CommonsSiteHit[] {
  const hit = (patch: Partial<CommonsSiteHit>): CommonsSiteHit => ({
    id: 'fra-x',
    name: 'X',
    country: 'FRA',
    type: 'cave',
    lat: 44.6,
    lon: 1.7,
    area: 'Lot',
    dives: 0,
    has_dives: false,
    origin: 'commons',
    distance_km: null,
    ...patch,
  });
  return [
    hit({
      id: 'fra-emergence-du-ressel',
      name: 'Ressel',
      dives: 40,
      has_dives: true,
      distance_km: 0.4,
    }),
    hit({ id: 'fra-fontaine-de-truffe', name: 'Fontaine de Truffe', distance_km: 1.2 }),
    hit({ id: 'fra-goul', name: 'Goul de la Tannerie', origin: 'fork', distance_km: 3.5 }),
    hit({ id: 'fra-saint-sauveur', name: 'Saint-Sauveur', area: 'Gramat', distance_km: 12.75 }),
  ];
}

/** A commons pull that moved the head, pinned the log and made two sites stale. */
export function fakeCommonsPull(overrides: Partial<CommonsPullOut> = {}): CommonsPullOut {
  return {
    previous_head: '3f0c1a2b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a',
    head: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
    pinned: true,
    stale: [
      {
        site_id: 'fra-cabouy',
        origin: 'commons',
        pinned_revision: 4,
        current_revision: 7,
        new: true,
      },
      { site_id: 'fra-goul', origin: 'fork', pinned_revision: 4, current_revision: 6, new: false },
    ],
    ...overrides,
  };
}
