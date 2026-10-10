/** The public pages by key; see `pages.ts`. */
import type { PublicPage, PublicPageData } from './public.js';
import type { PageOwner } from './table.js';
import { withComponent, type PageImports, type WithComponent } from './pages.js';

export const publicPageImports = {
  log: () => import('./pages/LogPage.svelte'),
  dive: () => import('./pages/DiveDetailPage.svelte'),
  sites: () => import('./pages/SitesPage.svelte'),
  site: () => import('./pages/SitePage.svelte'),
  region: () => import('./pages/RegionPage.svelte'),
  trips: () => import('./pages/TripsPage.svelte'),
  trip: () => import('./pages/TripPage.svelte'),
  people: () => import('./pages/PeoplePage.svelte'),
  person: () => import('./pages/PersonPage.svelte'),
  gear: () => import('./pages/GearPage.svelte'),
} satisfies PageImports<PublicPage, PublicPageData>;

export type PublicPageProps = PublicPageData & PageOwner;

/** Universal load for the public catch-all: attach the page's component. */
export function withPublicPage(data: PublicPageProps): Promise<WithComponent<PublicPageProps>> {
  return withComponent(publicPageImports, data);
}
