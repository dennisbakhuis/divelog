/**
 * The site editor's form state, shared by the workspace's Details and Location
 * tabs so switching tabs keeps what was typed, and the rules that lock a commons
 * site's objective fields until it is forked.
 */
import type { Price, Site, SiteFieldsOut, SiteIn } from '$lib/core/dive/types.js';
import { validLatLon } from '$lib/core/map/coords.js';

export interface SiteFormState {
  site_id: string;
  name: string;
  full_name: string;
  short_name: string;
  aliases: string;
  region: string;
  country: string;
  area: string;
  system: string;
  type: string;
  section_vocabulary: string;
  lat: number | null;
  lon: number | null;
  access_lat: number | null;
  access_lon: number | null;
  access_note: string;
  location_visibility: 'exact' | 'region_only';
  water: 'salt' | 'fresh' | 'brackish';
  halocline: boolean;
  halocline_m: number | null;
  summary: string;
  description_md: string;
  prices: Price[];
  sources: string;
  verified: string;
  geo_source: string;
  notes: string;
  /** "What changed", sent as the changelog note of this save. */
  note: string;
  /** A commons site being forked: its objective fields are unlocked and the save forks. */
  fork: boolean;
}

/** The form for a site as the server has it. */
export function siteFormFrom(s: Site): SiteFormState {
  return {
    site_id: s.id,
    name: s.name,
    full_name: s.full_name ?? '',
    short_name: s.short_name ?? '',
    aliases: s.aliases.join(', '),
    region: s.region ?? '',
    country: s.country ?? '',
    area: s.area ?? '',
    system: s.system ?? '',
    type: s.site_type,
    section_vocabulary: s.section_vocabulary.join(', '),
    lat: s.lat,
    lon: s.lon,
    access_lat: s.access?.lat ?? null,
    access_lon: s.access?.lon ?? null,
    access_note: s.access?.note ?? '',
    location_visibility: s.location_visibility,
    water: s.water ?? 'salt',
    halocline: s.halocline,
    halocline_m: s.halocline_m ?? null,
    summary: s.summary ?? '',
    description_md: s.description_md,
    prices: s.prices.map((p) => ({ ...p })),
    sources: s.sources.join('\n'),
    verified: s.verified ?? '',
    geo_source: s.geo_source ?? '',
    notes: s.private?.notes ?? '',
    note: '',
    fork: false,
  };
}

const list = (value: string) =>
  value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

const numOrNull = (value: number | string | null) =>
  value === null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);

/** The `PUT /admin/sites/{id}` body for the form. */
export function siteFormBody(form: SiteFormState, site: Site | null): SiteIn {
  const accessLat = numOrNull(form.access_lat);
  const accessLon = numOrNull(form.access_lon);
  const access =
    accessLat !== null || accessLon !== null || form.access_note.trim()
      ? { lat: accessLat, lon: accessLon, note: form.access_note.trim() || null }
      : null;
  return {
    site_id: form.site_id,
    name: form.name.trim(),
    full_name: form.full_name.trim() || null,
    short_name: form.short_name.trim() || null,
    aliases: list(form.aliases),
    region: form.region || null,
    country: form.country.trim().toUpperCase() || null,
    area: form.area.trim() || null,
    system: form.system.trim() || null,
    type: form.type,
    section_vocabulary: list(form.section_vocabulary),
    lat: numOrNull(form.lat),
    lon: numOrNull(form.lon),
    access,
    location_visibility: form.location_visibility,
    water: form.water,
    halocline: form.halocline,
    halocline_m: form.halocline ? numOrNull(form.halocline_m) : null,
    summary: form.summary.trim() || null,
    description_md: form.description_md,
    default_map: site?.default_map ?? null,
    prices: form.prices.filter((p) => p.date),
    sources: form.sources
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    verified: form.verified.trim() || null,
    geo_source: form.geo_source.trim() || null,
    notes: form.notes.trim() || null,
    note: form.note.trim() || null,
  };
}

/** Form fields per record field, where the names differ. */
const FORM_FIELDS: Record<string, (keyof SiteFormState)[]> = {
  access: ['access_lat', 'access_lon', 'access_note'],
};

/** The form fields a record field stands for. */
export function formFieldsOf(recordField: string): (keyof SiteFormState)[] {
  return FORM_FIELDS[recordField] ?? [recordField as keyof SiteFormState];
}

/**
 * The form fields locked on this site: a commons site's objective fields, until
 * the owner forks it. Personal and forked sites lock nothing.
 */
export function lockedFields(
  site: Pick<Site, 'origin'> | null,
  fields: Pick<SiteFieldsOut, 'objective'> | null,
  forking: boolean,
): Set<keyof SiteFormState> {
  if (!site || site.origin !== 'commons' || forking || !fields) return new Set();
  return new Set(fields.objective.flatMap(formFieldsOf));
}

/** Fields that are the owner's own on a commons site (overlay or preference), for a "yours" mark. */
export function overlayFields(
  site: Pick<Site, 'origin'> | null,
  fields: Pick<SiteFieldsOut, 'personal' | 'preference' | 'additive'> | null,
): Set<keyof SiteFormState> {
  if (!site || site.origin !== 'commons' || !fields) return new Set();
  return new Set(
    [...fields.personal, ...fields.preference, ...fields.additive].flatMap(formFieldsOf),
  );
}

/** Whether the form differs from the site it was made from (the note and fork flag aside). */
export function formDirty(form: SiteFormState, site: Site): boolean {
  const base = siteFormBody(siteFormFrom(site), site);
  const now = siteFormBody(form, site);
  return JSON.stringify({ ...base, note: null }) !== JSON.stringify({ ...now, note: null });
}

/** Client-side checks before a save, keyed by body path like the server's 422s. */
export function validateSiteForm(form: SiteFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'A site needs a name.';
  const lat = numOrNull(form.lat);
  const lon = numOrNull(form.lon);
  if ((lat === null) !== (lon === null))
    errors.lat = 'Give both latitude and longitude, or neither.';
  else if (lat !== null && !validLatLon(lat, lon))
    errors.lat = 'Latitude -90…90, longitude -180…180.';
  const alat = numOrNull(form.access_lat);
  const alon = numOrNull(form.access_lon);
  if ((alat === null) !== (alon === null))
    errors.access = 'Give both coordinates of the entry point, or neither.';
  else if (alat !== null && !validLatLon(alat, alon))
    errors.access = 'Latitude -90…90, longitude -180…180.';
  if (form.country.trim() && !/^[A-Za-z]{3}$/.test(form.country.trim()))
    errors.country = 'Three letters, ISO 3166 alpha-3.';
  return errors;
}
