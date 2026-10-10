/**
 * The dive log's configuration and the single place that knows its URLs.
 * Every page link, admin link, API base, media and tile path is built here,
 * so a consumer can mount the log under another path by changing the config.
 */
import type { TankGas } from './types';

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

/** The text that ends the log's page titles. */
export function titleSuffix(config: DivelogConfig): string {
  return config.titleSuffix ?? config.ownerName;
}

export type QueryParams =
  string | URLSearchParams | Record<string, string | number | null | undefined>;

export type OgKind = 'dive' | 'site';

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
      dives: (): string => `${admin}/dives`,
      dive: (n: number | string, hash?: string): string => withHash(`${admin}/dives/${n}`, hash),
      newDive: (): string => `${admin}/dives/new`,
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
