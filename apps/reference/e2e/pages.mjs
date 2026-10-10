import { COMMONS_SLUG, SITE_SLUG } from './fixtures.mjs';

/** Every public page of the reference app, signed out. */
export const PUBLIC_PAGES = [
  '/',
  '/dive',
  '/dive/1',
  '/dive/2',
  '/dive/sites',
  `/dive/sites/${SITE_SLUG}`,
  `/dive/sites/${COMMONS_SLUG}`,
  '/dive/regions/red-sea',
  '/dive/trips',
  '/dive/trips/red-sea-2025-03',
  '/dive/people',
  '/dive/people/alex',
  '/dive/gear',
];

/** Editor pages the accessibility sweep opens signed in. */
export const ADMIN_PAGES = ['/admin', '/admin/dives/1', `/admin/sites/${SITE_SLUG}`];
