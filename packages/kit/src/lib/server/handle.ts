/**
 * The dive log's server hook: resolves the signed-in owner from the session
 * cookie, gates the editor behind the login page, keeps the editor out of
 * search engines and the owner's pages out of shared caches.
 */
import { redirect, type Handle } from '@sveltejs/kit';
import type { Divelog } from './divelog';

export type HandleDivelogOptions = {
  /** Paths that skip owner resolution entirely, such as a healthcheck. */
  skip?: (pathname: string) => boolean;
};

async function resolveOwner(
  divelog: Divelog,
  cookie: string | null,
  fetchFn: typeof fetch,
): Promise<string | null> {
  if (!cookie) return null;
  try {
    const me = await divelog.api<{ email: string }>(fetchFn, divelog.urls.api('/auth/me'), {
      cookie,
    });
    return me.email;
  } catch {
    return null;
  }
}

export function handleDivelog(divelog: Divelog, options: HandleDivelogOptions = {}): Handle {
  const { urls } = divelog;
  const login = urls.admin.login();

  return async ({ event, resolve }) => {
    const { pathname } = event.url;
    if (options.skip?.(pathname)) return resolve(event);

    // Any page may show the owner's private view, so the cookie is resolved
    // everywhere; a request without one costs nothing.
    event.locals.owner = await resolveOwner(
      divelog,
      event.request.headers.get('cookie'),
      event.fetch,
    );
    const isAdmin = pathname.startsWith(urls.admin.base);
    if (isAdmin) {
      const isLogin = pathname.startsWith(login);
      if (!event.locals.owner && !isLogin) redirect(303, urls.admin.login(pathname));
      if (event.locals.owner && isLogin) redirect(303, urls.admin.root());
    }

    const response = await resolve(event);
    if ((response.headers.get('content-type') ?? '').includes('text/html')) {
      if (isAdmin) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      if (event.locals.owner) response.headers.set('Cache-Control', 'private, no-store');
    }
    return response;
  };
}
