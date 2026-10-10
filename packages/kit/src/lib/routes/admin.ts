/**
 * The editor's route table, relative to `config.adminPath`. Server only; the
 * login page is a separate, explicit route because it renders signed out.
 */
import { error, type RequestEvent } from '@sveltejs/kit';
import type {
  AdminDiveListItem,
  DiveAdmin,
  GearItem,
  GearSetup,
  ImportRecord,
  PersonPrivate,
  Region,
  Site,
  Trip,
  TripAdmin,
} from '$lib/core/dive/types';
import { diveTemplate } from '$lib/core/admin/dive-input';
import type { Divelog } from '../server/divelog';
import { defineRoute, type PageOwner } from './table';

/** One past import on the import page. */
export type ImportRow = ImportRecord;

/** Reference data every dive form needs: sites, trips, people, gear setups, regions. */
async function diveFormData(divelog: Divelog, event: RequestEvent) {
  const { urls, apiOrError } = divelog;
  const [sites, trips, people, setups, regions] = await Promise.all([
    apiOrError<Site[]>(event, urls.api('/admin/sites')),
    apiOrError<Trip[]>(event, urls.api('/admin/trips')),
    apiOrError<PersonPrivate[]>(event, urls.api('/admin/people')),
    apiOrError<GearSetup[]>(event, urls.api('/admin/gear/setups')),
    apiOrError<Region[]>(event, urls.api('/dive/regions')),
  ]);
  return { sites, trips, people, setups, regions };
}

function publicRegions(divelog: Divelog, event: RequestEvent): Promise<Region[]> {
  return divelog.apiOrError<Region[]>(event, divelog.urls.api('/dive/regions'));
}

export const divesRoute = defineRoute({
  page: 'dives',
  pattern: /^$/,
  load: async (divelog, _params, event) => ({
    dives: await divelog.apiOrError<AdminDiveListItem[]>(event, divelog.urls.api('/admin/dives')),
  }),
});

export const diveNewRoute = defineRoute({
  page: 'dive-new',
  pattern: /^dives\/new$/,
  load: async (divelog, _params, event) => {
    const [form, next, dives] = await Promise.all([
      diveFormData(divelog, event),
      divelog.apiOrError<{ number: number }>(event, divelog.urls.api('/admin/dives/next-number')),
      divelog.apiOrError<AdminDiveListItem[]>(event, divelog.urls.api('/admin/dives')),
    ]);
    const latest = dives.reduce<AdminDiveListItem | null>(
      (found, dive) => (!found || dive.number > found.number ? dive : found),
      null,
    );
    const last = latest
      ? await divelog.apiOrError<DiveAdmin>(
          event,
          divelog.urls.api(`/admin/dives/${latest.number}`),
        )
      : null;
    return {
      ...form,
      nextNumber: next.number,
      template: last
        ? {
            number: last.number,
            label: last.title || last.site?.name || 'Untitled',
            input: diveTemplate(last),
          }
        : null,
    };
  },
});

export const diveEditRoute = defineRoute({
  page: 'dive-edit',
  pattern: /^dives\/([^/]+)$/,
  load: async (divelog, [n], event) => {
    const number = Number(n);
    if (!Number.isInteger(number) || number < 1) error(404, 'Dive not found');
    const [form, dive] = await Promise.all([
      diveFormData(divelog, event),
      divelog.apiOrError<DiveAdmin>(event, divelog.urls.api(`/admin/dives/${number}`)),
    ]);
    return { ...form, dive };
  },
});

export const sitesRoute = defineRoute({
  page: 'sites',
  pattern: /^sites$/,
  load: async (divelog, _params, event) => {
    const [sites, regions] = await Promise.all([
      divelog.apiOrError<Site[]>(event, divelog.urls.api('/admin/sites')),
      publicRegions(divelog, event),
    ]);
    return { sites, regions };
  },
});

export const siteNewRoute = defineRoute({
  page: 'site-new',
  pattern: /^sites\/new$/,
  load: async (divelog, _params, event) => ({ regions: await publicRegions(divelog, event) }),
});

export const siteEditRoute = defineRoute({
  page: 'site-edit',
  pattern: /^sites\/([^/]+)$/,
  load: async (divelog, [id], event) => {
    const [site, regions] = await Promise.all([
      divelog.apiOrError<Site>(event, divelog.urls.api(`/admin/sites/${encodeURIComponent(id)}`)),
      publicRegions(divelog, event),
    ]);
    return { site, regions };
  },
});

export const siteMapsRoute = defineRoute({
  page: 'site-maps',
  pattern: /^sites\/([^/]+)\/maps$/,
  load: async (divelog, [id], event) => ({
    site: await divelog.apiOrError<Site>(
      event,
      divelog.urls.api(`/admin/sites/${encodeURIComponent(id)}`),
    ),
  }),
});

export const regionsRoute = defineRoute({
  page: 'regions',
  pattern: /^regions$/,
  load: async (divelog, _params, event) => ({
    regions: await divelog.apiOrError<Region[]>(event, divelog.urls.api('/admin/regions')),
  }),
});

export const regionNewRoute = defineRoute({
  page: 'region-new',
  pattern: /^regions\/new$/,
  load: async () => ({}),
});

export const regionEditRoute = defineRoute({
  page: 'region-edit',
  pattern: /^regions\/([^/]+)$/,
  load: async (divelog, [id], event) => {
    const regions = await divelog.apiOrError<Region[]>(event, divelog.urls.api('/admin/regions'));
    const region = regions.find((r) => r.id === id);
    if (!region) error(404, 'Not found');
    return { region };
  },
});

export const peopleRoute = defineRoute({
  page: 'people',
  pattern: /^people$/,
  load: async (divelog, _params, event) => ({
    people: await divelog.apiOrError<PersonPrivate[]>(event, divelog.urls.api('/admin/people')),
  }),
});

export const personNewRoute = defineRoute({
  page: 'person-new',
  pattern: /^people\/new$/,
  load: async () => ({}),
});

export const personEditRoute = defineRoute({
  page: 'person-edit',
  pattern: /^people\/([^/]+)$/,
  load: async (divelog, [id], event) => ({
    person: await divelog.apiOrError<PersonPrivate>(
      event,
      divelog.urls.api(`/admin/people/${encodeURIComponent(id)}`),
    ),
  }),
});

export const tripsRoute = defineRoute({
  page: 'trips',
  pattern: /^trips$/,
  load: async (divelog, _params, event) => ({
    trips: await divelog.apiOrError<TripAdmin[]>(event, divelog.urls.api('/admin/trips')),
  }),
});

export const tripNewRoute = defineRoute({
  page: 'trip-new',
  pattern: /^trips\/new$/,
  load: async () => ({}),
});

export const tripEditRoute = defineRoute({
  page: 'trip-edit',
  pattern: /^trips\/([^/]+)$/,
  load: async (divelog, [slug], event) => ({
    trip: await divelog.apiOrError<TripAdmin>(
      event,
      divelog.urls.api(`/admin/trips/${encodeURIComponent(slug)}`),
    ),
  }),
});

export const gearRoute = defineRoute({
  page: 'gear',
  pattern: /^gear$/,
  load: async (divelog, _params, event) => {
    const [items, setups] = await Promise.all([
      divelog.apiOrError<GearItem[]>(event, divelog.urls.api('/admin/gear/items')),
      divelog.apiOrError<GearSetup[]>(event, divelog.urls.api('/admin/gear/setups')),
    ]);
    return { items, setups };
  },
});

export const importRoute = defineRoute({
  page: 'import',
  pattern: /^import$/,
  load: async (divelog, _params, event) => ({
    imports: await divelog.apiOrError<ImportRow[]>(event, divelog.urls.api('/admin/imports')),
  }),
});

/** Ordered: the first matching pattern wins, so `new` precedes the id patterns. */
export const adminRoutes = [
  divesRoute,
  diveNewRoute,
  diveEditRoute,
  sitesRoute,
  siteNewRoute,
  siteMapsRoute,
  siteEditRoute,
  regionsRoute,
  regionNewRoute,
  regionEditRoute,
  peopleRoute,
  personNewRoute,
  personEditRoute,
  tripsRoute,
  tripNewRoute,
  tripEditRoute,
  gearRoute,
  importRoute,
] as const;

type DataOf<R> = R extends { load: (...args: never[]) => Promise<infer D> } ? D : never;

export type AdminPageData = DataOf<(typeof adminRoutes)[number]>;
export type AdminPage = AdminPageData['page'];
export type AdminDataFor<P extends AdminPage> = Extract<AdminPageData, { page: P }> & PageOwner;
