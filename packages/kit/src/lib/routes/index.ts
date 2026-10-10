/**
 * The dive log's page components, client safe. A consumer mounts the two
 * page switches, or ejects one page by adding a more specific SvelteKit
 * route that renders the component with its own data.
 */
export { default as DivePage } from './DivePage.svelte';
export { default as AdminPage } from './AdminPage.svelte';
export { default as AdminShell } from './admin/AdminShell.svelte';
export { default as LoginPage } from './admin/LoginPage.svelte';
export { default as SiteForm } from './admin/SiteForm.svelte';
export { default as RegionForm } from './admin/RegionForm.svelte';
export { default as LogPage } from './pages/LogPage.svelte';
export { default as DiveDetailPage } from './pages/DiveDetailPage.svelte';
export { default as SitesPage } from './pages/SitesPage.svelte';
export { default as SitePage } from './pages/SitePage.svelte';
export { default as RegionPage } from './pages/RegionPage.svelte';
export { default as TripsPage } from './pages/TripsPage.svelte';
export { default as TripPage } from './pages/TripPage.svelte';
export { default as PeoplePage } from './pages/PeoplePage.svelte';
export { default as PersonPage } from './pages/PersonPage.svelte';
export { default as GearPage } from './pages/GearPage.svelte';
export { default as AdminDivesPage } from './admin/AdminDivesPage.svelte';
export { default as AdminDiveNewPage } from './admin/AdminDiveNewPage.svelte';
export { default as AdminDiveEditPage } from './admin/AdminDiveEditPage.svelte';
export { default as AdminSitesPage } from './admin/AdminSitesPage.svelte';
export { default as AdminSiteNewPage } from './admin/AdminSiteNewPage.svelte';
export { default as AdminSiteEditPage } from './admin/AdminSiteEditPage.svelte';
export { default as AdminSiteMapsPage } from './admin/AdminSiteMapsPage.svelte';
export { default as AdminRegionsPage } from './admin/AdminRegionsPage.svelte';
export { default as AdminRegionNewPage } from './admin/AdminRegionNewPage.svelte';
export { default as AdminRegionEditPage } from './admin/AdminRegionEditPage.svelte';
export { default as AdminPeoplePage } from './admin/AdminPeoplePage.svelte';
export { default as AdminPersonNewPage } from './admin/AdminPersonNewPage.svelte';
export { default as AdminPersonEditPage } from './admin/AdminPersonEditPage.svelte';
export { default as AdminTripsPage } from './admin/AdminTripsPage.svelte';
export { default as AdminTripNewPage } from './admin/AdminTripNewPage.svelte';
export { default as AdminTripEditPage } from './admin/AdminTripEditPage.svelte';
export { default as AdminGearPage } from './admin/AdminGearPage.svelte';
export { default as AdminImportPage } from './admin/AdminImportPage.svelte';
export { withComponent, type PageComponent, type PageImports, type WithComponent } from './pages';
export { publicPageImports, withPublicPage, type PublicPageProps } from './public-pages';
export { adminPageImports, withAdminPage, type AdminPageProps } from './admin-pages';
export { pageSnapshot, type PageSnapshot } from './snapshot';
export type { PublicPage as PublicPageKey, PublicPageData, PublicDataFor } from './public';
export type { AdminPage as AdminPageKey, AdminPageData, AdminDataFor } from './admin';
export type { PageOwner } from './table';
