/**
 * Site and map versioning as the pages show it: the revision line, the fork provenance and the
 * pin of an overlay or fork against the current commons revision.
 */
import { formatDate } from './format';
import type { ChangeEntry, PinState } from './types';

/** "Revision 3 · changed 10 Oct 2026", or null while nothing has been changed. */
export function revisionLine(record: {
  revision: number;
  changelog: ChangeEntry[];
}): string | null {
  const latest = record.changelog[0];
  if (!latest) return null;
  return `Revision ${record.revision} · changed ${formatDate(latest.date)}`;
}

/** The commons revision in `commons@<revision>`; null for none or an old commit sha. */
export function forkedFromRevision(forkedFrom: string | null | undefined): number | null {
  const ref = forkedFrom?.split('@')[1] ?? '';
  return /^\d+$/.test(ref) ? Number(ref) : null;
}

/** What the editor says about a pin: stale, pinned, or nothing written yet. */
export function pinMessage(pin: PinState): string {
  if (pin.stale) {
    const written =
      pin.pinned_revision === null
        ? 'Written before commons revisions'
        : `Written against commons revision ${pin.pinned_revision}`;
    return `${written}, commons is at ${pin.current_revision}`;
  }
  if (pin.pinned_revision === null) return `Commons revision ${pin.current_revision}`;
  return `Pinned to commons revision ${pin.pinned_revision}`;
}
