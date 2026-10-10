/**
 * Svelte context carrying the dive log's config and URL builder, so
 * components read links from one provider instead of hard-coding paths.
 */
import { getContext, hasContext, setContext } from 'svelte';
import { DEFAULT_CONFIG, createUrls, type DivelogConfig, type DivelogUrls } from './config.js';

export type Divelog = { config: DivelogConfig; urls: DivelogUrls };

const KEY = Symbol('divelog');

let fallback: Divelog | null = null;

/** The value a provider would publish for a config. */
export function divelogFor(config: DivelogConfig): Divelog {
  return { config, urls: createUrls(config) };
}

/** Publish the config to descendants; call during component initialisation. */
export function setDivelog(config: DivelogConfig): Divelog {
  return setContext(KEY, divelogFor(config));
}

/** The nearest provider's config and URLs, or the defaults when none is mounted. */
export function getDivelog(): Divelog {
  if (hasContext(KEY)) return getContext<Divelog>(KEY);
  fallback ??= divelogFor(DEFAULT_CONFIG);
  return fallback;
}

/** The context entry for `mount(..., { context })` in tests and islands. */
export function divelogContext(config: DivelogConfig): Map<symbol, Divelog> {
  return new Map([[KEY, divelogFor(config)]]);
}
