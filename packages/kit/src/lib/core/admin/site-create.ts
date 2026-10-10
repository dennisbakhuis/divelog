/**
 * The logic behind the new-site form, kept out of the component so it is unit
 * tested in Node: the draft and the body it posts, where the position came from,
 * the live id check and the nearby-sites query.
 */
import { adminApi, adminJson, AdminApiError } from './client.js';
import { SITE_ID, siteIdFor } from './slug.js';
import { todayLocal } from '$lib/core/dive/format.js';
import { DEFAULT_SITE_TYPE, waterDefault, type SiteWater } from '$lib/core/dive/site-types.js';
import type { NearbySitesOut, Site } from '$lib/core/dive/types.js';

/** How a position got onto the form: a tap on the map, a paste, or the device. */
export type GeoSource = 'pick' | 'paste' | 'geolocation';

/** A position with where it came from, as the location picker reports it. */
export interface PickedPoint {
  lat: number;
  lon: number;
  source: GeoSource;
}

const GEO_SOURCE_TEXT: Record<GeoSource, string> = {
  pick: 'map pick',
  paste: 'pasted coordinates',
  geolocation: 'device location',
};

/** The `geo_source` provenance line for a picked position: "map pick, 2026-10-10". */
export function geoSourceText(source: GeoSource, date: string = todayLocal()): string {
  return `${GEO_SOURCE_TEXT[source]}, ${date}`;
}

/** What the new-site form holds. */
export interface SiteDraft {
  name: string;
  country: string;
  region: string;
  type: string;
  water: SiteWater;
  lat: number | null;
  lon: number | null;
  geo_source: string;
  location_visibility: 'exact' | 'region_only';
  full_name: string;
  short_name: string;
  aliases: string;
  area: string;
  system: string;
  summary: string;
  halocline: boolean;
  halocline_m: number | null;
}

/** A blank draft; `seed` fills what the caller already knows (a name typed in a search). */
export function emptySiteDraft(seed: Partial<SiteDraft> = {}): SiteDraft {
  const type = seed.type ?? DEFAULT_SITE_TYPE;
  return {
    name: '',
    country: '',
    region: '',
    type,
    water: waterDefault(type) ?? 'salt',
    lat: null,
    lon: null,
    geo_source: '',
    location_visibility: 'exact',
    full_name: '',
    short_name: '',
    aliases: '',
    area: '',
    system: '',
    summary: '',
    halocline: false,
    halocline_m: null,
    ...seed,
  };
}

/** The id the draft will get, or '' while it has no name. */
export function draftSiteId(draft: Pick<SiteDraft, 'country' | 'name'>): string {
  return draft.name.trim() ? siteIdFor(draft.country, draft.name) : '';
}

const list = (value: string) =>
  value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

/** The `POST /admin/sites` body for a draft. */
export function siteCreateBody(draft: SiteDraft) {
  const placed = draft.lat !== null && draft.lon !== null;
  return {
    site_id: draftSiteId(draft),
    name: draft.name.trim(),
    full_name: draft.full_name.trim() || null,
    short_name: draft.short_name.trim() || null,
    aliases: list(draft.aliases),
    region: draft.region || null,
    country: draft.country.trim().toUpperCase() || null,
    area: draft.area.trim() || null,
    system: draft.system.trim() || null,
    type: draft.type,
    lat: placed ? draft.lat : null,
    lon: placed ? draft.lon : null,
    location_visibility: draft.location_visibility,
    water: draft.water,
    halocline: draft.halocline,
    halocline_m: draft.halocline ? draft.halocline_m : null,
    summary: draft.summary.trim() || null,
    geo_source: placed ? draft.geo_source || null : null,
  };
}

/** What the client can tell before posting: the fields it would reject, by body path. */
export function validateDraft(draft: SiteDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = 'Give the site a name.';
  if (!/^[A-Za-z]{3}$/.test(draft.country.trim()))
    errors.country = 'Pick the country, or place the pin and it is filled in.';
  if ((draft.lat === null) !== (draft.lon === null))
    errors.lat = 'Give both latitude and longitude, or neither.';
  if (draft.lat !== null && Math.abs(draft.lat) > 90) errors.lat = 'Latitude runs from -90 to 90.';
  if (draft.lon !== null && Math.abs(draft.lon) > 180)
    errors.lon = 'Longitude runs from -180 to 180.';
  if (draft.halocline && draft.halocline_m !== null && draft.halocline_m < 0)
    errors.halocline_m = 'A depth is positive.';
  return errors;
}

/** Whether a site id is free: `free` on a 404, `taken` when a site answers, null when unsure. */
export async function siteIdStatus(id: string): Promise<'free' | 'taken' | null> {
  if (!SITE_ID.test(id)) return null;
  try {
    await adminJson<Site>(adminApi('sites', id));
    return 'taken';
  } catch (err) {
    return err instanceof AdminApiError && err.status === 404 ? 'free' : null;
  }
}

/**
 * The nearby-sites query for a name and/or a point, or null when there is
 * nothing to ask about (no point and fewer than three letters of name).
 */
export function nearbyPath(
  { name, lat, lon }: { name: string; lat: number | null; lon: number | null },
  { radiusM = 300, limit = 8 }: { radiusM?: number; limit?: number } = {},
): string | null {
  const params = new URLSearchParams();
  const placed = lat !== null && lon !== null;
  if (placed) {
    params.set('lat', String(lat));
    params.set('lon', String(lon));
  }
  const trimmed = name.trim();
  if (trimmed.length >= 3) params.set('name', trimmed);
  else if (!placed) return null;
  params.set('radius_m', String(radiusM));
  params.set('limit', String(limit));
  return `${adminApi('sites', 'nearby')}?${params}`;
}

/** Possible duplicates of the site being created; empty lists on any failure. */
export async function fetchNearby(path: string): Promise<NearbySitesOut> {
  try {
    return await adminJson<NearbySitesOut>(path);
  } catch {
    return { log: [], commons: [] };
  }
}

/** "Same name", "Also known as …", or "120 m away": why a nearby site is listed. */
export function nearbyReason(hit: {
  matched_by: 'name' | 'alias' | 'distance';
  distance_m: number | null;
}): string {
  const away =
    hit.distance_m === null
      ? ''
      : hit.distance_m < 1000
        ? `${Math.round(hit.distance_m)} m away`
        : `${(hit.distance_m / 1000).toFixed(1)} km away`;
  if (hit.matched_by === 'name') return away ? `same name, ${away}` : 'same name';
  if (hit.matched_by === 'alias') return away ? `matches an alias, ${away}` : 'matches an alias';
  return away || 'nearby';
}
