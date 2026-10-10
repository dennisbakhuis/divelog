/**
 * The sites index filter (search text, country, site type) and its URL form,
 * so a filtered view of the sites is a link like a filtered log.
 */

export interface SitesFilter {
  q: string;
  country: string;
  type: string;
}

export const EMPTY_SITES_FILTER: SitesFilter = { q: '', country: '', type: '' };

/** The filter a URL's query describes; unknown parameters are ignored. */
export function sitesFilterFromParams(params: URLSearchParams): SitesFilter {
  return {
    q: params.get('q') ?? '',
    country: params.get('country') ?? '',
    type: params.get('type') ?? '',
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
  return next;
}

export interface SiteLike {
  name: string;
  area?: string | null;
  site_type: string;
}

/** Whether a site of a region named `regionName` passes the type and text parts of `filter`. */
export function siteMatches(site: SiteLike, regionName: string, filter: SitesFilter): boolean {
  if (filter.type && site.site_type !== filter.type) return false;
  const q = filter.q.trim().toLowerCase();
  if (!q) return true;
  return `${site.name} ${site.area ?? ''} ${regionName}`.toLowerCase().includes(q);
}
