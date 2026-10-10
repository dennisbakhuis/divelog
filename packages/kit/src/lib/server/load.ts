/**
 * The loaders behind the two catch-all mounts: match the rest path against
 * a route table and run that route's loader, or 404.
 */
import { error, type RequestEvent } from '@sveltejs/kit';
import { adminRoutes, type AdminPageData } from '../routes/admin.js';
import { publicRoutes, type PublicPageData } from '../routes/public.js';
import { matchRoute, type PageOwner } from '../routes/table.js';
import type { Divelog } from './divelog.js';

/** Page data for a path under the public mount (`/dive/[...path]`). */
export async function divePublicLoad(
  divelog: Divelog,
  path: string,
  event: RequestEvent,
): Promise<PublicPageData & PageOwner> {
  const match = matchRoute(publicRoutes, path);
  if (!match) error(404, 'Not found');
  const data = await match.route.load(divelog, match.params, event);
  return { ...data, owner: event.locals.owner };
}

/** Page data for a path under the editor mount (`/admin/[...path]`). */
export async function adminLoad(
  divelog: Divelog,
  path: string,
  event: RequestEvent,
): Promise<AdminPageData & PageOwner> {
  const match = matchRoute(adminRoutes, path);
  if (!match) error(404, 'Not found');
  const data = await match.route.load(divelog, match.params, event);
  return { ...data, owner: event.locals.owner };
}
