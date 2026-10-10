import { describe, expect, it } from 'vitest';
import {
  countryFacet,
  countryLabel,
  filterByCountry,
  isPeopleSort,
  sitesTogether,
  sortPeople,
} from './people.js';
import type { DiveListItem, Person } from './types.js';

function person(name: string, dives: number, last: string | null, countries: string[]): Person {
  return {
    slug: name.toLowerCase(),
    name,
    avatar_url: null,
    bio_md: '',
    bio_html: '',
    countries,
    private: null,
    stats: {
      dives,
      minutes: dives * 45,
      max_depth_m: 20,
      longest_min: 60,
      coldest_c: null,
      first_dive: last ? '2018-01-01' : null,
      last_dive: last,
      countries: countries.length,
      sites: 1,
    },
  };
}

const people = [
  person('Kim', 40, '2023-05-01', ['NL', 'EG']),
  person('Anna', 3, '2025-01-01', ['NL']),
  person('Bert', 40, '2019-03-01', ['FR', 'NL']),
  person('Cas', 1, null, []),
];

describe('people index', () => {
  it('sorts by dives, recency or name', () => {
    expect(sortPeople(people, 'dives').map((p) => p.name)).toEqual(['Bert', 'Kim', 'Anna', 'Cas']);
    expect(sortPeople(people, 'recent').map((p) => p.name)).toEqual(['Anna', 'Kim', 'Bert', 'Cas']);
    expect(sortPeople(people, 'name').map((p) => p.name)).toEqual(['Anna', 'Bert', 'Cas', 'Kim']);
    expect(people[0].name).toBe('Kim');
  });

  it('builds the country facet and filters by it', () => {
    expect(countryFacet(people)).toEqual([
      { code: 'NL', people: 3 },
      { code: 'EG', people: 1 },
      { code: 'FR', people: 1 },
    ]);
    expect(filterByCountry(people, 'FR').map((p) => p.name)).toEqual(['Bert']);
    expect(filterByCountry(people, null)).toBe(people);
  });

  it('validates sort params and names countries', () => {
    expect(isPeopleSort('recent')).toBe(true);
    expect(isPeopleSort('bogus')).toBe(false);
    expect(isPeopleSort(null)).toBe(false);
    expect(countryLabel('NL')).toBe('Netherlands');
  });
});

describe('sitesTogether', () => {
  const site = (slug: string) => ({
    slug,
    name: slug.toUpperCase(),
    country_code: 'NL',
    country_name: 'Netherlands',
    region: null,
    area: null,
    lat: null,
    lon: null,
    site_type: 'sea',
  });
  const dive = (slug: string | null) => ({ site: slug ? site(slug) : null }) as DiveListItem;

  it('counts sites, most dived first, and caps the list', () => {
    const dives = [dive('b'), dive('a'), dive('b'), dive(null), dive('c')];
    expect(sitesTogether(dives).map((s) => [s.slug, s.dives])).toEqual([
      ['b', 2],
      ['a', 1],
      ['c', 1],
    ]);
    expect(sitesTogether(dives, 1)).toHaveLength(1);
  });
});
