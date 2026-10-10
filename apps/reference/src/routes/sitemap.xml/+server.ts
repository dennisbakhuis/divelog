import type { RequestHandler } from './$types';
import { diveSitemapEntries } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';

export const GET: RequestHandler = async ({ fetch }) => {
  const { urls, config } = divelog;
  const indexes = ['/', urls.log(), urls.sites(), urls.trips(), urls.people(), urls.gear()].map(
    (path) => ({ path, priority: path === '/' ? '1.0' : '0.7' }),
  );
  const entries = [...indexes, ...(await diveSitemapEntries(divelog, fetch))]
    .map(
      ({ path, priority }) =>
        `  <url>\n    <loc>${config.siteUrl}${path === '/' ? '' : path}</loc>\n    <priority>${priority}</priority>\n  </url>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' },
  });
};
