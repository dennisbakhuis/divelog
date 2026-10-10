/**
 * The editor's route table, relative to `config.adminPath`. Server only; the
 * login page is a separate, explicit route because it renders signed out.
 */
import { error, type RequestEvent } from '@sveltejs/kit';
import type {
  DiveAdmin,
  GearItem,
  ImportRecord,
  PersonPrivate,
  Region,
  Site,
  Trip,
  TripAdmin,
} from '$lib/core/dive/types.js';
import { shiftDate } from '$lib/core/admin/dive-input.js';
import {
  DEFAULT_LIST_QUERY,
  pagePath,
  parseListQuery,
} from '$lib/core/admin/dive-list.js';
import type { AdminDivePage, DiveTemplateOut, GearSetupTemplate } from '$lib/core/admin/ux-api.js';
import type { NewDiveParams } from '$lib/core/dive/config.js';
import type { Divelog } from '../server/divelog.js';
import { defineRoute, type PageOwner } from './table.js';

/** One past import on the import page. */
export type ImportRow = ImportRecord;

/** Reference data every dive form needs: sites, trips, people, gear setups, regions. */
async function diveFormData(divelog: Divelog, event: RequestEvent) {
  const { urls, apiOrError } = divelog;
  const [sites, trips, people, setups, regions] = await Promise.all([
    apiOrError<Site[]>(event, urls.api('/admin/sites')),
    apiOrError<Trip[]>(event, urls.api('/admin/trips')),
    apiOrError<PersonPrivate[]>(event, urls.api('/admin/people')),
    apiOrError<GearSetupTemplate[]>(event, urls.api('/admin/gear/setups')),
    apiOrError<Region[]>(event, urls.api('/dive/regions')),
  ]);
  return { sites, trips, people, setups, regions };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `GET /admin/dives/template` for a site and a day (today on the server when not given). */
function diveTemplateFor(
  divelog: Divelog,
  event: RequestEvent,
  site: string | null,
  date: string | null,
): Promise<DiveTemplateOut> {
  const params = new URLSearchParams();
  if (site) params.set('site', site);
  if (date) params.set('date', date);
  const query = params.toString();
  return divelog.apiOrError<DiveTemplateOut>(
    event,
    divelog.urls.api(`/admin/dives/template${query ? `?${query}` : ''}`),
  );
}

/** The new-dive prefill from `?site=&trip=&person=&date=`; a malformed date is dropped. */
export function newDivePrefill(params: URLSearchParams): Required<NewDiveParams> {
  const value = (key: string) => params.get(key)?.trim() || null;
  const date = value('date');
  return {
    site: value('site'),
    trip: value('trip'),
    person: value('person'),
    date: date && ISO_DATE.test(date) ? date : null,
  };
}

/**
 * The template of an existing dive: the dives before it, never the dive itself. When the
 * dive is the latest on its day, the previous one is looked up from the day before.
 */
async function templateOfDive(
  divelog: Divelog,
  event: RequestEvent,
  dive: DiveAdmin,
): Promise<DiveTemplateOut> {
  const template = await diveTemplateFor(divelog, event, dive.site_id, dive.date);
  const atSite = template.at_site?.number === dive.number ? null : (template.at_site ?? null);
  if (template.previous?.number !== dive.number) return { ...template, at_site: atSite };
  const before = await diveTemplateFor(divelog, event, null, shiftDate(dive.date, -1));
  return { ...template, previous: before.previous ?? null, at_site: atSite };
}

/** Every draft's number in date order, for the editor's previous/next draft links. */
async function draftNumbers(divelog: Divelog, event: RequestEvent): Promise<number[]> {
  const page = await divelog.apiOrError<AdminDivePage>(
    event,
    divelog.urls.api(
      pagePath({ ...DEFAULT_LIST_QUERY, status: 'draft', sort: 'date', asc: true }, 0, 1000),
    ),
  );
  return page.items.map((d) => d.number);
}

function publicRegions(divelog: Divelog, event: RequestEvent): Promise<Region[]> {
  return divelog.apiOrError<Region[]>(event, divelog.urls.api('/dive/regions'));
}

export const divesRoute = defineRoute({
  page: 'dives',
  pattern: /^(?:dives)?$/,
  load: async (divelog, _params, event) => {
    const query = parseListQuery(event.url.searchParams);
    const draftsOnly = { ...DEFAULT_LIST_QUERY, status: 'draft' as const };
    const [page, drafts] = await Promise.all([
      divelog.apiOrError<AdminDivePage>(event, divelog.urls.api(pagePath(query))),
      divelog.apiOrError<AdminDivePage>(event, divelog.urls.api(pagePath(draftsOnly, 0, 1))),
    ]);
    return { query, rows: page.items, total: page.total, drafts: drafts.total };
  },
});

export const diveNewRoute = defineRoute({
  page: 'dive-new',
  pattern: /^dives\/new$/,
  load: async (divelog, _params, event) => {
    const prefill = newDivePrefill(event.url.searchParams);
    const [form, template] = await Promise.all([
      diveFormData(divelog, event),
      diveTemplateFor(divelog, event, prefill.site, prefill.date),
    ]);
    return { ...form, nextNumber: template.next_number, template, prefill };
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
    const draft = dive.visibility === 'draft';
    const [template, drafts] = await Promise.all([
      templateOfDive(divelog, event, dive),
      draft ? draftNumbers(divelog, event) : Promise.resolve([] as number[]),
    ]);
    return { ...form, dive, template, drafts };
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
      divelog.apiOrError<GearSetupTemplate[]>(event, divelog.urls.api('/admin/gear/setups')),
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
