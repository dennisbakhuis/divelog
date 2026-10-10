import { goto } from '$app/navigation';

/** Shallow history state the log's links hand to the page they open. */
export type FollowState = { from?: string };

/**
 * Click handler body for a plain link that should carry history state (e.g.
 * the filtered list it was opened from). Modified clicks, other buttons and
 * links with a target keep the browser's behaviour.
 */
export function followWithState(event: MouseEvent, href: string, state: FollowState): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.currentTarget;
  if (link instanceof HTMLAnchorElement && link.target && link.target !== '_self') return;
  event.preventDefault();
  gotoWithState(href, state);
}

/** Navigate to a log URL with shallow history state. */
export function gotoWithState(href: string, state: FollowState): void {
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- hrefs come from getDivelog().urls, already under the base path
  void goto(href, { state: state as App.PageState });
}

/** The `from` of the current history state, when a list left one. */
export function stateFrom(state: unknown): string | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const from = (state as FollowState).from;
  return typeof from === 'string' ? from : undefined;
}
