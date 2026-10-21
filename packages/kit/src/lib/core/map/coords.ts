/**
 * Coordinates as people paste them: "52.09, 5.12", "5.12 52.09" (the order told
 * by the ranges), "52°05'24"N 5°07'12"E", "N 52° 5.4' E 5° 7.2'", "20 30 00 N 87 18 00 W",
 * a map link with "!3d52.09!4d5.12", "@52.09,5.12", "q=52.09,5.12" or "mlat=…&mlon=…".
 * All end up as decimal degrees.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const inRange = ({ lat, lon }: LatLon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Whether a latitude and longitude are numbers within range. */
export function validLatLon(lat: unknown, lon: unknown): boolean {
  return typeof lat === 'number' && typeof lon === 'number' && inRange({ lat, lon });
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const PIN = new RegExp(String.raw`!3d${NUM}!4d${NUM}`);
const QUERY = new RegExp(String.raw`[?&](?:q|query|ll)=(?:loc:)?\s*${NUM}\s*,\s*${NUM}(?![\d.])`);
const AT = new RegExp(String.raw`@${NUM},\s*${NUM}`);
const LAT = new RegExp(String.raw`[?&#]m?lat=${NUM}`);
const LON = new RegExp(String.raw`[?&#]m?(?:lon|lng)=${NUM}`);
const OSM_MAP = new RegExp(String.raw`[#&]map=\d+(?:\.\d+)?/${NUM}/${NUM}`);
const GEOJSON = new RegExp(String.raw`"coordinates"\s*:\s*\[\s*${NUM}\s*,\s*${NUM}`);

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/**
 * The position in a map link or a GeoJSON snippet. A Google place link carries the pin in
 * `!3d…!4d…` and only the view centre after the `@`, so the pin is read first.
 */
function fromLink(raw: string): LatLon | null {
  const text = decoded(raw);
  const json = GEOJSON.exec(text);
  if (json) return { lat: Number(json[2]), lon: Number(json[1]) };
  const match = PIN.exec(text) ?? QUERY.exec(text) ?? AT.exec(text);
  if (match) return { lat: Number(match[1]), lon: Number(match[2]) };
  const lat = LAT.exec(text);
  const lon = LON.exec(text);
  if (lat && lon) return { lat: Number(lat[1]), lon: Number(lon[1]) };
  const map = OSM_MAP.exec(text);
  if (map) return { lat: Number(map[1]), lon: Number(map[2]) };
  return null;
}

type Unit = 'deg' | 'min' | 'sec';
type Num = { value: number; negative: boolean; unit: Unit | null };
type Run = { nums: Num[]; lead?: string; trail?: string };
type Item = { kind: 'run'; run: Run } | { kind: 'hemi'; letter: string } | { kind: 'break' };
type Part = { value: number; axis: 'lat' | 'lon' | null };
type Group = { nums: Num[]; letter?: string; marked: boolean; run: Run };

const TOKEN = /(\s+)|([-+\u2212]?\d+(?:\.\d+)?)|(''|["″”])|(['′’])|([°º˚])|([A-Za-z]+)|([\s\S])/gu;

function hemisphere(letter: string | undefined): { axis: 'lat' | 'lon'; sign: 1 | -1 } | null {
  switch ((letter ?? '').toUpperCase()) {
    case 'N':
      return { axis: 'lat', sign: 1 };
    case 'S':
      return { axis: 'lat', sign: -1 };
    case 'E':
      return { axis: 'lon', sign: 1 };
    case 'W':
      return { axis: 'lon', sign: -1 };
    default:
      return null;
  }
}

function wordUnit(word: string, run: Run | null, digitNext: boolean): Unit | null {
  const lower = word.toLowerCase();
  if (lower === 'deg') return 'deg';
  if (lower === 'min') return 'min';
  if (lower === 'sec') return 'sec';
  const last = run?.nums.at(-1);
  if (!run || !last || last.unit) return null;
  if (word === 'd' && digitNext) return 'deg';
  if (word === 'm' && digitNext) return 'min';
  if (word === 's' && run.nums.some((n) => n.unit === 'min')) return 'sec';
  return null;
}

/** The text as runs of numbers with their units, hemisphere letters, and breaks. */
function tokenize(text: string): Item[] | null {
  const items: Item[] = [];
  let run: Run | null = null;
  for (const m of text.matchAll(TOKEN)) {
    if (m[1]) continue;
    if (m[2]) {
      const raw = m[2].replace('\u2212', '-');
      if (!run) {
        run = { nums: [] };
        items.push({ kind: 'run', run });
      }
      run.nums.push({ value: Number(raw), negative: raw.startsWith('-'), unit: null });
      continue;
    }
    const digitNext = /^\s*\d/.test(text.slice((m.index ?? 0) + m[0].length));
    const symbol: Unit | null = m[3] ? 'sec' : m[4] ? 'min' : m[5] ? 'deg' : null;
    const unit = symbol ?? (m[6] ? wordUnit(m[6], run, digitNext) : null);
    if (unit) {
      const last = run?.nums.at(-1);
      if (!last || last.unit) return null;
      last.unit = unit;
      continue;
    }
    run = null;
    if (m[6]?.length === 1 && hemisphere(m[6])) items.push({ kind: 'hemi', letter: m[6] });
    else items.push({ kind: 'break' });
  }
  return items;
}

/**
 * Hang each hemisphere letter on a run: after it ("52.09N 5.12E") when the text starts
 * with a number, before it ("N52.09 E5.12") when it starts with a letter. A letter with
 * no number after it trails the run before it in either style. False on a stray letter.
 */
function attachLetters(items: Item[]): boolean {
  const first = items.find((i) => i.kind !== 'break');
  const leading = first?.kind === 'hemi';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'hemi') continue;
    const before = items[i - 1]?.kind === 'run' ? (items[i - 1] as { run: Run }).run : null;
    const after = items[i + 1]?.kind === 'run' ? (items[i + 1] as { run: Run }).run : null;
    if (before && !before.trail && (!leading || !after)) before.trail = item.letter;
    else if (after && !after.lead) after.lead = item.letter;
    else return false;
  }
  return true;
}

/**
 * Split a run into coordinates. A number joins the one before as its minutes or seconds
 * when the run is marked (a unit or a hemisphere letter), it is not negative, the one
 * before is whole, and it is below 60 or carries the matching unit. Null when a unit is
 * out of place or minutes or seconds reach 60.
 */
function groupsOf(run: Run): Group[] | null {
  const signal = !!(run.lead || run.trail || run.nums.some((n) => n.unit));
  const groups: Group[] = [];
  for (const num of run.nums) {
    const cur = groups.at(-1);
    const prev = cur?.nums.at(-1);
    const slot = cur ? cur.nums.length : 0;
    const joins =
      signal &&
      cur &&
      prev &&
      slot < 3 &&
      num.unit !== 'deg' &&
      !num.negative &&
      prev.unit !== 'sec' &&
      Number.isInteger(prev.value) &&
      (num.unit === 'min' ? slot === 1 : num.unit === 'sec' ? true : num.value < 60);
    if (joins) {
      if (num.value >= 60) return null;
      if (num.unit === 'sec' && slot === 1)
        cur.nums.push({ value: 0, negative: false, unit: 'min' });
      cur.nums.push(num);
      continue;
    }
    if (num.unit === 'min' || num.unit === 'sec') return null;
    groups.push({ nums: [num], marked: false, run });
  }
  if (!groups.length) return groups;
  const head = groups[0];
  const tail = groups[groups.length - 1];
  if (run.lead && run.trail && head === tail) return null;
  if (run.lead) head.letter = run.lead;
  if (run.trail) tail.letter = run.trail;
  for (const g of groups) g.marked = !!g.letter || g.nums.some((n) => n.unit);
  return groups;
}

function partOf(group: Group): Part {
  const [degrees, minutes, seconds] = group.nums.map((n) => n.value);
  const negative = group.nums[0].negative;
  const magnitude = Math.abs(degrees) + (minutes ?? 0) / 60 + (seconds ?? 0) / 3600;
  const hemi = hemisphere(group.letter);
  const sign = hemi ? hemi.sign : negative ? -1 : 1;
  return { value: sign * magnitude, axis: hemi?.axis ?? null };
}

/**
 * The two coordinates written with degree marks or hemisphere letters; `undefined` when
 * fewer than two numbers carry them (plain decimals, "24°C at 12.15, -68.28"), null when
 * they do not read as one position (numbers left over beside them, minutes past 60, a
 * stray letter).
 */
function dmsPair(text: string): LatLon | null | undefined {
  const items = tokenize(text);
  if (!items) return null;
  const runs = items.flatMap((i) => (i.kind === 'run' ? [i.run] : []));
  const marked =
    items.some((i) => i.kind === 'hemi') || runs.some((r) => r.nums.some((n) => n.unit));
  if (!marked) return undefined;
  if (!attachLetters(items)) return null;
  const groups: Group[] = [];
  for (const run of runs) {
    const found = groupsOf(run);
    if (!found) return null;
    groups.push(...found);
  }
  if (groups.length === 2) return pair(partOf(groups[0]), partOf(groups[1]));
  const picked = groups.filter((g) => g.marked);
  if (picked.length < 2) return undefined;
  if (picked.length > 2) return null;
  const near = new Set(picked.map((g) => g.run));
  items.forEach((item, i) => {
    if (item.kind !== 'hemi') return;
    for (const side of [items[i - 1], items[i + 1]]) if (side?.kind === 'run') near.add(side.run);
  });
  if (groups.some((g) => !g.marked && near.has(g.run))) return null;
  return pair(partOf(picked[0]), partOf(picked[1]));
}

function pair(a: Part, b: Part): LatLon | null {
  if (a.axis && b.axis) {
    if (a.axis === b.axis) return null;
    return a.axis === 'lat' ? { lat: a.value, lon: b.value } : { lat: b.value, lon: a.value };
  }
  if (a.axis === 'lon' || b.axis === 'lat') return { lat: b.value, lon: a.value };
  if (Math.abs(a.value) > 90 && Math.abs(b.value) <= 90) return { lat: b.value, lon: a.value };
  return { lat: a.value, lon: b.value };
}

const round = (value: number) => Math.round(value * 1e7) / 1e7;

/**
 * The position in a pasted text, or null when it holds none. Latitude comes first
 * unless hemisphere letters or the ranges say otherwise ("5.12, 52.09" stays lat 5.12,
 * but "120.5, 10.2" is read as lon, lat); only GeoJSON's `"coordinates": [lon, lat]` is
 * read longitude first. Text with degree marks or hemisphere letters must hold exactly
 * one position: anything left over gives null rather than a guess.
 */
export function parseLatLon(input: string): LatLon | null {
  const text = input.trim();
  if (!text) return null;
  let found = fromLink(text);
  if (!found) {
    const dms = dmsPair(text);
    if (dms === null) return null;
    if (dms) found = dms;
  }
  if (!found) {
    const plain =
      /(-?\d{1,3}\.\d+)\s*[,;\s/]\s*(-?\d{1,3}\.\d+)/.exec(text) ??
      /^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s/]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/.exec(text);
    if (plain)
      found = pair(
        { value: Number(plain[1]), axis: null },
        { value: Number(plain[2]), axis: null },
      );
  }
  if (!found || !inRange(found)) return null;
  return { lat: round(found.lat), lon: round(found.lon) };
}

/** "52.090000, 5.120000": the form a paste field and a copy button use. */
export function formatLatLon(lat: number, lon: number, digits = 6): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

/** Metres between two points on a sphere; for "120 m away" hints. */
export function metresBetween(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "120 m" below a kilometre, "3.4 km" beyond. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/**
 * The pin moved by one arrow-key press: a tenth of the visible span at `zoom`
 * (roughly 15 m at zoom 16), larger with Shift.
 */
export function nudge(
  { lat, lon }: LatLon,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  zoom: number,
  big = false,
): LatLon {
  const step = ((360 / 2 ** zoom) * (big ? 1 : 0.1)) / 4;
  const lonStep = step / Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
  const next = { lat, lon };
  if (key === 'ArrowUp') next.lat = Math.min(90, lat + step);
  if (key === 'ArrowDown') next.lat = Math.max(-90, lat - step);
  if (key === 'ArrowLeft') next.lon = ((lon - lonStep + 540) % 360) - 180;
  if (key === 'ArrowRight') next.lon = ((lon + lonStep + 540) % 360) - 180;
  return { lat: round(next.lat), lon: round(next.lon) };
}
