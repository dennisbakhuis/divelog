/**
 * The public dive log's route table, relative to `config.basePath`. Server
 * only: the loaders project the world map, so page components import just
 * the data types from here.
 */
import { error } from '@sveltejs/kit';
import type {
  Dive,
  DiveEnvelope,
  DiveStats,
  GearPage,
  MapSite,
  Person,
  PersonDetail,
  Region,
  Site,
  SiteDetail,
  TripDetail,
  TripSummary,
} from '$lib/core/dive/types';
import { formatDateRange } from '$lib/core/dive/format';
import { titleSuffix } from '$lib/core/dive/config';
import {
  landPath,
  MAP_HEIGHT,
  MAP_WIDTH,
  makeRegionMap,
  project,
  spherePath,
} from '$lib/core/map/world';
import { defineRedirect, defineRoute, type PageOwner } from './table';

export type Dot = MapSite & { point: { x: number; y: number } };

export type SiteRow = {
  slug: string;
  name: string;
  site_type: string;
  area: string | null;
  region: string | null;
  region_name: string | null;
  country_code: string;
  country_name: string;
  dives: number;
  last_dive: string | null;
  max_depth_m: number | null;
  drawn: number;
  summary: string | null;
};

export type RegionGroup = { id: string | null; name: string; sites: SiteRow[] };
export type CountryGroup = { code: string; name: string; dives: number; regions: RegionGroup[] };

function worldDots(sites: MapSite[]): Dot[] {
  return sites
    .map((site) => ({ ...site, point: project(site.lon, site.lat) }))
    .filter((s): s is Dot => s.point !== null);
}

async function regionMap(id: string, name: string, sites: MapSite[]) {
  const panel = await makeRegionMap(id, name, sites);
  return panel
    ? {
        landPath: panel.landPath,
        spherePath: `M0 0H${panel.width}V${panel.height}H0Z`,
        width: panel.width,
        height: panel.height,
        dots: sites
          .map((site) => ({ ...site, point: panel.project(site.lon, site.lat) }))
          .filter((s): s is Dot => s.point !== null),
      }
    : null;
}

/** Group the site list by country and region, busiest first. */
export function groupSites(sites: Site[], regions: Region[]): CountryGroup[] {
  const regionName = new Map(regions.map((r) => [r.id, r.name]));
  const rows: SiteRow[] = sites.map((site) => ({
    slug: site.slug,
    name: site.name,
    site_type: site.site_type,
    area: site.area,
    region: site.region,
    region_name: site.region ? (regionName.get(site.region) ?? site.region) : null,
    country_code: site.country_code,
    country_name: site.country_name,
    dives: site.dives,
    last_dive: site.last_dive,
    max_depth_m: site.max_depth_m,
    drawn: site.maps.filter((m) => m.collection === 'drawn' || m.collection === 'seed').length,
    summary: site.summary,
  }));

  const countries: CountryGroup[] = [];
  for (const row of rows) {
    let country = countries.find((c) => c.code === row.country_code);
    if (!country) {
      country = { code: row.country_code, name: row.country_name, dives: 0, regions: [] };
      countries.push(country);
    }
    country.dives += row.dives;
    let region = country.regions.find((r) => r.id === row.region);
    if (!region) {
      region = { id: row.region, name: row.region_name ?? 'Elsewhere', sites: [] };
      country.regions.push(region);
    }
    region.sites.push(row);
  }
  for (const country of countries) {
    country.regions.sort(
      (a, b) => b.sites.reduce((s, r) => s + r.dives, 0) - a.sites.reduce((s, r) => s + r.dives, 0),
    );
    for (const region of country.regions) {
      region.sites.sort((a, b) => b.dives - a.dives || a.name.localeCompare(b.name));
    }
  }
  countries.sort((a, b) => b.dives - a.dives);
  return countries;
}

export const logRoute = defineRoute({
  page: 'log',
  pattern: /^$/,
  load: async (divelog, _params, event) => {
    const [stats, envelope] = await Promise.all([
      divelog.apiOrError<DiveStats>(event, divelog.urls.api('/dive/stats')),
      divelog.apiOrError<DiveEnvelope>(event, divelog.urls.api('/dive/dives')),
    ]);
    return {
      stats,
      envelope,
      map: {
        landPath,
        spherePath,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        dots: worldDots(stats.map_sites),
      },
      editHref: divelog.urls.admin.root(),
    };
  },
});

export const diveRoute = defineRoute({
  page: 'dive',
  pattern: /^(\d+)$/,
  load: async (divelog, [n], event) => {
    const number = Number(n);
    if (!Number.isInteger(number) || number < 1) error(404, 'Dive not found');
    const dive = await divelog.apiOrError<Dive>(event, divelog.urls.api(`/dive/dives/${number}`));
    return { dive, editHref: divelog.urls.admin.dive(dive.number) };
  },
  meta: ({ dive }, divelog) => ({
    title: `Dive #${dive.number}${dive.title ? ` — ${dive.title}` : ''} — ${titleSuffix(divelog.config)}`,
    description: `${dive.max_depth_m} m for ${Math.round(dive.duration_min)} minutes${dive.site ? ` at ${dive.site.name}` : ''} on ${dive.date}.`,
  }),
});

export const sitesRoute = defineRoute({
  page: 'sites',
  pattern: /^sites$/,
  load: async (divelog, _params, event) => {
    const [sites, regions] = await Promise.all([
      divelog.apiOrError<Site[]>(event, divelog.urls.api('/dive/sites')),
      divelog.apiOrError<Region[]>(event, divelog.urls.api('/dive/regions')),
    ]);
    const types = [...new Set(sites.map((s) => s.site_type))].sort();
    return {
      countries: groupSites(sites, regions),
      types,
      total: sites.length,
      editHref: divelog.urls.admin.sites(),
    };
  },
});

export const siteRoute = defineRoute({
  page: 'site',
  pattern: /^sites\/([^/]+)$/,
  load: async (divelog, [slug], event) => {
    const data = await divelog.apiOrError<SiteDetail>(
      event,
      divelog.urls.api(`/dive/sites/${slug}`),
    );
    const point =
      data.site.lat !== null && data.site.lon !== null
        ? project(data.site.lon, data.site.lat)
        : null;
    return {
      ...data,
      map: { landPath, spherePath, width: MAP_WIDTH, height: MAP_HEIGHT, point },
      editHref: divelog.urls.admin.site(encodeURIComponent(data.site.id)),
    };
  },
  meta: ({ site, dives }, divelog) => ({
    title: `${site.name} — dive site — ${titleSuffix(divelog.config)}`,
    description: site.summary ?? `${dives.length} dives at ${site.name}, ${site.country_name}.`,
    image: divelog.urls.og('site', site.slug),
  }),
});

export const siteMapRedirect = defineRedirect({
  pattern: /^sites\/([^/]+)\/map$/,
  status: 302,
  to: async (divelog, [slug], event) => {
    const { site } = await divelog.apiOrError<{ site: Site }>(
      event,
      divelog.urls.api(`/dive/sites/${slug}`),
    );
    return divelog.urls.admin.siteMaps(encodeURIComponent(site.id));
  },
});

export const diveOgRedirect = defineRedirect({
  pattern: /^(\d+)\/og\.png$/,
  status: 301,
  to: (divelog, [n]) => divelog.urls.og('dive', n),
});

export const siteOgRedirect = defineRedirect({
  pattern: /^sites\/([a-z0-9-]+)\/og\.png$/,
  status: 301,
  to: (divelog, [slug]) => divelog.urls.og('site', slug),
});

export const regionRoute = defineRoute({
  page: 'region',
  pattern: /^regions\/([^/]+)$/,
  load: async (divelog, [id], event) => {
    const region = await divelog.apiOrError<Region>(event, divelog.urls.api(`/dive/regions/${id}`));
    return {
      region,
      map: await regionMap(region.id, region.name, region.map_sites),
      editHref: divelog.urls.admin.region(encodeURIComponent(region.id)),
    };
  },
  meta: ({ region }, divelog) => ({
    title: `${region.name} — dive region — ${titleSuffix(divelog.config)}`,
    description: `${region.sites.length} dive sites and ${region.dives} dives in ${region.name}.`,
  }),
});

export const tripsRoute = defineRoute({
  page: 'trips',
  pattern: /^trips$/,
  load: async (divelog, _params, event) => ({
    trips: await divelog.apiOrError<TripSummary[]>(event, divelog.urls.api('/dive/trips')),
    editHref: divelog.urls.admin.trips(),
  }),
});

export const tripRoute = defineRoute({
  page: 'trip',
  pattern: /^trips\/([^/]+)$/,
  load: async (divelog, [slug], event) => {
    const data = await divelog.apiOrError<TripDetail>(
      event,
      divelog.urls.api(`/dive/trips/${slug}`),
    );
    const { trip } = data;
    return {
      ...data,
      map: await regionMap(trip.slug, trip.name, data.map_sites),
      editHref: divelog.urls.admin.trip(trip.slug),
    };
  },
  meta: ({ trip }, divelog) => ({
    title: `${trip.name} — dive trip — ${titleSuffix(divelog.config)}`,
    description: `${trip.stats.dives} dives at ${trip.stats.sites} sites, ${formatDateRange(trip.start_date, trip.end_date)}.`,
  }),
});

export const peopleRoute = defineRoute({
  page: 'people',
  pattern: /^people$/,
  load: async (divelog, _params, event) => ({
    people: await divelog.apiOrError<Person[]>(event, divelog.urls.api('/dive/people')),
    editHref: divelog.urls.admin.people(),
  }),
  meta: (_data, divelog) => ({
    title: `Dive buddies — ${titleSuffix(divelog.config)}`,
    description: 'The people I have shared the water with, and how often.',
  }),
});

export const personRoute = defineRoute({
  page: 'person',
  pattern: /^people\/([^/]+)$/,
  load: async (divelog, [slug], event) => {
    const data = await divelog.apiOrError<PersonDetail>(
      event,
      divelog.urls.api(`/dive/people/${slug}`),
    );
    return {
      ...data,
      map: {
        landPath,
        spherePath,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        dots: worldDots(data.map_sites),
      },
      editHref: data.person.private
        ? divelog.urls.admin.person(encodeURIComponent(data.person.private.id))
        : divelog.urls.admin.people(),
    };
  },
  meta: ({ person, dives }, divelog) => ({
    title: `Diving with ${person.name} — ${titleSuffix(divelog.config)}`,
    description: `${dives.length} dives together, ${person.stats.countries} countries.`,
  }),
});

export const gearRoute = defineRoute({
  page: 'gear',
  pattern: /^gear$/,
  load: async (divelog, _params, event) => ({
    gear: await divelog.apiOrError<GearPage>(event, divelog.urls.api('/dive/gear')),
    editHref: divelog.urls.admin.gear(),
  }),
});

/** Ordered: the first matching pattern wins. */
export const publicRoutes = [
  logRoute,
  diveRoute,
  diveOgRedirect,
  sitesRoute,
  siteRoute,
  siteMapRedirect,
  siteOgRedirect,
  regionRoute,
  tripsRoute,
  tripRoute,
  peopleRoute,
  personRoute,
  gearRoute,
] as const;

type DataOf<R> = R extends { load: (...args: never[]) => Promise<infer D> } ? D : never;

export type PublicPageData = DataOf<(typeof publicRoutes)[number]>;
export type PublicPage = PublicPageData['page'];
export type PublicDataFor<P extends PublicPage> = Extract<PublicPageData, { page: P }> & PageOwner;
