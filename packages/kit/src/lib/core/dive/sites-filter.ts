/**
 * The sites index filter (search text, country, site type, only the dived
 * sites) and its URL form, so a filtered view of the sites is a link like a
 * filtered log.
 */

export interface SitesFilter {
  q: string;
  country: string;
  type: string;
  /** Only the sites the owner dived; matters when the server lists commons sites too. */
  mine: boolean;
}

export const EMPTY_SITES_FILTER: SitesFilter = { q: '', country: '', type: '', mine: false };

/** The label of a site the owner never dived, shown as text next to it and on its marker. */
export const NOT_DIVED = 'not dived';

/** Whether a site has no dives the viewer can see: an atlas site from the commons. */
export function notDived(site: { dives: number }): boolean {
  return site.dives === 0;
}

/** The filter a URL's query describes; unknown parameters are ignored. */
export function sitesFilterFromParams(params: URLSearchParams): SitesFilter {
  return {
    q: params.get('q') ?? '',
    country: params.get('country') ?? '',
    type: params.get('type') ?? '',
    mine: params.get('mine') === '1',
  };
}

/**
 * Write `filter` into a copy of `params`: set values are written, empty ones
 * removed, any other parameter is kept.
 */
export function sitesFilterToParams(
  filter: SitesFilter,
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['q', 'country', 'type'] as const) {
    const value = filter[key].trim();
    if (value) next.set(key, key === 'q' ? filter[key] : value);
    else next.delete(key);
  }
  if (filter.mine) next.set('mine', '1');
  else next.delete('mine');
  return next;
}

export interface SiteLike {
  name: string;
  area?: string | null;
  site_type: string;
  /** Dives the viewer can see; a site without the count is taken as dived. */
  dives?: number;
}

/** Whether a site of a region named `regionName` passes the type, text and dived parts of `filter`. */
export function siteMatches(site: SiteLike, regionName: string, filter: SitesFilter): boolean {
  if (filter.type && site.site_type !== filter.type) return false;
  if (filter.mine && site.dives === 0) return false;
  const q = filter.q.trim().toLowerCase();
  if (!q) return true;
  return `${site.name} ${site.area ?? ''} ${regionName}`.toLowerCase().includes(q);
}
