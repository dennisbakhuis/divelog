/**
 * The owner endpoints of the site workspace and the new-site form, for the stub:
 * countries, licences, the commons field classes, the nearby-sites check and an
 * in-memory site store so a created site opens in its workspace.
 */

/** `GET /meta/countries`: a few, by name. */
export const COUNTRIES = [
  { iso3: 'BEL', iso2: 'BE', name: 'Belgium' },
  { iso3: 'EGY', iso2: 'EG', name: 'Egypt' },
  { iso3: 'FRA', iso2: 'FR', name: 'France' },
  { iso3: 'DEU', iso2: 'DE', name: 'Germany' },
  { iso3: 'NLD', iso2: 'NL', name: 'Netherlands' },
];

/** `GET /meta/licences` */
export const LICENCES = [
  {
    id: 'CC0-1.0',
    name: 'CC0 1.0 Universal',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  { id: 'CC-BY-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  {
    id: 'CC-BY-SA-4.0',
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
];

/** `GET /admin/meta/site-fields` */
export const SITE_FIELDS = {
  objective: [
    'name',
    'full_name',
    'short_name',
    'region',
    'country',
    'area',
    'system',
    'type',
    'section_vocabulary',
    'lat',
    'lon',
    'access',
    'location_visibility',
    'water',
    'halocline',
    'halocline_m',
    'verified',
    'geo_source',
  ],
  personal: ['reference_maps', 'prices', 'notes', 'subsurface_uuid'],
  additive: ['aliases', 'maps', 'media'],
  preference: ['site_id', 'summary', 'default_map', 'aliases', 'maps', 'media'],
};

/** The commons sites the nearby check knows besides the log. */
const COMMONS = [
  {
    site_id: 'fra-fontaine-de-truffe',
    name: 'Fontaine de Truffe',
    country: 'FRA',
    type: 'cave',
    area: 'Lot',
    lat: 44.6,
    lon: 1.7,
  },
];

function metres(a, b) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * `GET /admin/sites/nearby`: log sites (`sites`, SiteOut shapes) and commons sites with the
 * same name or within the radius, nearest first.
 */
export function nearbySites(sites, params) {
  const lat = params.get('lat') === null ? null : Number(params.get('lat'));
  const lon = params.get('lon') === null ? null : Number(params.get('lon'));
  const name = (params.get('name') ?? '').trim().toLowerCase();
  const radius = Number(params.get('radius_m') ?? 300);
  const match = (site) => {
    const d = lat !== null && site.lat !== null ? Math.round(metres({ lat, lon }, site)) : null;
    if (name && site.name.toLowerCase() === name) return { matched_by: 'name', distance_m: d };
    if (d !== null && d <= radius) return { matched_by: 'distance', distance_m: d };
    return null;
  };
  const log = sites.flatMap((s) => {
    const m = match(s);
    if (!m) return [];
    return [
      {
        site_id: s.id,
        name: s.name,
        country: s.country,
        type: s.site_type,
        lat: s.lat,
        lon: s.lon,
        origin: s.origin,
        dives: s.dives,
        ...m,
      },
    ];
  });
  const commons = COMMONS.flatMap((s) => {
    const m = match(s);
    return m ? [{ ...s, ...m }] : [];
  });
  return { log, commons };
}

/** A created site as `POST /admin/sites` answers it, from the request body. */
export function createdSite(body) {
  return {
    id: body.site_id,
    slug: body.site_id,
    name: body.name,
    full_name: body.full_name ?? null,
    short_name: body.short_name ?? null,
    aliases: body.aliases ?? [],
    country: body.country ?? null,
    country_code: '',
    country_name: '',
    region: body.region ?? null,
    region_name: null,
    area: body.area ?? null,
    system: body.system ?? null,
    site_type: body.type ?? 'sea',
    section_vocabulary: body.section_vocabulary ?? [],
    lat: body.lat ?? null,
    lon: body.lon ?? null,
    access: body.access ?? null,
    location_visibility: body.location_visibility ?? 'exact',
    water: body.water ?? null,
    halocline: body.halocline ?? false,
    halocline_m: body.halocline_m ?? null,
    summary: body.summary ?? null,
    description_md: body.description_md ?? '',
    max_depth_m: null,
    dives: 0,
    first_dive: null,
    last_dive: null,
    maps: [],
    default_map: null,
    attachments: [],
    prices: [],
    sources: [],
    verified: null,
    geo_source: body.geo_source ?? null,
    origin: 'log',
    attribution: null,
    revision: 1,
    changelog: [{ revision: 1, date: '2026-10-10', note: 'Created', author: null }],
    forked_from: null,
    private: { notes: null, reference_maps: [], pin: null },
    description_html: '',
  };
}
