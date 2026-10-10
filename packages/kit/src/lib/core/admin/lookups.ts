/**
 * The small lookup lists the site editor reads from the server: countries,
 * photo licences and how a commons site's fields behave. Each is fetched once
 * per page load and shared; a failed fetch is retried on the next call.
 */
import { adminApi, adminJson } from './client.js';
import type { CountryOut, LicenceOut, SiteFieldsOut } from './ux-api-sites.js';

function once<T>(load: () => Promise<T>): { get: () => Promise<T>; reset: () => void } {
  let pending: Promise<T> | null = null;
  return {
    get: () => {
      pending ??= load().catch((err: unknown) => {
        pending = null;
        throw err;
      });
      return pending;
    },
    reset: () => {
      pending = null;
    },
  };
}

const countries = once(() => adminJson<CountryOut[]>('/meta/countries'));
const licences = once(() => adminJson<LicenceOut[]>('/meta/licences'));
const siteFields = once(() => adminJson<SiteFieldsOut>(adminApi('meta', 'site-fields')));

/** `GET /meta/countries`, by name. */
export const fetchCountries = (): Promise<CountryOut[]> => countries.get();

/** `GET /meta/licences`, most open first. */
export const fetchLicences = (): Promise<LicenceOut[]> => licences.get();

/** `GET /admin/meta/site-fields`. */
export const fetchSiteFields = (): Promise<SiteFieldsOut> => siteFields.get();

/** Forget the cached lists (tests; a server that changed under a long-lived page). */
export function resetLookups(): void {
  countries.reset();
  licences.reset();
  siteFields.reset();
}

/**
 * The country options for a select: the server's list, plus codes it does not
 * know that the form holds (from the pin or the site), so a value never vanishes.
 */
export function countryOptions(
  known: readonly CountryOut[],
  extra: readonly { iso3: string; name: string }[] = [],
): { iso3: string; name: string }[] {
  const seen = new Set(known.map((c) => c.iso3));
  const more = extra.filter((c) => c.iso3 && !seen.has(c.iso3) && (seen.add(c.iso3), true));
  return [...known.map(({ iso3, name }) => ({ iso3, name })), ...more].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
