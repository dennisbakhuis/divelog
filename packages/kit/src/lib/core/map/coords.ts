/**
 * Coordinates as people paste them: "52.09, 5.12", "5.12 52.09" (the order told
 * by the ranges), "52°05'24"N 5°07'12"E", "N 52° 5.4' E 5° 7.2'", a map link with
 * "@52.09,5.12" or "mlat=…&mlon=…". All end up as decimal degrees.
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

function fromUrl(text: string): LatLon | null {
  const at = /@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/.exec(text);
  if (at) return { lat: Number(at[1]), lon: Number(at[2]) };
  const lat = /[?&#]m?lat=(-?\d{1,3}(?:\.\d+)?)/.exec(text);
  const lon = /[?&#]m?(?:lon|lng)=(-?\d{1,3}(?:\.\d+)?)/.exec(text);
  if (lat && lon) return { lat: Number(lat[1]), lon: Number(lon[1]) };
  const map = /[#&]map=\d+(?:\.\d+)?\/(-?\d{1,3}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)/.exec(text);
  if (map) return { lat: Number(map[1]), lon: Number(map[2]) };
  return null;
}

type Part = { value: number; axis: 'lat' | 'lon' | null };

const PART =
  /([NSEW])?\s*(-?\d{1,3}(?:\.\d+)?)\s*(?:°|º|˚|\bdeg\b|d(?=\s*\d))\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:'|′|’|\bmin\b|m(?=\s*\d)))?\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|''|”|\bsec\b|s\b))?\s*([NSEW])?|([NSEW])\s*(-?\d{1,3}(?:\.\d+)?)|(-?\d{1,3}(?:\.\d+)?)\s*([NSEW])\b/gi;

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

function dmsParts(text: string): Part[] {
  const parts: Part[] = [];
  for (const m of text.matchAll(PART)) {
    let degrees: number;
    let minutes = 0;
    let seconds = 0;
    let letter: string | undefined;
    if (m[2] !== undefined) {
      degrees = Number(m[2]);
      minutes = m[3] ? Number(m[3]) : 0;
      seconds = m[4] ? Number(m[4]) : 0;
      letter = m[1] ?? m[5];
    } else if (m[7] !== undefined) {
      degrees = Number(m[7]);
      letter = m[6];
    } else {
      degrees = Number(m[8]);
      letter = m[9];
    }
    if (minutes >= 60 || seconds >= 60) return [];
    const negative = degrees < 0 || Object.is(degrees, -0);
    const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600;
    const hemi = hemisphere(letter);
    const sign = hemi ? hemi.sign : negative ? -1 : 1;
    parts.push({ value: sign * magnitude, axis: hemi?.axis ?? null });
  }
  return parts;
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
 * The position in a pasted text, or null when it holds none. Latitude comes
 * first unless hemisphere letters or the ranges say otherwise ("5.12, 52.09"
 * stays lat 5.12, but "120.5, 10.2" is read as lon, lat).
 */
export function parseLatLon(input: string): LatLon | null {
  const text = input.trim();
  if (!text) return null;
  let found = fromUrl(text);
  if (!found) {
    const parts = dmsParts(text);
    if (parts.length === 2) found = pair(parts[0], parts[1]);
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
