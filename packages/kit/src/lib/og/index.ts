/** Open Graph cards for dive and site pages, rendered on request. */
import { error, type RequestEvent } from '@sveltejs/kit';
import type { Dive, DiveListItem, Site } from '$lib/core/dive/types.js';
import type { OgKind } from '$lib/core/dive/config.js';
import { ApiError } from '../server/api.js';
import type { Divelog } from '../server/divelog.js';
import { diveCardSvg, siteCardSvg } from './card.js';
import { OG_CACHE, renderPng } from './render.js';

async function fetchOrError<T>(divelog: Divelog, fetchFn: typeof fetch, path: string): Promise<T> {
  try {
    return await divelog.api<T>(fetchFn, divelog.urls.api(path));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, 'Not found');
    error(502, 'Backend unreachable');
  }
}

async function cardSvg(
  divelog: Divelog,
  kind: OgKind,
  id: string,
  fetchFn: typeof fetch,
): Promise<string> {
  if (kind === 'dive') {
    return diveCardSvg(
      await fetchOrError<Dive>(divelog, fetchFn, `/dive/dives/${id}`),
      divelog.config.siteName,
    );
  }
  const data = await fetchOrError<{ site: Site; dives: DiveListItem[] }>(
    divelog,
    fetchFn,
    `/dive/sites/${id}`,
  );
  return siteCardSvg(data.site, data.dives, divelog.config.siteName);
}

const ID_PATTERN: Record<OgKind, RegExp> = { dive: /^\d+$/, site: /^[a-z0-9-]+$/ };

function isKind(kind: string): kind is OgKind {
  return kind === 'dive' || kind === 'site';
}

/**
 * The PNG card for `/og/<kind>/<id>.png`. Deliberately unauthenticated: the
 * public endpoints 404 private and draft dives, so a shared link never leaks one.
 */
export async function diveOg(
  divelog: Divelog,
  kind: string,
  id: string,
  event: Pick<RequestEvent, 'fetch'>,
): Promise<Response> {
  if (!isKind(kind) || !ID_PATTERN[kind].test(id)) error(404, 'Not found');
  const png = await renderPng(await cardSvg(divelog, kind, id, event.fetch));
  return new Response(png as BodyInit, {
    headers: { 'content-type': 'image/png', 'cache-control': OG_CACHE },
  });
}

export { diveCardSvg, siteCardSvg, OG_HEIGHT, OG_WIDTH } from './card.js';
export { OG_CACHE, renderPng } from './render.js';
