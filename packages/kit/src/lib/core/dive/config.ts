/**
 * The dive log's configuration and the single place that knows its URLs.
 * Every page link, admin link, API base, media and tile path is built here,
 * so a consumer can mount the log under another path by changing the config.
 */
import type { TankGas } from './types.js';

export type CylinderPreset = { name: string; volume_l: number };

export type GasPreset = {
  label: string;
  gas: TankGas;
  o2: number | null;
  he: number | null;
};

export type DivelogPresets = {
  tags?: readonly string[];
  cylinders?: CylinderPreset[];
  gases?: GasPreset[];
};

/** Page copy a site may replace with its own voice; plain text. */
export type DivelogCopy = {
  /** Under the log page's heading. */
  logLede?: string;
  /** Under the sites index heading, before the link to the trips. */
  sitesLede?: string;
  /** Under the buddies index heading. */
  peopleLede?: string;
  /** The gear page's heading. */
  gearTitle?: string;
  /** Under the gear page's heading. */
  gearLede?: string;
};

export const DEFAULT_COPY: Required<DivelogCopy> = {
  logLede:
    'Every logged dive with its site, depth, time and buddies: searchable, filterable and on the map.',
  sitesLede:
    'Every site in the log, grouped by country and region. Each has its own page with the story of the place, a locator map, the dives logged there and, where one has been drawn, a map of the site.',
  peopleLede:
    'Nobody dives alone. Everyone here has been on the other end of a buddy check at least once.',
  gearTitle: 'The gear behind the log',
  gearLede:
    'Setups are the combinations that get dived; items are the pieces. Each shows how many logged dives it has been on.',
};

export type DivelogConfig = {
  basePath: string;
  adminPath: string;
  apiBase: string;
  mediaBase: string;
  tilesBase: string;
  siteName: string;
  ownerName: string;
  siteUrl: string;
  /** Ends every page title (`… — <suffix>`); defaults to `ownerName`. */
  titleSuffix?: string;
  presets?: DivelogPresets;
  /** Page copy; anything left out keeps the kit's default text. */
  copy?: DivelogCopy;
  /** Show local-development hints (e.g. where sign-in mail lands); off unless set. */
  devHints?: boolean;
};

export const DEFAULT_CONFIG: DivelogConfig = {
  basePath: '/dive',
  adminPath: '/admin',
  apiBase: '/api/v1',
  mediaBase: '/media',
  tilesBase: '/media/tiles',
  siteName: 'divelog',
  ownerName: 'Diver',
  siteUrl: 'http://localhost:3000',
};

/** The page copy of a config, with the kit's defaults for what it leaves out. */
export function copyFor(config: DivelogConfig): Required<DivelogCopy> {
  return { ...DEFAULT_COPY, ...config.copy };
}

/** The text that ends the log's page titles. */
export function titleSuffix(config: DivelogConfig): string {
  return config.titleSuffix ?? config.ownerName;
}

export type QueryParams =
  string | URLSearchParams | Record<string, string | number | null | undefined>;

export type OgKind = 'dive' | 'site';

/** Prefill for the new-dive editor: a site id, trip slug, person slug and/or `YYYY-MM-DD` date. */
export type NewDiveParams = {
  site?: string | null;
  trip?: string | null;
  person?: string | null;
  date?: string | null;
};

/**
 * Query string without the leading `?`. Records keep their key order, skip
 * null and undefined values and encode values with `encodeURIComponent`; strings pass through.
 */
export function queryString(params?: QueryParams): string {
  if (params === undefined) return '';
  if (typeof params === 'string') return params.replace(/^\?/, '');
  if (params instanceof URLSearchParams) return params.toString();
  return Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
}

function withQuery(path: string, params?: QueryParams): string {
  const query = queryString(params);
  return query ? `${path}?${query}` : path;
}

function withHash(path: string, hash?: string): string {
  return hash === undefined ? path : `${path}#${hash}`;
}

function trimSlash(path: string): string {
  return path.replace(/\/+$/, '');
}

/**
 * Pure URL builder for a config. Path segments are inserted as given (callers
 * encode where they need to), so the default config yields today's paths exactly.
 */
export function createUrls(config: DivelogConfig) {
  const base = trimSlash(config.basePath);
  const admin = trimSlash(config.adminPath);
  const api = trimSlash(config.apiBase);
  const media = trimSlash(config.mediaBase);
  const tiles = trimSlash(config.tilesBase);

  const log = (params?: QueryParams): string => withQuery(base || '/', params);

  return {
    base,
    log,
    filter: (params: QueryParams): string => log(params),
    dive: (n: number | string, hash?: string): string => withHash(`${base}/${n}`, hash),
    sites: (): string => `${base}/sites`,
    site: (slug: string): string => `${base}/sites/${slug}`,
    trips: (): string => `${base}/trips`,
    trip: (slug: string): string => `${base}/trips/${slug}`,
    people: (): string => `${base}/people`,
    person: (slug: string): string => `${base}/people/${slug}`,
    region: (id: string): string => `${base}/regions/${id}`,
    gear: (hash?: string): string => withHash(`${base}/gear`, hash),
    og: (kind: OgKind, id: number | string): string => `${base}/og/${kind}/${id}.png`,
    admin: {
      base: admin,
      root: (): string => admin || '/',
      /** The dive list; `params` filter it (`{ status: 'draft' }`). */
      dives: (params?: QueryParams): string => withQuery(`${admin}/dives`, params),
      dive: (n: number | string, hash?: string): string => withHash(`${admin}/dives/${n}`, hash),
      newDive: (params?: NewDiveParams): string =>
        withQuery(
          `${admin}/dives/new`,
          params ? Object.fromEntries(Object.entries(params).filter(([, v]) => v)) : undefined,
        ),
      sites: (): string => `${admin}/sites`,
      site: (id: string): string => `${admin}/sites/${id}`,
      siteMaps: (id: string): string => `${admin}/sites/${id}/maps`,
      newSite: (): string => `${admin}/sites/new`,
      regions: (): string => `${admin}/regions`,
      region: (id: string): string => `${admin}/regions/${id}`,
      newRegion: (): string => `${admin}/regions/new`,
      people: (): string => `${admin}/people`,
      person: (id: string): string => `${admin}/people/${id}`,
      newPerson: (): string => `${admin}/people/new`,
      trips: (): string => `${admin}/trips`,
      trip: (slug: string): string => `${admin}/trips/${slug}`,
      newTrip: (): string => `${admin}/trips/new`,
      gear: (): string => `${admin}/gear`,
      import: (): string => `${admin}/import`,
      login: (next?: string): string =>
        next ? `${admin}/login?next=${encodeURIComponent(next)}` : `${admin}/login`,
    },
    api: (path: string): string => `${api}${path}`,
    media: (key: string): string => `${media}/${key.replace(/^\/+/, '')}`,
    tiles: (path: string): string => `${tiles}/${path.replace(/^\/+/, '')}`,
    tilesBase: tiles,
  };
}

export type DivelogUrls = ReturnType<typeof createUrls>;

/** Escape a path for use inside a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
