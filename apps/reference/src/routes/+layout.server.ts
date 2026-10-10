import type { LayoutServerLoad } from './$types';
import { diveMetaFor, diveOgImageFor, type PageMeta } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';

export const load: LayoutServerLoad = ({ locals, url }) => {
  const { config, urls } = divelog;
  const indexMeta: Record<string, PageMeta> = {
    '/': { title: config.siteName, description: `The dive log of ${config.ownerName}.` },
    ...diveMetaFor(urls, config.titleSuffix ?? config.ownerName),
  };
  const card = diveOgImageFor(urls, url.pathname);
  return {
    divelogConfig: config,
    owner: locals.owner,
    meta: indexMeta[url.pathname],
    ogImage: card ? `${config.siteUrl}${card}` : null,
  };
};
