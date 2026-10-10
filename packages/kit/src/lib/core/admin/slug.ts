/** Lowercase ASCII slug, as the backend makes them: accents dropped, other runs become one dash. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0080-\uffff]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The id a new site gets: `{iso3}-{slug(name)}`, as the sites editor derives it. */
export function siteIdFor(country: string, name: string): string {
  return `${country.trim().toLowerCase().slice(0, 3)}-${slugify(name)}`;
}
