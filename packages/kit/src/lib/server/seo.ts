/**
 * Page meta for the dive log: static meta of its index pages and the
 * generated Open Graph card for dive and site pages.
 */
import { escapeRegExp, type DivelogUrls } from '$lib/core/dive/config.js';

export type PageMeta = {
  title: string;
  description: string;
  /** Site-relative or absolute Open Graph image; defaults per route in `ogImageFor`. */
  image?: string;
};

/** Static meta for the dive log's index pages, keyed by their paths. */
export function diveMetaFor(diveUrls: DivelogUrls, name: string): Record<string, PageMeta> {
  return {
    [diveUrls.log()]: {
      title: `Dive log — ${name}`,
      description:
        'Every dive, searchable: statistics, a world map of dive sites, cave and scooter dives, gear.',
    },
    [diveUrls.gear()]: {
      title: `Dive gear — ${name}`,
      description: 'The setups and the gear behind the dive log, with the dives each item did.',
    },
    [diveUrls.sites()]: {
      title: `Dive sites — ${name}`,
      description: 'Every site in the dive log by country, with maps and cave stick maps.',
    },
    [diveUrls.trips()]: {
      title: `Dive trips — ${name}`,
      description:
        'Every dive trip abroad, with a map of the sites, the numbers and who came along.',
    },
  };
}

/**
 * The site-relative Open Graph card for a dive or site page path, or null
 * for any other path.
 */
export function diveOgImageFor(diveUrls: DivelogUrls, pathname: string): string | null {
  const base = escapeRegExp(diveUrls.base);
  const dive = new RegExp(`^${base}\\/(\\d+)\\/?$`).exec(pathname);
  if (dive) return diveUrls.og('dive', dive[1]);
  const site = new RegExp(`^${base}\\/sites\\/([a-z0-9-]+)\\/?$`).exec(pathname);
  if (site) return diveUrls.og('site', site[1]);
  return null;
}
