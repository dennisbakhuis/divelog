/**
 * Where a detail page's back link goes. A detail page reached from a filtered
 * list should lead back to that list with its filter, not to the bare list.
 * Pure, so the rule is testable without a browser.
 */

/** The places a previous list URL can come from, in order of preference. */
export interface BackSources {
  /** `page.state.from`, set by the list when it navigated to the detail page. */
  stateFrom?: unknown;
  /** The URL of the page before this one in a client-side navigation. */
  navigatedFrom?: string | URL | null;
  /** `document.referrer`, for a full page load from the list. */
  referrer?: string | null;
  /** This page's origin; URLs on another origin are ignored. */
  origin: string;
}

function sameList(candidate: unknown, target: URL, origin: string): string | null {
  if (typeof candidate !== 'string' && !(candidate instanceof URL)) return null;
  if (candidate === '') return null;
  let url: URL;
  try {
    url = new URL(candidate, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  const strip = (path: string) => path.replace(/\/+$/, '') || '/';
  if (strip(url.pathname) !== strip(target.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * The back link for a detail page whose list lives at `href`: the list URL the
 * visitor came from when it is that same list (keeping its query), else `href`.
 */
export function backHref(href: string, sources: BackSources): string {
  let target: URL;
  try {
    target = new URL(href, sources.origin);
  } catch {
    return href;
  }
  for (const candidate of [sources.stateFrom, sources.navigatedFrom, sources.referrer]) {
    const found = sameList(candidate, target, sources.origin);
    if (found) return found;
  }
  return href;
}

/** The history state a list sets when it opens a detail page: `{ from: path + query }`. */
export function fromState(location: { pathname: string; search: string }): { from: string } {
  return { from: `${location.pathname}${location.search}` };
}
