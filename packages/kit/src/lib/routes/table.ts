/**
 * Route tables: an ordered list of path patterns, each with the loader that
 * builds its page data. The first matching pattern wins; capture groups
 * become the loader's params. Paths are relative to the mount point, with no
 * leading or trailing slash (`''` is the mount point itself).
 */
import { redirect, type RequestEvent } from '@sveltejs/kit';
import type { Divelog } from '../server/divelog';
import type { PageMeta } from '../server/seo';

export type Loader<D> = (divelog: Divelog, params: string[], event: RequestEvent) => Promise<D>;

export type Route<D> = {
  pattern: RegExp;
  load: Loader<D>;
};

/** Every page's data carries the signed-in owner, or null. */
export type PageOwner = { owner: string | null };

type WithPage<P extends string, D> = D & { page: P; meta?: PageMeta };

/**
 * A table entry for a page: the loader's data gets the `page` discriminant
 * the page switch renders by, and the meta built from it, when given.
 */
export function defineRoute<P extends string, D extends object>(entry: {
  page: P;
  pattern: RegExp;
  load: Loader<D>;
  meta?: (data: D, divelog: Divelog) => PageMeta;
}): Route<WithPage<P, D>> {
  const { page, pattern, load, meta } = entry;
  return {
    pattern,
    load: async (divelog, params, event) => {
      const data = await load(divelog, params, event);
      return meta ? { ...data, page, meta: meta(data, divelog) } : { ...data, page };
    },
  };
}

/** A table entry that redirects; `to` may load data to find the target. */
export function defineRedirect(entry: {
  pattern: RegExp;
  status: 301 | 302 | 303 | 307 | 308;
  to: (divelog: Divelog, params: string[], event: RequestEvent) => string | Promise<string>;
}): Route<never> {
  const { pattern, status, to } = entry;
  return {
    pattern,
    load: async (divelog, params, event) => redirect(status, await to(divelog, params, event)),
  };
}

/** The first route whose pattern matches the whole path, with its captures. */
export function matchRoute<R extends { pattern: RegExp }>(
  table: readonly R[],
  path: string,
): { route: R; params: string[] } | null {
  const normalised = path.replace(/^\/+|\/+$/g, '');
  for (const route of table) {
    const match = route.pattern.exec(normalised);
    if (match && match[0] === normalised) return { route, params: match.slice(1) };
  }
  return null;
}
