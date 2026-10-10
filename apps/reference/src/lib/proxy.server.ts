/**
 * Forwards the browser's same-origin `/api/v1/*` and `/media/*` requests to
 * the divelog server, so the app needs no reverse proxy in front of it. A
 * site behind Caddy or nginx can route those paths there instead.
 */
import type { Handle } from '@sveltejs/kit';
import type { Divelog } from '@divelog/kit/server';

const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host'];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function proxyBackend(divelog: Divelog): Handle {
  const prefixes = [divelog.urls.api(''), divelog.urls.media('').replace(/\/$/, '')];

  return async ({ event, resolve }) => {
    const { pathname, search, host, protocol } = event.url;
    if (!prefixes.some((prefix) => under(pathname, prefix))) return resolve(event);

    const headers = new Headers(event.request.headers);
    for (const name of [...HOP_BY_HOP, 'accept-encoding']) headers.delete(name);
    headers.set('x-forwarded-host', host);
    headers.set('x-forwarded-proto', protocol.replace(/:$/, ''));

    const { method } = event.request;
    const init: RequestInit & { duplex?: 'half' } = { method, headers, redirect: 'manual' };
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = event.request.body;
      init.duplex = 'half';
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${divelog.backendUrl()}${pathname}${search}`, init);
    } catch {
      return new Response('Backend unreachable', { status: 502 });
    }
    const out = new Headers(upstream.headers);
    for (const name of [...HOP_BY_HOP, 'content-encoding', 'content-length']) out.delete(name);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  };
}
