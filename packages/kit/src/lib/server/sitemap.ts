/** The dive log's sitemap entries: every public trip and dive page. */
import type { DiveEnvelope, TripSummary } from '$lib/core/dive/types';
import type { Divelog } from './divelog';

export type SitemapEntry = { path: string; priority: string };

const PRIORITY = '0.5';

/**
 * Trip pages then dive pages, in the backend's order. Empty when the
 * backend is down, so the dive log never takes a sitemap down with it.
 */
export async function diveSitemapEntries(
  divelog: Divelog,
  fetchFn: typeof fetch,
): Promise<SitemapEntry[]> {
  const { api, urls } = divelog;
  try {
    const [envelope, trips] = await Promise.all([
      api<DiveEnvelope>(fetchFn, urls.api('/dive/dives')),
      api<TripSummary[]>(fetchFn, urls.api('/dive/trips')),
    ]);
    return [
      ...trips.map((t) => urls.trip(t.slug)),
      ...envelope.dives.map((d) => urls.dive(d.number)),
    ].map((path) => ({ path, priority: PRIORITY }));
  } catch {
    return [];
  }
}
