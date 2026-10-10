/** Lowercase ASCII slug, as the backend makes them: accents dropped, other runs become one dash. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0080-￿]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The pattern every site id matches; the server rejects a new site whose id does not. */
export const SITE_ID = /^[a-z]{3}-[a-z0-9-]+$/;

/**
 * The id a new site gets: `{iso3}-{slug(name)}`, the server's `site_id_for` rule. An unknown
 * country becomes `xxx` and a name without ASCII letters `site`, so the id is always valid.
 */
export function siteIdFor(country: string | null, name: string): string {
  const code = (country ?? '').trim().toLowerCase().slice(0, 3);
  return `${/^[a-z]{3}$/.test(code) ? code : 'xxx'}-${slugify(name) || 'site'}`;
}
