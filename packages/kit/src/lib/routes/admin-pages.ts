/** The editor pages by key; see `pages.ts`. */
import type { AdminPage, AdminPageData } from './admin.js';
import type { PageOwner } from './table.js';
import { withComponent, type PageImports, type WithComponent } from './pages.js';

export const adminPageImports = {
  dives: () => import('./admin/AdminDivesPage.svelte'),
  'dive-new': () => import('./admin/AdminDiveNewPage.svelte'),
  'dive-edit': () => import('./admin/AdminDiveEditPage.svelte'),
  sites: () => import('./admin/AdminSitesPage.svelte'),
  'site-new': () => import('./admin/AdminSiteNewPage.svelte'),
  'site-edit': () => import('./admin/AdminSiteEditPage.svelte'),
  'site-maps': () => import('./admin/AdminSiteEditPage.svelte'),
  regions: () => import('./admin/AdminRegionsPage.svelte'),
  'region-new': () => import('./admin/AdminRegionNewPage.svelte'),
  'region-edit': () => import('./admin/AdminRegionEditPage.svelte'),
  people: () => import('./admin/AdminPeoplePage.svelte'),
  'person-new': () => import('./admin/AdminPersonNewPage.svelte'),
  'person-edit': () => import('./admin/AdminPersonEditPage.svelte'),
  trips: () => import('./admin/AdminTripsPage.svelte'),
  'trip-new': () => import('./admin/AdminTripNewPage.svelte'),
  'trip-edit': () => import('./admin/AdminTripEditPage.svelte'),
  gear: () => import('./admin/AdminGearPage.svelte'),
  import: () => import('./admin/AdminImportPage.svelte'),
} satisfies PageImports<AdminPage, AdminPageData>;

export type AdminPageProps = AdminPageData & PageOwner;

/** Universal load for the editor catch-all: attach the page's component. */
export function withAdminPage(data: AdminPageProps): Promise<WithComponent<AdminPageProps>> {
  return withComponent(adminPageImports, data);
}
