/** Server-side data for the home-page dive tile. */
import type { DiveSummary } from '$lib/core/dive/types';
import type { DiveTimeline } from '$lib/core/dive/sparkline';
import type { Divelog } from '../server/divelog';

export type DiveSummaryData = { summary: DiveSummary | null; timeline: DiveTimeline | null };

async function optional<T>(divelog: Divelog, fetchFn: typeof fetch, path: string) {
  try {
    return await divelog.api<T>(fetchFn, divelog.urls.api(path));
  } catch (err) {
    console.warn(`${path} unavailable`, err);
    return null;
  }
}

/**
 * The log summary and the per-year timeline for `DiveTile`. Each is null when
 * the backend cannot answer, so a home page never fails with the dive log.
 */
export async function loadDiveSummary(
  divelog: Divelog,
  fetchFn: typeof fetch,
): Promise<DiveSummaryData> {
  const [summary, timeline] = await Promise.all([
    optional<DiveSummary>(divelog, fetchFn, '/dive/summary'),
    optional<DiveTimeline>(divelog, fetchFn, '/dive/timeline'),
  ]);
  return { summary, timeline };
}
