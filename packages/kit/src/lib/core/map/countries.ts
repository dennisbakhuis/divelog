/**
 * Which country a point lies in, for the site picker: the world-atlas 1:50m
 * outlines (loaded on first use; ~750 kB, so never in the initial bundle) with
 * d3-geo's spherical point-in-polygon, and the nearest coast for a point at sea.
 * The atlas keys its features by ISO 3166 numeric code; the table below turns
 * that into the alpha-3 code sites carry.
 */
import { geoArea, geoBounds, geoContains, geoDistance, type ExtendedFeature } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

/** A country by its ISO codes and English name. */
export interface CountryCode {
  iso3: string;
  iso2: string;
  name: string;
}

/** Where a point fell: the country, and whether inside it or off its coast. */
export interface CountryHit extends CountryCode {
  /** True when the point lies within the outline; false for a point at sea near it. */
  inside: boolean;
  /** Distance to the outline in kilometres; 0 inside. */
  distance_km: number;
}

const TABLE =
  '004:AFG:AF:Afghanistan|008:ALB:AL:Albania|010:ATA:AQ:Antarctica|012:DZA:DZ:Algeria|' +
  '016:ASM:AS:American Samoa|020:AND:AD:Andorra|024:AGO:AO:Angola|028:ATG:AG:Antigua and Barbuda|' +
  '031:AZE:AZ:Azerbaijan|032:ARG:AR:Argentina|036:AUS:AU:Australia|040:AUT:AT:Austria|' +
  '044:BHS:BS:Bahamas|048:BHR:BH:Bahrain|050:BGD:BD:Bangladesh|051:ARM:AM:Armenia|' +
  '052:BRB:BB:Barbados|056:BEL:BE:Belgium|060:BMU:BM:Bermuda|064:BTN:BT:Bhutan|068:BOL:BO:Bolivia|' +
  '070:BIH:BA:Bosnia and Herzegovina|072:BWA:BW:Botswana|076:BRA:BR:Brazil|084:BLZ:BZ:Belize|' +
  '086:IOT:IO:British Indian Ocean Territory|090:SLB:SB:Solomon Islands|' +
  '092:VGB:VG:Virgin Islands, British|096:BRN:BN:Brunei|100:BGR:BG:Bulgaria|104:MMR:MM:Myanmar|' +
  '108:BDI:BI:Burundi|112:BLR:BY:Belarus|116:KHM:KH:Cambodia|120:CMR:CM:Cameroon|' +
  '124:CAN:CA:Canada|132:CPV:CV:Cabo Verde|136:CYM:KY:Cayman Islands|' +
  '140:CAF:CF:Central African Republic|144:LKA:LK:Sri Lanka|148:TCD:TD:Chad|152:CHL:CL:Chile|' +
  '156:CHN:CN:China|158:TWN:TW:Taiwan|170:COL:CO:Colombia|174:COM:KM:Comoros|178:COG:CG:Congo|' +
  '180:COD:CD:Congo, The Democratic Republic of the|184:COK:CK:Cook Islands|188:CRI:CR:Costa Rica|' +
  '191:HRV:HR:Croatia|192:CUB:CU:Cuba|196:CYP:CY:Cyprus|203:CZE:CZ:Czechia|204:BEN:BJ:Benin|' +
  '208:DNK:DK:Denmark|212:DMA:DM:Dominica|214:DOM:DO:Dominican Republic|218:ECU:EC:Ecuador|' +
  '222:SLV:SV:El Salvador|226:GNQ:GQ:Equatorial Guinea|231:ETH:ET:Ethiopia|232:ERI:ER:Eritrea|' +
  '233:EST:EE:Estonia|234:FRO:FO:Faroe Islands|238:FLK:FK:Falkland Islands (Malvinas)|' +
  '239:SGS:GS:South Georgia and the South Sandwich Islands|242:FJI:FJ:Fiji|246:FIN:FI:Finland|' +
  '248:ALA:AX:Åland|250:FRA:FR:France|258:PYF:PF:French Polynesia|' +
  '260:ATF:TF:French Southern Territories|262:DJI:DJ:Djibouti|266:GAB:GA:Gabon|268:GEO:GE:Georgia|' +
  '270:GMB:GM:Gambia|275:PSE:PS:Palestine|276:DEU:DE:Germany|288:GHA:GH:Ghana|296:KIR:KI:Kiribati|' +
  '300:GRC:GR:Greece|304:GRL:GL:Greenland|308:GRD:GD:Grenada|316:GUM:GU:Guam|320:GTM:GT:Guatemala|' +
  '324:GIN:GN:Guinea|328:GUY:GY:Guyana|332:HTI:HT:Haiti|' +
  '334:HMD:HM:Heard Island and McDonald Islands|336:VAT:VA:Vatican|340:HND:HN:Honduras|' +
  '344:HKG:HK:Hong Kong|348:HUN:HU:Hungary|352:ISL:IS:Iceland|356:IND:IN:India|' +
  '360:IDN:ID:Indonesia|364:IRN:IR:Iran|368:IRQ:IQ:Iraq|372:IRL:IE:Ireland|376:ISR:IL:Israel|' +
  "380:ITA:IT:Italy|384:CIV:CI:Côte d'Ivoire|388:JAM:JM:Jamaica|392:JPN:JP:Japan|" +
  '398:KAZ:KZ:Kazakhstan|400:JOR:JO:Jordan|404:KEN:KE:Kenya|408:PRK:KP:North Korea|' +
  '410:KOR:KR:South Korea|414:KWT:KW:Kuwait|417:KGZ:KG:Kyrgyzstan|418:LAO:LA:Laos|' +
  '422:LBN:LB:Lebanon|426:LSO:LS:Lesotho|428:LVA:LV:Latvia|430:LBR:LR:Liberia|434:LBY:LY:Libya|' +
  '438:LIE:LI:Liechtenstein|440:LTU:LT:Lithuania|442:LUX:LU:Luxembourg|446:MAC:MO:Macao|' +
  '450:MDG:MG:Madagascar|454:MWI:MW:Malawi|458:MYS:MY:Malaysia|462:MDV:MV:Maldives|' +
  '466:MLI:ML:Mali|470:MLT:MT:Malta|478:MRT:MR:Mauritania|480:MUS:MU:Mauritius|484:MEX:MX:Mexico|' +
  '492:MCO:MC:Monaco|496:MNG:MN:Mongolia|498:MDA:MD:Moldova|499:MNE:ME:Montenegro|' +
  '500:MSR:MS:Montserrat|504:MAR:MA:Morocco|508:MOZ:MZ:Mozambique|512:OMN:OM:Oman|' +
  '516:NAM:NA:Namibia|520:NRU:NR:Nauru|524:NPL:NP:Nepal|528:NLD:NL:Netherlands|531:CUW:CW:Curaçao|' +
  '533:ABW:AW:Aruba|534:SXM:SX:Sint Maarten|540:NCL:NC:New Caledonia|548:VUT:VU:Vanuatu|' +
  '554:NZL:NZ:New Zealand|558:NIC:NI:Nicaragua|562:NER:NE:Niger|566:NGA:NG:Nigeria|' +
  '570:NIU:NU:Niue|574:NFK:NF:Norfolk Island|578:NOR:NO:Norway|' +
  '580:MNP:MP:Northern Mariana Islands|583:FSM:FM:Micronesia|584:MHL:MH:Marshall Islands|' +
  '585:PLW:PW:Palau|586:PAK:PK:Pakistan|591:PAN:PA:Panama|598:PNG:PG:Papua New Guinea|' +
  '600:PRY:PY:Paraguay|604:PER:PE:Peru|608:PHL:PH:Philippines|612:PCN:PN:Pitcairn|' +
  '616:POL:PL:Poland|620:PRT:PT:Portugal|624:GNB:GW:Guinea-Bissau|626:TLS:TL:Timor-Leste|' +
  '630:PRI:PR:Puerto Rico|634:QAT:QA:Qatar|642:ROU:RO:Romania|643:RUS:RU:Russia|646:RWA:RW:Rwanda|' +
  '652:BLM:BL:St-Barthélemy|654:SHN:SH:Saint Helena|659:KNA:KN:Saint Kitts and Nevis|' +
  '660:AIA:AI:Anguilla|662:LCA:LC:Saint Lucia|663:MAF:MF:St-Martin|' +
  '666:SPM:PM:Saint Pierre and Miquelon|670:VCT:VC:Saint Vincent and the Grenadines|' +
  '674:SMR:SM:San Marino|678:STP:ST:São Tomé and Principe|682:SAU:SA:Saudi Arabia|' +
  '686:SEN:SN:Senegal|688:SRB:RS:Serbia|690:SYC:SC:Seychelles|694:SLE:SL:Sierra Leone|' +
  '702:SGP:SG:Singapore|703:SVK:SK:Slovakia|704:VNM:VN:Vietnam|705:SVN:SI:Slovenia|' +
  '706:SOM:SO:Somalia|710:ZAF:ZA:South Africa|716:ZWE:ZW:Zimbabwe|724:ESP:ES:Spain|' +
  '728:SSD:SS:South Sudan|729:SDN:SD:Sudan|732:ESH:EH:Western Sahara|740:SUR:SR:Suriname|' +
  '748:SWZ:SZ:eSwatini|752:SWE:SE:Sweden|756:CHE:CH:Switzerland|760:SYR:SY:Syria|' +
  '762:TJK:TJ:Tajikistan|764:THA:TH:Thailand|768:TGO:TG:Togo|776:TON:TO:Tonga|' +
  '780:TTO:TT:Trinidad and Tobago|784:ARE:AE:United Arab Emirates|788:TUN:TN:Tunisia|' +
  '792:TUR:TR:Turkey|795:TKM:TM:Turkmenistan|796:TCA:TC:Turks and Caicos Islands|' +
  '800:UGA:UG:Uganda|804:UKR:UA:Ukraine|807:MKD:MK:Macedonia|818:EGY:EG:Egypt|' +
  '826:GBR:GB:United Kingdom|831:GGY:GG:Guernsey|832:JEY:JE:Jersey|833:IMN:IM:Isle of Man|' +
  '834:TZA:TZ:Tanzania|840:USA:US:United States of America|850:VIR:VI:Virgin Islands, U.S.|' +
  '854:BFA:BF:Burkina Faso|858:URY:UY:Uruguay|860:UZB:UZ:Uzbekistan|862:VEN:VE:Venezuela|' +
  '876:WLF:WF:Wallis and Futuna|882:WSM:WS:Samoa|887:YEM:YE:Yemen|894:ZMB:ZM:Zambia';

/** `numeric → codes`, from the table above. */
export const ATLAS_COUNTRIES: ReadonlyMap<string, CountryCode> = new Map(
  TABLE.split('|').map((row) => {
    const [numeric, iso3, iso2, name] = row.split(':');
    return [numeric, { iso3, iso2, name }];
  }),
);

/** Atlas features without a numeric id, by their atlas name. */
const UNNUMBERED: Record<string, CountryCode> = {
  Kosovo: { iso3: 'XKX', iso2: 'XK', name: 'Kosovo' },
  'N. Cyprus': { iso3: 'CYP', iso2: 'CY', name: 'Cyprus' },
  Somaliland: { iso3: 'SOM', iso2: 'SO', name: 'Somalia' },
  'Indian Ocean Ter.': { iso3: 'AUS', iso2: 'AU', name: 'Australia' },
  'Siachen Glacier': { iso3: 'IND', iso2: 'IN', name: 'India' },
};

/** Bonaire, Sint Eustatius and Saba: part of the Netherlands outline, a code of their own. */
const CARIBBEAN_NETHERLANDS: CountryCode = { iso3: 'BES', iso2: 'BQ', name: 'Bonaire' };

/** The codes of an atlas feature, by numeric id or, for the few without one, by name. */
export function atlasCountry(id: string | number | undefined, name = ''): CountryCode | null {
  if (id !== undefined && id !== null && id !== '') {
    const code = ATLAS_COUNTRIES.get(String(id).padStart(3, '0'));
    if (code) return code;
  }
  return UNNUMBERED[name] ?? null;
}

/** The codes for an alpha-3 code, or null when the atlas has no such country. */
export function countryByIso3(iso3: string | null | undefined): CountryCode | null {
  const key = (iso3 ?? '').trim().toUpperCase();
  if (!key) return null;
  for (const code of ATLAS_COUNTRIES.values()) if (code.iso3 === key) return code;
  for (const code of [...Object.values(UNNUMBERED), CARIBBEAN_NETHERLANDS])
    if (code.iso3 === key) return code;
  return null;
}

type Props = { name?: string };
type Position = number[];
/** The GeoJSON geometry shapes the atlas holds, loosely: only polygons carry vertices. */
type Geometry = { type: string; coordinates?: unknown; geometries?: Geometry[] };
type CountryFeature = ExtendedFeature & { id?: string | number; properties: Props | null };
type CountryCollection = { features: readonly unknown[] };

/** One outline with its bounds, so most of the world is skipped by a box test. */
export interface IndexedCountry {
  code: CountryCode;
  feature: CountryFeature;
  /** [[west, south], [east, north]] in degrees; west > east across the antimeridian. */
  bounds: [[number, number], [number, number]];
}

/** Index a feature collection (the atlas, or a small one in tests). */
export function indexCountries(collection: CountryCollection): IndexedCountry[] {
  const out: IndexedCountry[] = [];
  for (const f of collection.features as CountryFeature[]) {
    const code = atlasCountry(f.id, f.properties?.name ?? '');
    if (!code) continue;
    out.push({ code, feature: f, bounds: geoBounds(f) as IndexedCountry['bounds'] });
  }
  return out;
}

let loading: Promise<IndexedCountry[]> | null = null;

/** The 1:50m outlines, imported on first use and kept. */
export function loadCountries(): Promise<IndexedCountry[]> {
  loading ??= import('world-atlas/countries-50m.json', { with: { type: 'json' } }).then((mod) => {
    const topo = mod.default as unknown as Topology<{ countries: GeometryCollection<Props> }>;
    return indexCountries(feature(topo, topo.objects.countries));
  });
  return loading;
}

const EARTH_KM = 6371;

function inBox(c: IndexedCountry, lat: number, lon: number, padDeg: number): boolean {
  const [[w, s], [e, n]] = c.bounds;
  if (lat < s - padDeg || lat > n + padDeg) return false;
  const pad = padDeg / Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
  if (w <= e) return lon >= w - pad && lon <= e + pad;
  return lon >= w - pad || lon <= e + pad;
}

function rings(geometry: Geometry | null): Position[][] {
  if (!geometry) return [];
  switch (geometry.type) {
    case 'Polygon':
      return geometry.coordinates as Position[][];
    case 'MultiPolygon':
      return (geometry.coordinates as Position[][][]).flat();
    case 'GeometryCollection':
      return (geometry.geometries ?? []).flatMap(rings);
    default:
      return [];
  }
}

/**
 * Kilometres from a point to the nearest edge of an outline, in a local
 * equirectangular plane: exact enough for the tens of kilometres it is asked about.
 */
function distanceToOutline(geometry: Geometry | null, lat: number, lon: number): number {
  const kx = EARTH_KM * ((Math.PI / 180) * Math.cos((lat * Math.PI) / 180));
  const ky = EARTH_KM * (Math.PI / 180);
  const x = (p: Position) => (((p[0] - lon + 540) % 360) - 180) * kx;
  const y = (p: Position) => (p[1] - lat) * ky;
  let best = Infinity;
  for (const ring of rings(geometry)) {
    for (let i = 1; i < ring.length; i++) {
      const ax = x(ring[i - 1]);
      const ay = y(ring[i - 1]);
      const dx = x(ring[i]) - ax;
      const dy = y(ring[i]) - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/** The adjustments the atlas needs: the Caribbean islands of the Netherlands. */
function refine(code: CountryCode, lon: number): CountryCode {
  return code.iso3 === 'NLD' && lon < -30 ? CARIBBEAN_NETHERLANDS : code;
}

/**
 * The country at a point in `countries`: the outline containing it, else the
 * nearest outline within `maxKm` (a wreck or reef off the coast), else null.
 */
export function countryIn(
  countries: readonly IndexedCountry[],
  lat: number,
  lon: number,
  { maxKm = 60 }: { maxKm?: number } = {},
): CountryHit | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const point: [number, number] = [lon, lat];
  for (const c of countries) {
    if (inBox(c, lat, lon, 0) && geoContains(c.feature, point))
      return { ...refine(c.code, lon), inside: true, distance_km: 0 };
  }
  const padDeg = maxKm / 111;
  let best: { code: CountryCode; km: number } | null = null;
  for (const c of countries) {
    if (!inBox(c, lat, lon, padDeg)) continue;
    const km = distanceToOutline(c.feature.geometry as Geometry | null, lat, lon);
    if (km <= maxKm && (!best || km < best.km)) best = { code: c.code, km };
  }
  if (!best) return null;
  return {
    ...refine(best.code, lon),
    inside: false,
    distance_km: Math.round(best.km * 10) / 10,
  };
}

/** The country at a point, loading the outlines on first use. */
export async function countryAt(
  lat: number,
  lon: number,
  options: { maxKm?: number } = {},
): Promise<CountryHit | null> {
  return countryIn(await loadCountries(), lat, lon, options);
}

function polygons(geometry: Geometry | null): Position[][][] {
  if (!geometry) return [];
  switch (geometry.type) {
    case 'Polygon':
      return [geometry.coordinates as Position[][]];
    case 'MultiPolygon':
      return geometry.coordinates as Position[][][];
    case 'GeometryCollection':
      return (geometry.geometries ?? []).flatMap(polygons);
    default:
      return [];
  }
}

/** The largest polygon of a country's outlines: the mainland, not the overseas islands. */
async function mainland(iso3: string): Promise<ExtendedFeature | null> {
  const key = iso3.toUpperCase();
  let best: { feature: ExtendedFeature; area: number } | null = null;
  for (const c of await loadCountries()) {
    if (c.code.iso3 !== key) continue;
    for (const coordinates of polygons(c.feature.geometry as Geometry | null)) {
      const feature: ExtendedFeature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates },
      };
      const raw = geoArea(feature);
      const area = Math.min(raw, 4 * Math.PI - raw);
      if (!best || area > best.area) best = { feature, area };
    }
  }
  return best?.feature ?? null;
}

/**
 * The bounds of a country for "zoom to country": [west, south, east, north] of its
 * largest polygon (mainland France, not French Guiana and Réunion with it), or null.
 * West is greater than east when the polygon crosses the antimeridian.
 */
export async function countryBounds(
  iso3: string,
): Promise<[number, number, number, number] | null> {
  const land = await mainland(iso3);
  if (!land) return null;
  const [[w, s], [e, n]] = geoBounds(land);
  return [w, s, e, n];
}

/** Kilometres across the largest polygon of a country (corner to corner), or null. */
export async function countrySpanKm(iso3: string): Promise<number | null> {
  const bounds = await countryBounds(iso3);
  if (!bounds) return null;
  const [w, s, e, n] = bounds;
  return geoDistance([w, s], [e, n]) * EARTH_KM;
}

/** A region as the picker needs it: its country and the positions of its sites. */
export interface RegionLike {
  id: string;
  country: string | null;
  map_sites?: readonly { lat: number | null; lon: number | null }[];
  sites?: readonly { lat: number | null; lon: number | null }[];
}

/**
 * The region of `country` nearest to a point, measured to the closest of its
 * sites and no further than `maxKm`. A country with a single region that has
 * no placed sites yet gets that region, unless `spanKm` (the country's size, from
 * {@link countrySpanKm}) says the country is too large for "it is the only one"
 * to put the pin within `maxKm` of it; otherwise null.
 */
export function regionNearest<R extends RegionLike>(
  regions: readonly R[],
  country: string | null | undefined,
  lat: number,
  lon: number,
  { maxKm = 300, spanKm = null }: { maxKm?: number; spanKm?: number | null } = {},
): R | null {
  const key = (country ?? '').toUpperCase();
  if (!key) return null;
  const own = regions.filter((r) => (r.country ?? '').toUpperCase() === key);
  let best: { region: R; km: number } | null = null;
  for (const region of own) {
    const points = [...(region.map_sites ?? []), ...(region.sites ?? [])];
    for (const p of points) {
      if (p.lat === null || p.lon === null) continue;
      const km = geoDistance([lon, lat], [p.lon, p.lat]) * EARTH_KM;
      if (km <= maxKm && (!best || km < best.km)) best = { region, km };
    }
  }
  if (best) return best.region;
  const placed = (r: R) =>
    [...(r.map_sites ?? []), ...(r.sites ?? [])].some((p) => p.lat !== null && p.lon !== null);
  const small = spanKm === null || spanKm <= maxKm;
  return small && own.length === 1 && !placed(own[0]) ? own[0] : null;
}
