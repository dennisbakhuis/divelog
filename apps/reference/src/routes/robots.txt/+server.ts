import type { RequestHandler } from './$types';
import { divelog } from '$lib/divelog.server';

export const GET: RequestHandler = () => {
  const { config, urls } = divelog;
  const body = `User-agent: *\nAllow: /\nDisallow: ${urls.admin.root()}\nDisallow: ${urls.api('/')}\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
