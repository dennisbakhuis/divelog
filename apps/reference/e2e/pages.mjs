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

/** Every editor page, signed in; the reference app has one of each kind. */
export const ADMIN_PAGES = [
  '/admin',
  '/admin/dives?status=draft',
  '/admin/dives/new',
  '/admin/dives/1',
  '/admin/sites',
  '/admin/sites/new',
  `/admin/sites/${SITE_SLUG}`,
  `/admin/sites/${SITE_SLUG}/maps`,
  `/admin/sites/${COMMONS_SLUG}`,
  '/admin/regions',
  '/admin/regions/new',
  '/admin/regions/red-sea',
  '/admin/people',
  '/admin/people/new',
  '/admin/people/alex',
  '/admin/trips',
  '/admin/trips/new',
  '/admin/trips/red-sea-2025-03',
  '/admin/gear',
  '/admin/import',
];

/** Pages a visitor who is not signed in can reach under /admin. */
export const SIGNED_OUT_ADMIN_PAGES = ['/admin/login'];
