/**
 * TEMPORARY: hand-written shape of `POST /admin/sites/{id}/maps/seed` until the server's
 * endpoint lands on main and `core/dive/api.d.ts` is regenerated; then these become aliases of
 * `components['schemas']['SiteMapSeedIn' | 'SiteMapSeedOut']` and this file goes.
 */
import type { SiteMap } from '../dive/sitemap.js';

/** Where a starter map comes from; `radius_m` defaults to one per site type on the server. */
export type SiteMapSeedIn = { source: 'osm'; radius_m?: number | null };

/** A starter map, not saved: `map` is the payload `POST /admin/sites/{id}/maps` takes. */
export type SiteMapSeedOut = {
  source: 'osm';
  radius_m: number;
  /** How many OpenStreetMap features the query returned. */
  elements: number;
  map: SiteMap;
};
