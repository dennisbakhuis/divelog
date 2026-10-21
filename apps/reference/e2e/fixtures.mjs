/**
 * A small, made-up dive log in the shapes the divelog server's public API
 * returns: three dives at two sites, one trip, two buddies and one gear setup.
 */

const SITES = [
  {
    slug: 'nl-example-quarry',
    name: 'Example Quarry',
    country: 'NLD',
    country_code: 'NL',
    country_name: 'Netherlands',
    region: 'inland-lakes',
    region_name: 'Inland lakes',
    area: 'Utrecht',
    lat: 52.09,
    lon: 5.12,
    site_type: 'quarry lake',
    water: 'fresh',
    summary: 'A flooded sand quarry with a training platform at 8 m.',
  },
  {
    slug: 'eg-coral-garden',
    name: 'Coral Garden',
    country: 'EGY',
    country_code: 'EG',
    country_name: 'Egypt',
    region: 'red-sea',
    region_name: 'Northern Red Sea',
    area: 'Hurghada',
    lat: 27.23,
    lon: 33.86,
    site_type: 'sea',
    water: 'salt',
    summary: 'A shallow reef garden for an easy first dive of the week.',
  },
];

/**
 * A site taken from the shared commons and not dived yet: the server keeps it off the public
 * lists, but its page is served, with the attribution the commons licence asks for.
 */
const COMMONS_SITE = {
  slug: 'fra-commons-cave',
  name: 'Commons Cave',
  country: 'FRA',
  country_code: 'FR',
  country_name: 'France',
  region: null,
  region_name: null,
  area: 'Lot',
  lat: 44.6,
  lon: 1.7,
  site_type: 'cave',
  water: 'fresh',
  summary: 'A resurgence documented in the shared site commons.',
  origin: 'commons',
  attribution: {
    licence: 'ODbL-1.0 + CC-BY-SA-4.0',
    source: 'https://github.com/divelog/divelog-sites',
    ref: '3f0c1a2b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a',
  },
  revision: 3,
};

const PEOPLE = [
  { slug: 'alex', name: 'Alex', avatar_url: null },
  { slug: 'robin', name: 'Robin', avatar_url: null },
];

/** The buddies' private e-mail addresses, where a request to sign a dive goes; robin has none. */
const EMAILS = { alex: 'alex@example.com' };

const TRIP = {
  id: 'red-sea-2025-03',
  slug: 'red-sea-2025-03',
  name: 'Red Sea Mar 2025',
  start_date: '2025-03-01',
  end_date: '2025-03-08',
};

const DIVES = [
  {
    number: 1,
    date: '2024-05-12',
    time_in: '10:15',
    duration_min: 45,
    max_depth_m: 18.2,
    avg_depth_m: 9.8,
    water_temp_c: 14,
    site: 'nl-example-quarry',
    tags: ['training'],
    buddies: ['alex'],
    trip: null,
  },
  {
    number: 2,
    date: '2024-05-12',
    time_in: '14:05',
    duration_min: 52,
    max_depth_m: 12.4,
    avg_depth_m: 7.1,
    water_temp_c: 15,
    site: 'nl-example-quarry',
    tags: [],
    buddies: ['alex', 'robin'],
    trip: null,
  },
  {
    number: 3,
    date: '2025-03-02',
    time_in: '09:30',
    duration_min: 61,
    max_depth_m: 22.7,
    avg_depth_m: 11.3,
    water_temp_c: 23,
    site: 'eg-coral-garden',
    tags: ['boat'],
    buddies: ['robin'],
    trip: TRIP.slug,
  },
];

const siteOf = (slug) => SITES.find((s) => s.slug === slug);
const personOf = (slug) => PEOPLE.find((p) => p.slug === slug);
const divesAt = (slug) => DIVES.filter((d) => d.site === slug);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const round1 = (value) => Math.round(value * 10) / 10;

function siteRef(site) {
  const { slug, name, country_code, country_name, region, area, lat, lon, site_type, water } = site;
  return { slug, name, country_code, country_name, region, area, lat, lon, site_type, water };
}

function siteFull(site) {
  const dives = divesAt(site.slug);
  return {
    id: site.slug,
    slug: site.slug,
    name: site.name,
    full_name: site.name,
    short_name: site.name,
    aliases: [],
    country: site.country,
    country_code: site.country_code,
    country_name: site.country_name,
    region: site.region,
    region_name: site.region_name,
    area: site.area,
    system: null,
    site_type: site.site_type,
    section_vocabulary: [],
    lat: site.lat,
    lon: site.lon,
    access: null,
    location_visibility: 'exact',
    water: site.water,
    halocline: false,
    halocline_m: null,
    summary: site.summary,
    description_md: site.summary,
    max_depth_m: dives.length ? Math.max(...dives.map((d) => d.max_depth_m)) : null,
    dives: dives.length,
    first_dive: dives[0]?.date ?? null,
    last_dive: dives.at(-1)?.date ?? null,
    maps: [],
    default_map: null,
    attachments: [],
    prices: [],
    sources: [],
    verified: null,
    geo_source: null,
    origin: site.origin ?? 'log',
    attribution: site.attribution ?? null,
    revision: site.revision ?? 1,
    changelog: [],
    forked_from: null,
    private: null,
    description_html: `<p>${site.summary}</p>`,
  };
}

function mapSite(site) {
  const dives = divesAt(site.slug);
  const years = dives.map((d) => Number(d.date.slice(0, 4)));
  return {
    slug: site.slug,
    name: site.name,
    country_code: site.country_code,
    lat: site.lat,
    lon: site.lon,
    dives: dives.length,
    minutes: sum(dives.map((d) => d.duration_min)),
    site_type: site.site_type,
    max_depth_m: Math.max(...dives.map((d) => d.max_depth_m)),
    first_year: Math.min(...years),
    last_year: Math.max(...years),
  };
}

function profileOf(dive) {
  const samples = [];
  const seconds = dive.duration_min * 60;
  for (let t = 0; t <= seconds; t += 30) {
    const phase = t / seconds;
    const shape = phase < 0.1 ? phase / 0.1 : phase > 0.85 ? (1 - phase) / 0.15 : 1;
    const d = round1(Math.max(0, dive.max_depth_m * shape * (0.85 + 0.15 * Math.sin(t / 240))));
    samples.push({ t, d, temp: dive.water_temp_c, ndl: 99, stop: null, tts: 1 });
  }
  return samples;
}

function spark(dive) {
  return profileOf(dive)
    .filter((_, i) => i % 4 === 0)
    .map((s) => Math.round((s.d / dive.max_depth_m) * 140));
}

function listItem(dive) {
  const site = siteOf(dive.site);
  return {
    number: dive.number,
    title: '',
    date: dive.date,
    time_in: dive.time_in,
    duration_min: dive.duration_min,
    max_depth_m: dive.max_depth_m,
    water_temp_c: dive.water_temp_c,
    tags: dive.tags,
    gas: 'nitrox',
    gases: ['Nitrox 32'],
    mode: 'OC',
    site: siteRef(site),
    section: null,
    buddies: dive.buddies.map(personOf),
    gear_setup: null,
    rating: null,
    has_photos: false,
    has_profile: true,
    spark: spark(dive),
    cover_url: null,
    search_text: `#${dive.number} ${site.name} ${site.area} ${site.country_name}`,
    trip: dive.trip ? { slug: TRIP.slug, name: TRIP.name } : null,
  };
}

function diveDetail(dive) {
  const index = DIVES.indexOf(dive);
  const prev = DIVES[index - 1] ?? null;
  const next = DIVES[index + 1] ?? null;
  const site = siteOf(dive.site);
  const sameDay = DIVES.filter((d) => d.date === dive.date);
  return {
    ...listItem(dive),
    time_out: null,
    avg_depth_m: dive.avg_depth_m,
    surface_temp_c: null,
    air_temp_c: null,
    thermocline_m: null,
    visibility_m: 8,
    visibility_raw: null,
    site: siteFull(site),
    trip: dive.trip
      ? {
          ...TRIP,
          description_md: '',
          day_index: 2,
          days: 8,
          custom: false,
          description_html: '',
        }
      : null,
    types_raw: null,
    o2_pct: 32,
    o2_measured_pct: null,
    he_pct: 0,
    gas_raw: null,
    suit: '7 mm wetsuit',
    weights_kg: 8,
    cylinder: null,
    pressure_in_bar: 200,
    pressure_out_bar: 70,
    tanks: [],
    sac_l_min: null,
    sac_basis: null,
    safety_stop_min: 3,
    surface_interval: null,
    conditions: null,
    difficulty: null,
    course: null,
    guide: null,
    body_md: 'A calm dive along the wall.',
    notes_nl: null,
    visibility: 'public',
    buddies: dive.buddies.map((slug) => ({
      ...personOf(slug),
      dives_together: DIVES.filter((d) => d.buddies.includes(slug)).length,
      first_dive: DIVES.find((d) => d.buddies.includes(slug)).date,
      last_dive: DIVES.findLast((d) => d.buddies.includes(slug)).date,
      first_together: DIVES.find((d) => d.buddies.includes(slug)) === dive,
    })),
    attachments: [],
    cover_attachment_id: null,
    computer: [dive.number],
    profile: profileOf(dive),
    profile_meta: {
      gf: '50/85',
      deco_model: 'ZHL-16C GF',
      deco: false,
      gas_switches: [[0, '32']],
      surface_breaks: [],
      temp_min_c: dive.water_temp_c,
      temp_max_c: dive.water_temp_c,
      sample_interval_s: 30,
      partial: null,
      samples: profileOf(dive).length,
      deco_min: null,
      deepest_stop_m: null,
      first_stop_s: null,
      max_ascent_m_min: 8,
      max_descent_m_min: 12,
      time_at_max_s: 300,
    },
    map_annotation: null,
    annotation_stale: false,
    annotation_dropped_legs: 0,
    map: null,
    prev_number: prev?.number ?? null,
    next_number: next?.number ?? null,
    prev_site_name: prev ? siteOf(prev.site).name : null,
    next_site_name: next ? siteOf(next.site).name : null,
    site_dive_index: divesAt(site.slug).indexOf(dive) + 1,
    day_index: sameDay.indexOf(dive) + 1,
    same_day: sameDay
      .filter((d) => d !== dive)
      .map((d) => ({ number: d.number, site_name: siteOf(d.site).name, time_in: d.time_in })),
    context_facts: index === 0 ? ['first dive in the log'] : [],
    buddy_notes: [],
    private: null,
    body_html: '<p>A calm dive along the wall.</p>',
  };
}

const countries = () =>
  [...new Set(SITES.map((s) => s.country_code))].map((code) => {
    const site = SITES.find((s) => s.country_code === code);
    return {
      country_code: code,
      country_name: site.country_name,
      dives: DIVES.filter((d) => siteOf(d.site).country_code === code).length,
    };
  });

const years = () =>
  [...new Set(DIVES.map((d) => Number(d.date.slice(0, 4))))].map((year) => {
    const dives = DIVES.filter((d) => d.date.startsWith(String(year)));
    return { year, dives: dives.length, minutes: sum(dives.map((d) => d.duration_min)) };
  });

const ordered = () => [...DIVES].reverse();
const minutes = () => sum(DIVES.map((d) => d.duration_min));
const deepest = () => DIVES.reduce((a, b) => (b.max_depth_m > a.max_depth_m ? b : a));
const longest = () => DIVES.reduce((a, b) => (b.duration_min > a.duration_min ? b : a));
const coldest = () => DIVES.reduce((a, b) => (b.water_temp_c < a.water_temp_c ? b : a));
const record = (dive, value) => ({
  number: dive.number,
  title: '',
  value,
  site: siteOf(dive.site).name,
});
const tags = () =>
  [...new Set(DIVES.flatMap((d) => d.tags))].map((tag) => ({
    tag,
    count: DIVES.filter((d) => d.tags.includes(tag)).length,
  }));

function personStats(slug) {
  const dives = DIVES.filter((d) => d.buddies.includes(slug));
  return {
    dives: dives.length,
    minutes: sum(dives.map((d) => d.duration_min)),
    max_depth_m: Math.max(...dives.map((d) => d.max_depth_m)),
    longest_min: Math.max(...dives.map((d) => d.duration_min)),
    coldest_c: Math.min(...dives.map((d) => d.water_temp_c)),
    first_dive: dives[0].date,
    last_dive: dives.at(-1).date,
    countries: new Set(dives.map((d) => siteOf(d.site).country_code)).size,
    sites: new Set(dives.map((d) => d.site)).size,
  };
}

const GEAR_ITEMS = [
  {
    id: 'primary-regulator',
    name: 'Primary regulator',
    category: 'regulator',
    brand: 'Example',
    model: 'R1',
    acquired: null,
    retired: null,
    notes_md: 'Long hose on the right post.',
    sort: 10,
    photo_url: null,
    dive_count: 0,
    notes_html: '<p>Long hose on the right post.</p>',
  },
  {
    id: 'wing',
    name: 'Wing',
    category: 'bcd',
    brand: 'Example',
    model: 'W18',
    acquired: null,
    retired: null,
    notes_md: '',
    sort: 20,
    photo_url: null,
    dive_count: 0,
    notes_html: '',
  },
];

function tripSummary() {
  return {
    ...TRIP,
    days: 8,
    countries: [{ country_code: 'EG', country_name: 'Egypt', dives: 1 }],
    regions: [{ id: 'red-sea', name: 'Northern Red Sea' }],
    site_ids: ['eg-coral-garden'],
    dive_numbers: [3],
    stats: { dives: 1, minutes: 61, max_depth_m: 22.7, sites: 1 },
    buddies: [{ ...personOf('robin'), dives: 1 }],
    description_md: '',
    cover_url: null,
    description_html: '',
  };
}

/** A region page: its one site, the dives there and the numbers. */
function regionDetail(site) {
  const dives = divesAt(site.slug);
  const years = dives.map((d) => Number(d.date.slice(0, 4)));
  return {
    id: site.region,
    name: site.region_name,
    country: site.country_name,
    country_code: site.country_code,
    waters: [site.water],
    body_md: '',
    sites: [siteRef(site)],
    dives: dives.length,
    stats: {
      dives: dives.length,
      sites: 1,
      minutes: sum(dives.map((d) => d.duration_min)),
      max_depth_m: Math.max(...dives.map((d) => d.max_depth_m)),
      first_year: Math.min(...years),
      last_year: Math.max(...years),
      top_site: null,
    },
    map_sites: [mapSite(site)],
    body_html: '',
  };
}

/** A buddy's page: the dives together, where, when and on which trips. */
function personDetail(person) {
  const dives = DIVES.filter((d) => d.buddies.includes(person.slug));
  const sites = [...new Set(dives.map((d) => d.site))].map(siteOf);
  const yearList = [...new Set(dives.map((d) => Number(d.date.slice(0, 4))))];
  return {
    person: {
      ...person,
      bio_md: '',
      stats: personStats(person.slug),
      countries: [...new Set(sites.map((s) => s.country_code))],
      private: null,
      bio_html: '',
    },
    countries: [...new Set(sites.map((s) => s.country_code))].map((code) => {
      const site = sites.find((s) => s.country_code === code);
      return {
        country_code: code,
        country_name: site.country_name,
        dives: dives.filter((d) => siteOf(d.site).country_code === code).length,
      };
    }),
    dives: [...dives].reverse().map(listItem),
    map_sites: sites.map(mapSite),
    years: yearList.map((year) => {
      const inYear = dives.filter((d) => d.date.startsWith(String(year)));
      return { year, dives: inYear.length, minutes: sum(inYear.map((d) => d.duration_min)) };
    }),
    trips: dives.some((d) => d.trip)
      ? [
          {
            slug: TRIP.slug,
            name: TRIP.name,
            start_date: TRIP.start_date,
            end_date: TRIP.end_date,
            dives: dives.filter((d) => d.trip).length,
          },
        ]
      : [],
  };
}

/** The API responses by path (without the `/api/v1` prefix). */
export function fixtures() {
  return {
    '/version': { version: '0.1.0', format: 1, api: 1 },
    '/dive/summary': {
      total_dives: DIVES.length,
      total_hours: round1(minutes() / 60),
      countries: countries().length,
      max_depth_m: deepest().max_depth_m,
      last_dive: DIVES.at(-1).date,
      last_dive_site: siteOf(DIVES.at(-1).site).name,
      cave_dives: 0,
      scooter_dives: 0,
    },
    '/dive/timeline': {
      years: years().map(({ year, dives }) => ({ year, dives })),
      latest: {
        number: DIVES.at(-1).number,
        date: DIVES.at(-1).date,
        site: siteOf(DIVES.at(-1).site).name,
      },
    },
    '/dive/stats': {
      total_dives: DIVES.length,
      private_dives: 0,
      total_minutes: minutes(),
      max_depth_m: deepest().max_depth_m,
      avg_depth_m: round1(sum(DIVES.map((d) => d.avg_depth_m)) / DIVES.length),
      avg_duration_min: round1(minutes() / DIVES.length),
      countries: countries().length,
      sites: SITES.length,
      first_dive: DIVES[0].date,
      last_dive: DIVES.at(-1).date,
      tags: tags(),
      deep_dives: 0,
      years: years(),
      country_breakdown: countries(),
      depth_buckets: [
        { from_m: 0, to_m: 10, dives: 0 },
        { from_m: 10, to_m: 20, dives: 2 },
        { from_m: 20, to_m: 30, dives: 1 },
      ],
      map_sites: SITES.map(mapSite),
      deepest: record(deepest(), deepest().max_depth_m),
      longest: record(longest(), longest().duration_min),
      coldest: record(coldest(), coldest().water_temp_c),
    },
    '/dive/dives': {
      dives: ordered().map(listItem),
      total: DIVES.length,
      tags: tags().map((t) => t.tag),
      countries: countries(),
      years: [...new Set(DIVES.map((d) => Number(d.date.slice(0, 4))))].reverse(),
      regions: [...new Set(SITES.map((s) => s.region))],
      site_types: [...new Set(SITES.map((s) => s.site_type))],
      gear_setups: [{ slug: 'backmount-wetsuit', name: 'Backmount, wetsuit' }],
    },
    ...Object.fromEntries(DIVES.map((d) => [`/dive/dives/${d.number}`, diveDetail(d)])),
    '/dive/sites': SITES.map(siteFull),
    ...Object.fromEntries(
      SITES.map((s) => [
        `/dive/sites/${s.slug}`,
        {
          site: siteFull(s),
          dives: [...divesAt(s.slug)].reverse().map(listItem),
          people: [...new Set(divesAt(s.slug).flatMap((d) => d.buddies))].map(personOf),
          nearby: [],
          routes: [],
        },
      ]),
    ),
    [`/dive/sites/${COMMONS_SITE.slug}`]: {
      site: siteFull(COMMONS_SITE),
      dives: [],
      people: [],
      nearby: [],
      routes: [],
    },
    '/dive/regions': SITES.map((s) => ({
      id: s.region,
      name: s.region_name,
      country: s.country,
      country_code: s.country_code,
      waters: [],
      body_md: '',
      sites: [siteRef(s)],
      dives: divesAt(s.slug).length,
      stats: null,
      map_sites: [],
      body_html: '',
    })),
    '/dive/trips': [tripSummary()],
    [`/dive/trips/${TRIP.slug}`]: {
      trip: tripSummary(),
      dives: DIVES.filter((d) => d.trip === TRIP.slug).map(listItem),
      map_sites: [mapSite(siteOf('eg-coral-garden'))],
    },
    ...Object.fromEntries(SITES.map((s) => [`/dive/regions/${s.region}`, regionDetail(s)])),
    ...Object.fromEntries(PEOPLE.map((p) => [`/dive/people/${p.slug}`, personDetail(p)])),
    '/dive/people': PEOPLE.map((p) => ({
      ...p,
      bio_md: '',
      stats: personStats(p.slug),
      countries: [
        ...new Set(
          DIVES.filter((d) => d.buddies.includes(p.slug)).map((d) => siteOf(d.site).country_code),
        ),
      ],
      private: null,
      bio_html: '',
    })),
    '/dive/gear': {
      setups: [
        {
          id: 'backmount-wetsuit',
          slug: 'backmount-wetsuit',
          name: 'Backmount, wetsuit',
          description_md: 'Single tank for warm water.',
          sort: 1,
          items: GEAR_ITEMS,
          dive_count: 0,
          description_html: '<p>Single tank for warm water.</p>',
        },
      ],
      items: GEAR_ITEMS,
    },
  };
}

/** The slug of the site the smoke test opens. */
export const SITE_SLUG = SITES[0].slug;
/** The site's display name, the page's heading. */
export const SITE_NAME = SITES[0].name;
/** Every public dive number. */
export const DIVE_NUMBERS = DIVES.map((d) => d.number);
/** A commons site: not on the public lists, its page carries the attribution line. */
export const COMMONS_SLUG = COMMONS_SITE.slug;
export const COMMONS_NAME = COMMONS_SITE.name;

/** The cookie the stub takes for a signed-in owner; any value of it signs in. */
export const OWNER_COOKIE = 'divelog_e2e_owner';

const COMMONS_HITS = [
  {
    id: 'fra-fontaine-de-truffe',
    name: 'Fontaine de Truffe',
    country: 'FRA',
    type: 'cave',
    lat: 44.6,
    lon: 1.7,
    area: 'Lot',
    dives: 0,
    has_dives: false,
    origin: 'commons',
    distance_km: null,
  },
  {
    id: 'fra-fontaine-saint-george',
    name: 'Fontaine Saint-George',
    country: 'FRA',
    type: 'cave',
    lat: 44.5,
    lon: 1.6,
    area: 'Lot',
    dives: 3,
    has_dives: true,
    origin: 'commons',
    distance_km: null,
  },
  {
    ...COMMONS_SITE,
    id: COMMONS_SITE.slug,
    type: COMMONS_SITE.site_type,
    dives: 0,
    has_dives: false,
    distance_km: null,
  },
].map(({ id, name, country, type, lat, lon, area, dives, has_dives, origin, distance_km }) => ({
  id,
  name,
  country,
  type,
  lat,
  lon,
  area,
  dives,
  has_dives,
  origin,
  distance_km,
}));

/** A dive as the editor loads it: the public record plus the ids the form edits. */
function diveAdmin(dive) {
  const site = siteOf(dive.site);
  return {
    ...diveDetail(dive),
    id: dive.number,
    people_ids: dive.buddies,
    site_id: site.slug,
    trip_id: dive.trip,
    gear_setup_id: null,
    country: site.country,
    sign_requests: [],
  };
}

/** A buddy as the editor sees them: the public card plus the private name fields. */
function personPrivate(person) {
  return {
    ...person,
    id: person.slug,
    first_name: person.name,
    last_name: null,
    alias: null,
    aliases: [],
    email: EMAILS[person.slug] ?? null,
    display: 'first',
    notes: null,
    dives: DIVES.filter((d) => d.buddies.includes(person.slug)).length,
  };
}

/** The trip as the editor loads it. */
function tripAdmin() {
  return {
    ...TRIP,
    description_md: '',
    day_index: null,
    days: 8,
    custom: false,
    description_html: '',
  };
}

/** The editor's lists and records the admin pages load, by path. */
function adminFixtures() {
  return {
    '/admin/dives': ordered().map((dive) => ({
      number: dive.number,
      date: dive.date,
      title: '',
      site_name: siteOf(dive.site).name,
      max_depth_m: dive.max_depth_m,
      duration_min: dive.duration_min,
      tags: dive.tags,
      attachments: 0,
      visibility: 'public',
    })),
    ...Object.fromEntries(DIVES.map((d) => [`/admin/dives/${d.number}`, diveAdmin(d)])),
    '/admin/dives/next-number': { number: DIVES.length + 1 },
    '/admin/sites': [...SITES, COMMONS_SITE].map(siteFull),
    ...Object.fromEntries(
      [...SITES, COMMONS_SITE].map((s) => [`/admin/sites/${s.slug}`, siteFull(s)]),
    ),
    '/admin/trips': [tripAdmin()],
    [`/admin/trips/${TRIP.slug}`]: tripAdmin(),
    '/admin/people': PEOPLE.map(personPrivate),
    ...Object.fromEntries(PEOPLE.map((p) => [`/admin/people/${p.slug}`, personPrivate(p)])),
    '/admin/regions': fixtures()['/dive/regions'],
    '/admin/gear/items': GEAR_ITEMS,
    '/admin/gear/setups': [],
  };
}

/** Owner endpoints for the sharing features and the editor, by path (without `/api/v1`). */
export function ownerFixtures() {
  return {
    ...adminFixtures(),
    '/auth/me': { email: 'sam@example.com' },
    '/admin/repo/status': {
      state: 'clean',
      ahead: 0,
      behind: 0,
      head: '81b54bf0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
      dirty: false,
      last_push_at: null,
      last_error: null,
      load_errors: [],
      notices: [
        'site fra-commons-cave: overlay written against commons revision 2, commons is at 3',
      ],
      commons_head: '3f0c1a2b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a',
      commons_state: 'clean',
    },
    'POST /admin/commons/pull': {
      previous_head: '3f0c1a2b9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a',
      head: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
      pinned: true,
      stale: [
        {
          site_id: COMMONS_SITE.slug,
          origin: 'commons',
          pinned_revision: 2,
          current_revision: 4,
          new: true,
        },
      ],
    },
  };
}

/** `GET /admin/sites/{id}` of a log site: the site as the editor loads it, with no maps yet. */
export function adminSite(id) {
  const site = SITES.find((s) => s.slug === id);
  return site ? siteFull(site) : null;
}

/**
 * `POST /admin/sites/{id}/maps/seed`: a starter site map as the server builds it from
 * OpenStreetMap (a closed shoreline round the lake, the entry at the origin), not saved.
 */
export function mapSeed(id) {
  const site = SITES.find((s) => s.slug === id);
  if (!site || site.lat == null || site.lon == null) return null;
  return {
    source: 'osm',
    radius_m: 400,
    elements: 2,
    map: {
      version: 3,
      kind: 'sitemap',
      title: site.name,
      north: 0,
      to_scale: true,
      nodes: [
        {
          id: 'entry',
          x: 0,
          y: 0,
          type: 'entry',
          label: 'Entry',
          depth: null,
          object_kind: null,
          left: null,
          right: null,
          color: null,
        },
      ],
      edges: [],
      areas: [],
      lines: [
        {
          id: 'shore',
          kind: 'shoreline',
          label: '',
          depth: null,
          closed: true,
          points: [
            { x: -120, y: -60 },
            { x: 90, y: -110 },
            { x: 160, y: 40 },
            { x: 20, y: 130 },
            { x: -140, y: 70 },
          ],
        },
      ],
      notes: 'Starter map from OpenStreetMap data (ODbL).',
      origin: { lat: site.lat, lon: site.lon },
      underlay: null,
    },
  };
}

/** `GET /admin/commons/sites?q=`: the commons hits whose name contains `q`. */
export function commonsSearch(q) {
  const needle = (q ?? '').trim().toLowerCase();
  return COMMONS_HITS.filter((hit) => !needle || hit.name.toLowerCase().includes(needle));
}

const tripOut = () => ({
  slug: TRIP.slug,
  name: TRIP.name,
  start_date: TRIP.start_date,
  end_date: TRIP.end_date,
  description_md: '',
  day_index: null,
  days: null,
  custom: true,
  description_html: '',
});

/** A logged dive in the shape `POST /admin/dives` takes, as the template's `previous`. */
function diveIn(dive) {
  const end = dive.time_in ? dive.time_in.split(':').map(Number) : null;
  const out = end
    ? (() => {
        const minutes = end[0] * 60 + end[1] + dive.duration_min;
        return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      })()
    : null;
  return {
    number: dive.number,
    title: '',
    date: dive.date,
    time_in: dive.time_in,
    time_out: out,
    duration_min: dive.duration_min,
    max_depth_m: dive.max_depth_m,
    avg_depth_m: dive.avg_depth_m,
    water_temp_c: dive.water_temp_c,
    surface_temp_c: null,
    air_temp_c: null,
    thermocline_m: null,
    visibility_m: null,
    visibility_raw: null,
    site_id: dive.site,
    section: null,
    trip_id: dive.trip,
    tags: [...dive.tags],
    types_raw: null,
    gas: null,
    o2_pct: null,
    o2_measured_pct: null,
    he_pct: null,
    gas_raw: null,
    mode: 'OC',
    suit: '5 mm',
    weights_kg: 4,
    cylinder: null,
    pressure_in_bar: null,
    pressure_out_bar: null,
    tanks: [
      {
        cylinder: '12 L',
        volume_l: 12,
        gas: 'nitrox',
        o2_pct: 32,
        o2_measured_pct: null,
        he_pct: null,
        pressure_in_bar: 200,
        pressure_out_bar: 60,
        role: 'back',
      },
    ],
    safety_stop_min: 3,
    surface_interval: null,
    conditions: null,
    difficulty: null,
    course: null,
    rating: null,
    gear_setup_id: null,
    guide: null,
    operator: null,
    buddy_raw: null,
    buddy_role: null,
    body_md: '',
    notes_nl: null,
    visibility: 'public',
    people_ids: [...dive.buddies],
    cover_attachment_id: null,
    computer: [],
    flags: [],
    sketch: null,
    profile: null,
    map_annotation: null,
    buddy_notes: null,
  };
}

/** The stored dive the editor reads back: the input plus what the server derives. */
function savedDiveAdmin(input) {
  const site = SITES.find((s) => s.slug === input.site_id);
  return {
    ...input,
    id: String(input.number),
    site: site ? siteFull(site) : null,
    trip: input.trip_id === TRIP.slug ? tripOut() : null,
    gear_setup: null,
    sac_l_min: null,
    sac_basis: null,
    buddies: PEOPLE.filter((p) => input.people_ids.includes(p.slug)),
    attachments: [],
    profile: null,
    profile_meta: null,
    annotation_stale: false,
    annotation_dropped_legs: [],
    map: null,
    prev_number: null,
    next_number: null,
    prev_site_name: null,
    next_site_name: null,
    site_dive_index: null,
    day_index: null,
    same_day: [],
    context_facts: [],
    buddy_notes: [],
    sign_requests: [],
    country: site?.country_code ?? null,
    private: {
      people: [],
      buddy_raw: input.buddy_raw ?? null,
      buddy_role: input.buddy_role ?? null,
      operator: input.operator ?? null,
      flags: input.flags ?? [],
      sketch: input.sketch ?? null,
      site_name_raw: null,
      area_raw: null,
    },
    body_html: '',
  };
}

function adminRow(input) {
  const site = SITES.find((s) => s.slug === input.site_id);
  return {
    number: input.number,
    date: input.date,
    title: input.title ?? '',
    site_name: site?.name ?? null,
    max_depth_m: input.max_depth_m,
    duration_min: input.duration_min,
    tags: input.tags ?? [],
    attachments: 0,
    visibility: input.visibility ?? 'public',
    time_in: input.time_in ?? null,
    site_id: input.site_id ?? null,
    trip: input.trip_id === TRIP.slug ? { slug: TRIP.slug, name: TRIP.name } : null,
  };
}

const when = (d) => `${d.date} ${d.time_in ?? ''} ${String(d.number).padStart(6, '0')}`;

/**
 * The owner's dive editor endpoints over the fixture log, with dives the e2e saves kept in
 * memory: `handle(method, path, query, body)` answers `{ status, body }`, or undefined for a
 * path it leaves to `ownerFixtures` (the form's lists and the fixture dives).
 */
export function ownerEditor() {
  const saved = new Map();
  const all = () => {
    const merged = new Map(DIVES.map((d) => [d.number, diveIn(d)]));
    for (const [n, d] of saved) merged.set(n, d);
    return [...merged.values()];
  };
  const template = (site, day, beforeNumber) => {
    const anchor = beforeNumber ? all().find((d) => d.number === beforeNumber) : undefined;
    const before = all()
      .filter((d) => d.date <= day)
      .filter((d) => !beforeNumber || (anchor ? when(d) < when(anchor) : d.number < beforeNumber))
      .sort((a, b) => when(a).localeCompare(when(b)));
    const atSite = site ? before.filter((d) => d.site_id === site).at(-1) : undefined;
    const recent = [...new Set(before.map((d) => d.site_id).reverse())].filter(Boolean);
    const counts = new Map();
    for (const d of before) for (const p of d.people_ids) counts.set(p, (counts.get(p) ?? 0) + 1);
    return {
      date: day,
      next_number: Math.max(...all().map((d) => d.number)) + 1,
      previous: before.length ? { ...before.at(-1), buddy_notes: null } : null,
      at_site: atSite
        ? {
            number: atSite.number,
            date: atSite.date,
            section: atSite.section,
            map_id: null,
            water_temp_c: atSite.water_temp_c,
            surface_temp_c: null,
            air_temp_c: null,
            visibility_m: null,
          }
        : null,
      recent_sites: recent.slice(0, 8).map((id) => {
        const s = SITES.find((x) => x.slug === id);
        const dives = before.filter((d) => d.site_id === id);
        return {
          site_id: id,
          name: s?.name ?? id,
          country: s?.country ?? null,
          region: s?.region ?? null,
          last_dive: dives.at(-1).date,
          dives: dives.length,
        };
      }),
      frequent_people: [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id, dives]) => ({ id, slug: id, name: personOf(id)?.name ?? id, dives })),
      trip_for_date: day >= TRIP.start_date && day <= TRIP.end_date ? tripOut() : null,
    };
  };
  const today = () => new Date().toISOString().slice(0, 10);

  return {
    handle(method, path, query, body) {
      const ok = (value, status = 200) => ({ status, body: value });
      const key = `${method} ${path}`;
      if (key === 'GET /admin/imports') return ok([]);
      if (key === 'GET /admin/dives/next-number')
        return ok({ number: Math.max(...all().map((d) => d.number)) + 1 });
      if (key === 'GET /admin/dives/template')
        return ok(
          template(
            query.get('site'),
            query.get('date') || today(),
            Number(query.get('before')) || null,
          ),
        );
      if (key === 'GET /admin/dives/page') {
        const status = query.get('status');
        const site = query.get('site');
        const rows = all()
          .filter((d) => !status || d.visibility === status)
          .filter((d) => !site || d.site_id === site)
          .sort((a, b) => when(b).localeCompare(when(a)))
          .map(adminRow);
        const offset = Number(query.get('offset') ?? 0);
        const limit = Number(query.get('limit') ?? 100);
        return ok({ items: rows.slice(offset, offset + limit), total: rows.length, offset, limit });
      }
      if (key === 'POST /admin/preview/markdown')
        return ok({ html: `<p>${String(body?.md ?? '').replace(/[<&]/g, '')}</p>` });
      if (key === 'POST /admin/dives/publish') {
        const published = [];
        for (const n of body?.numbers ?? []) {
          const d = saved.get(n);
          if (d?.visibility === 'draft') {
            saved.set(n, { ...d, visibility: 'public' });
            published.push(n);
          }
        }
        return ok({ published, unchanged: [] });
      }
      if (key === 'POST /admin/dives') {
        const missing = ['duration_min', 'max_depth_m'].filter((f) => body?.[f] == null);
        if (missing.length)
          return ok(
            {
              detail: missing.map((f) => ({ loc: ['body', f], msg: 'Field required' })),
            },
            422,
          );
        saved.set(body.number, { ...diveIn(DIVES[0]), ...body, tanks: body.tanks ?? [] });
        return ok(savedDiveAdmin(saved.get(body.number)), 201);
      }
      const one = /^\/admin\/dives\/(\d+)$/.exec(path);
      if (one) {
        const n = Number(one[1]);
        const found = all().find((d) => d.number === n);
        if (method === 'PUT' && found) {
          saved.set(n, { ...found, ...body });
          return ok(savedDiveAdmin(saved.get(n)));
        }
        if (method === 'GET' && saved.has(n)) return ok(savedDiveAdmin(saved.get(n)));
      }
      return undefined;
    },
  };
}

const SIGN_DAYS = 7;
const DAY_MS = 86_400_000;
const NOTE_LIMITS = { strokes: 60, points: 4000, comment: 200, width: 1000, height: 400 };
const ADMIN_ONLY = ['id', 'people_ids', 'site_id', 'trip_id', 'gear_setup_id', 'country'];
const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const longDate = (day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A sign page's comment and strokes, cleaned like the server does, or the 422 detail. */
function cleanNote(body) {
  const comment = typeof body?.comment === 'string' ? body.comment.trim() || null : null;
  const strokes = Array.isArray(body?.strokes)
    ? body.strokes.map((stroke) => stroke.map((point) => point.map((c) => Math.round(c))))
    : null;
  const drawn = strokes?.length ? strokes : null;
  if (comment === null && drawn === null) return { error: 'write a comment or draw a signature' };
  if (comment && comment.length > NOTE_LIMITS.comment) return { error: 'comment too long' };
  const points = (drawn ?? []).flat();
  const outside = points.some(
    ([x, y, ...rest]) =>
      rest.length > 0 || !(x >= 0 && x <= NOTE_LIMITS.width && y >= 0 && y <= NOTE_LIMITS.height),
  );
  if ((drawn ?? []).length > NOTE_LIMITS.strokes || points.length > NOTE_LIMITS.points || outside)
    return { error: 'signature outside the limits' };
  if ((drawn ?? []).some((stroke) => stroke.length === 0))
    return { error: 'a stroke has at least one point' };
  return { comment, strokes: drawn, public: body?.public !== false };
}

/**
 * The buddy signing endpoints in memory, like the server: invites by token, notes by dive,
 * and every mail "sent". `adminDive(n)` answers the editor's record of dive `n` (or null),
 * `publicDive(n)` the public page's (or null, then the editor's record stands in).
 */
export function signBook({ adminDive, publicDive, siteUrl, ownerName = 'Sam' }) {
  const invites = new Map();
  const notes = new Map();
  const mails = [];
  let issued = 0;
  const notesOf = (n) => notes.get(n) ?? [];
  const inviteOf = (n, person) =>
    [...invites.entries()].find(([, invite]) => invite.dive === n && invite.person === person);
  const nameOf = (slug) => personOf(slug)?.name ?? slug;

  function stateOf(n, person) {
    if (notesOf(n).some((note) => note.person === person)) return 'signed';
    const found = inviteOf(n, person);
    if (found) {
      const [, invite] = found;
      return invite.used_at === null && new Date(invite.expires_at) > new Date()
        ? 'open'
        : 'expired';
    }
    return EMAILS[person] ? 'none' : 'no_email';
  }

  function requests(n) {
    const dive = adminDive(n);
    return (dive?.people_ids ?? []).map((person) => {
      const invite = inviteOf(n, person)?.[1];
      const note = notesOf(n).find((x) => x.person === person);
      return {
        person,
        state: stateOf(n, person),
        sent_at: invite?.created_at ?? null,
        expires_at: invite?.expires_at ?? null,
        signed_at: note?.signed_at ?? null,
      };
    });
  }

  function mail(dive, person) {
    for (const [token, invite] of invites)
      if (invite.dive === dive.number && invite.person === person) invites.delete(token);
    issued += 1;
    const token = `e2e-${dive.number}-${person}-${issued}`;
    const created = new Date();
    invites.set(token, {
      dive: dive.number,
      person,
      email: EMAILS[person],
      created_at: iso(created),
      expires_at: iso(new Date(created.getTime() + SIGN_DAYS * DAY_MS)),
      used_at: null,
    });
    const where = dive.site?.name ? ` at ${dive.site.name}` : '';
    mails.push({
      to: EMAILS[person],
      subject: `${ownerName} logged a dive with you`,
      text:
        `Hi ${nameOf(person)},\n\n${ownerName} logged a dive with you${where} on ` +
        `${longDate(dive.date)}. Have a look and sign it:\n\n` +
        `${siteUrl}/dive/${dive.number}?sign=${token}\n\n` +
        `The link works for ${SIGN_DAYS} days and signs once.\n`,
    });
  }

  function requestSignatures(n, body) {
    const dive = adminDive(n);
    if (!dive) return [404, { detail: 'Dive not found' }];
    if (dive.visibility === 'draft')
      return [422, { detail: `Dive #${n} is a draft; publish it before asking buddies` }];
    const resend = body?.resend === true;
    if (resend && !body?.people?.length)
      return [422, { detail: [{ loc: ['body'], msg: 'resend needs the people to mail again' }] }];
    const sent = [];
    const skipped = [];
    for (const person of [...new Set(body?.people ?? dive.people_ids)]) {
      if (!dive.people_ids.includes(person)) {
        skipped.push({ person, reason: 'not_a_buddy' });
        continue;
      }
      const state = stateOf(n, person);
      if (state === 'none' || (resend && (state === 'open' || state === 'expired'))) {
        mail(dive, person);
        sent.push(person);
      } else skipped.push({ person, reason: state });
    }
    return [200, { sent, skipped, sign_requests: requests(n) }];
  }

  function live(token) {
    const invite = invites.get(token);
    if (!invite || new Date(invite.expires_at) <= new Date()) return null;
    const dive = adminDive(invite.dive);
    if (!dive || dive.visibility === 'draft' || !dive.people_ids.includes(invite.person))
      return null;
    return { invite, dive };
  }

  function pageDive(n) {
    const base = publicDive(n) ?? adminDive(n);
    const dive = Object.fromEntries(
      Object.entries(base).filter(([key]) => !ADMIN_ONLY.includes(key) && key !== 'sign_requests'),
    );
    return {
      ...dive,
      private: null,
      prev_number: null,
      next_number: null,
      prev_site_name: null,
      next_site_name: null,
      same_day: [],
      day_index: null,
      buddy_notes: publicNotes(n),
    };
  }

  function publicNotes(n) {
    const people = adminDive(n)?.people_ids ?? [];
    return notesOf(n).filter((note) => note.public && people.includes(note.person));
  }

  const gone = [410, { detail: 'This sign link has expired' }];

  return {
    mails,
    publicNotes,

    /** The editor's record with every note and each buddy's request. */
    adminView(n, body) {
      return { ...body, buddy_notes: notesOf(n), sign_requests: requests(n) };
    },

    /** The public page's record with the public notes. */
    publicView(n, body) {
      return { ...body, buddy_notes: publicNotes(n) };
    },

    /** A form save: `buddy_notes` keeps the named notes with their `public`; people taken off go. */
    applyForm(n, input) {
      const people = input?.people_ids ?? adminDive(n)?.people_ids ?? [];
      let kept = notesOf(n).filter((note) => people.includes(note.person));
      if (Array.isArray(input?.buddy_notes)) {
        const wanted = new Map(input.buddy_notes.map((edit) => [edit.person, edit.public]));
        kept = kept
          .filter((note) => wanted.has(note.person))
          .map((note) => ({ ...note, public: wanted.get(note.person) === true }));
      }
      notes.set(n, kept);
      for (const [token, invite] of invites)
        if (invite.dive === n && !people.includes(invite.person)) invites.delete(token);
    },

    /** `[status, body]` for the owner's sign endpoints, undefined for any other request. */
    admin(method, path, body) {
      let match = /^\/admin\/dives\/(\d+)\/sign-requests$/.exec(path);
      if (match && method === 'POST') return requestSignatures(Number(match[1]), body);
      match = /^\/admin\/dives\/(\d+)\/sign-requests\/([^/]+)$/.exec(path);
      if (match && method === 'DELETE') {
        const found = inviteOf(Number(match[1]), decodeURIComponent(match[2]));
        if (!found) return [404, { detail: 'Not asked' }];
        invites.delete(found[0]);
        return [204, null];
      }
      match = /^\/admin\/dives\/(\d+)\/buddy-notes\/([^/]+)$/.exec(path);
      if (match && method === 'DELETE') {
        const n = Number(match[1]);
        const person = decodeURIComponent(match[2]);
        if (!notesOf(n).some((note) => note.person === person)) return [404, { detail: 'No note' }];
        notes.set(
          n,
          notesOf(n).filter((note) => note.person !== person),
        );
        return [204, null];
      }
      return undefined;
    },

    /** `[status, body]` for `GET`/`POST /dive/sign/{token}`, undefined for any other path. */
    sign(method, path, body) {
      const match = /^\/dive\/sign\/([^/]+)$/.exec(path);
      if (!match) return undefined;
      const link = live(decodeURIComponent(match[1]));
      if (!link) return gone;
      const { invite, dive } = link;
      const own = notesOf(dive.number).find((note) => note.person === invite.person) ?? null;
      if (method === 'GET')
        return [
          200,
          {
            state: invite.used_at || own ? 'used' : 'open',
            signer: { slug: invite.person, first_name: nameOf(invite.person) },
            expires_at: invite.expires_at,
            note: own,
            dive: pageDive(dive.number),
          },
        ];
      if (method !== 'POST') return [405, { detail: 'Method not allowed' }];
      if (invite.used_at || own) return [409, { detail: 'This dive is signed already' }];
      const clean = cleanNote(body);
      if (clean.error) return [422, { detail: [{ loc: ['body'], msg: clean.error }] }];
      const note = { person: invite.person, ...clean, signed_at: iso(new Date()) };
      notes.set(dive.number, [...notesOf(dive.number), note]);
      invite.used_at = iso(new Date());
      return [200, { note }];
    },
  };
}
