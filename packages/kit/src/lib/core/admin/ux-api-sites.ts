/**
 * TEMPORARY: hand-written shapes of the site endpoints the UX rework adds on the
 * server (nearby sites, countries, licences, site field classes, attachment credit,
 * the site save note). They mirror the server's models; once `api.d.ts` is
 * regenerated from a server that has them, these become aliases onto it and
 * this file goes away.
 */
import type { SiteOrigin } from '$lib/core/dive/types.js';

/** How a nearby site was found: same name, an alias, or within the radius. */
export type NearbyMatch = 'name' | 'alias' | 'distance';

/** `GET /admin/sites/nearby`: a site of this log that may be the one being created. */
export interface NearbyLogSite {
  site_id: string;
  name: string;
  country: string | null;
  type: string;
  lat: number | null;
  lon: number | null;
  matched_by: NearbyMatch;
  distance_m: number | null;
  origin: SiteOrigin;
  dives: number;
}

/** `GET /admin/sites/nearby`: a commons site the log does not use yet. */
export interface NearbyCommonsSite {
  site_id: string;
  name: string;
  country: string | null;
  type: string;
  area: string | null;
  lat: number | null;
  lon: number | null;
  matched_by: NearbyMatch;
  distance_m: number | null;
}

/** `GET /admin/sites/nearby?lat=&lon=&name=&radius_m=&limit=` */
export interface NearbySitesOut {
  log: NearbyLogSite[];
  commons: NearbyCommonsSite[];
}

/** `GET /meta/countries`: the countries the server knows, by name. */
export interface CountryOut {
  iso3: string;
  iso2: string;
  name: string;
}

/** `GET /meta/licences`: a licence a photo by someone else may carry. */
export interface LicenceOut {
  id: string;
  name: string;
  url: string;
}

/** `GET /admin/meta/site-fields`: how a commons site's fields behave under an overlay. */
export interface SiteFieldsOut {
  objective: string[];
  personal: string[];
  additive: string[];
  preference: string[];
}

/** The credit fields an attachment gains (`AttachmentOut` and the PATCH body). */
export interface AttachmentCredit {
  licence?: string | null;
  author?: string | null;
  source?: string | null;
}

/** The optional "what changed" note a site save carries (`SiteIn.note`). */
export interface SiteSaveNote {
  note?: string | null;
}
