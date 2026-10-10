/**
 * Snapshots through a page switch: the catch-all route exports one snapshot
 * and hands it to whichever page component is mounted. The page key travels
 * with the value so a view is only restored into the page that captured it.
 */
import type { Snapshot } from '@sveltejs/kit';

export type PageSnapshot = { page: string; value: unknown } | null;

type Snapshotting = { snapshot?: Snapshot } | undefined;

export function pageSnapshot(
  page: () => string,
  current: () => Snapshotting,
): Snapshot<PageSnapshot> {
  return {
    capture: () => {
      const inner = current()?.snapshot;
      return inner ? { page: page(), value: inner.capture() } : null;
    },
    restore: (saved) => {
      if (saved && saved.page === page()) current()?.snapshot?.restore(saved.value);
    },
  };
}
