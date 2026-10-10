/**
 * Screen-reader announcements through two always-mounted live regions (one
 * polite, one assertive) that `LiveRegion` renders. Plain TypeScript with a
 * tiny subscriber list, so it loads in Node and in tests without Svelte.
 *
 * Several regions may be mounted at once (a host's `Toast` and every
 * `DivelogProvider`); only the first one still mounted speaks, so nothing is
 * announced twice.
 */

export type Politeness = 'polite' | 'assertive';

export interface Announcement {
  text: string;
  politeness: Politeness;
  /** Increments with every announcement, also for a repeated text. */
  seq: number;
}

type Listener = (announcement: Announcement) => void;

interface Region {
  id: number;
  listener: Listener;
}

let regions: Region[] = [];
let nextRegion = 1;
let seq = 0;
const last: Record<Politeness, string> = { polite: '', assertive: '' };

/**
 * Register a live region. Returns the unregister function; the earliest
 * registered region that is still mounted receives every announcement.
 */
export function registerLiveRegion(listener: Listener): () => void {
  const region = { id: nextRegion++, listener };
  regions.push(region);
  return () => {
    regions = regions.filter((r) => r.id !== region.id);
  };
}

/** Whether a live region is mounted to speak an announcement. */
export function hasLiveRegion(): boolean {
  return regions.length > 0;
}

/**
 * Announce a message to assistive technology. A repeated identical message
 * gets a trailing no-break space so the region's content changes and screen
 * readers speak it again.
 */
export function announce(text: string, { assertive = false }: { assertive?: boolean } = {}): void {
  const message = text.trim();
  if (!message) return;
  const politeness: Politeness = assertive ? 'assertive' : 'polite';
  const spoken = last[politeness] === message ? `${message}\u00a0` : message;
  last[politeness] = spoken === message ? message : '';
  seq += 1;
  regions[0]?.listener({ text: spoken, politeness, seq });
}

/** Forget the last messages and every region; for tests. */
export function resetAnnouncer(): void {
  regions = [];
  last.polite = '';
  last.assertive = '';
}
