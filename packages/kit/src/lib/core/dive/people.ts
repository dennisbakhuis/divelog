import type { DiveListItem, Person } from './types';

export type PeopleSort = 'dives' | 'recent' | 'name';

export const PEOPLE_SORTS: { mode: PeopleSort; label: string }[] = [
  { mode: 'dives', label: 'Most dives' },
  { mode: 'recent', label: 'Most recent' },
  { mode: 'name', label: 'A–Z' },
];

export function isPeopleSort(value: string | null): value is PeopleSort {
  return PEOPLE_SORTS.some((s) => s.mode === value);
}

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, 'en');

/** A sorted copy; ties fall back to the name so the order is stable. */
export function sortPeople(people: Person[], mode: PeopleSort): Person[] {
  const out = [...people];
  if (mode === 'name') return out.sort(byName);
  if (mode === 'recent') {
    return out.sort(
      (a, b) => (b.stats.last_dive ?? '').localeCompare(a.stats.last_dive ?? '') || byName(a, b),
    );
  }
  return out.sort((a, b) => b.stats.dives - a.stats.dives || byName(a, b));
}

/** Countries with how many people dived there with me, busiest first. */
export function countryFacet(people: Person[]): { code: string; people: number }[] {
  const counts = new Map<string, number>();
  for (const person of people) {
    for (const code of new Set(person.countries)) {
      if (code && code !== 'XX') counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([code, n]) => ({ code, people: n }))
    .sort((a, b) => b.people - a.people || a.code.localeCompare(b.code));
}

export function filterByCountry(people: Person[], code: string | null): Person[] {
  return code ? people.filter((p) => p.countries.includes(code)) : people;
}

/** English name for an alpha-2 code, or the code itself when the runtime does not know it. */
export function countryLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The sites in ``dives`` with how often each was dived, most first, then by name. */
export function sitesTogether(
  dives: DiveListItem[],
  limit = 8,
): { slug: string; name: string; country_code: string; dives: number }[] {
  const counts = new Map<
    string,
    { slug: string; name: string; country_code: string; dives: number }
  >();
  for (const dive of dives) {
    if (!dive.site) continue;
    const row = counts.get(dive.site.slug) ?? {
      slug: dive.site.slug,
      name: dive.site.name,
      country_code: dive.site.country_code,
      dives: 0,
    };
    row.dives += 1;
    counts.set(dive.site.slug, row);
  }
  return [...counts.values()]
    .sort((a, b) => b.dives - a.dives || a.name.localeCompare(b.name, 'en'))
    .slice(0, limit);
}
