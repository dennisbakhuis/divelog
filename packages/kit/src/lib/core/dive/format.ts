/** Formatting helpers shared by the dive pages and the front-page tile. */

export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatHours(totalMinutes: number): string {
  return `${(totalMinutes / 60).toFixed(totalMinutes % 60 === 0 ? 0 : 1)} h`;
}

export function formatDepth(metres: number | null | undefined): string {
  if (metres === null || metres === undefined) return '—';
  return `${metres.toFixed(metres % 1 === 0 ? 0 : 1)} m`;
}

export function formatTemp(celsius: number | null | undefined): string {
  if (celsius === null || celsius === undefined) return '—';
  return `${Math.round(celsius)} °C`;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateFormatter.format(new Date(`${iso}T00:00:00`));
}

export function formatLongDate(iso: string): string {
  return longDateFormatter.format(new Date(`${iso}T00:00:00`));
}

export function formatTime(hms: string | null | undefined): string {
  if (!hms) return '';
  return hms.slice(0, 5);
}

/** Regional-indicator flag for an ISO-3166 alpha-2 code; empty for unknowns. */
export function flagEmoji(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX') return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function gasLabel(
  gas: string,
  o2: number | null | undefined,
  he: number | null | undefined,
): string {
  if (gas === 'trimix') return `Trimix ${o2 ?? '?'}/${he ?? '?'}`;
  if (gas === 'nitrox') return `Nitrox ${o2 ?? 32}`;
  if (gas === 'oxygen') return 'Oxygen';
  return 'Air';
}

export function modeLabel(mode: string): string {
  return { OC: 'Open circuit', CCR: 'Rebreather', sidemount: 'Sidemount' }[mode] ?? mode;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** `1` → `1st`, `12` → `12th`, `22` → `22nd`. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

const monthYearFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

/** `2005-07-31` → `Jul 2005`. */
export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return '—';
  return monthYearFormatter.format(new Date(`${iso}T00:00:00`));
}

/**
 * The location line for a site: `name, area`, or just the area when the area
 * already starts with the site's name ("Slijk-Ewijk, Gelderland").
 */
export function siteLocation(name: string, area: string | null | undefined): string {
  if (!area) return name;
  if (area.toLowerCase().startsWith(name.toLowerCase())) return area;
  return `${name}, ${area}`;
}

/**
 * True for a body that only says where the record came from
 * ("from dive computer (record #674); never logged on paper; …") rather than
 * telling a story. Those render as a muted provenance line.
 */
export function isProvenance(body: string | null | undefined): boolean {
  const text = (body ?? '').trim();
  return /^from dive computer\b/i.test(text) && !text.includes('\n');
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * A date range as compact as it reads: `29 Sep 2024`, `6–22 Feb 2026`,
 * `25 Feb – 10 Mar 2025`, `30 Dec 2009 – 2 Jan 2010`.
 */
export function formatDateRange(start: string, end: string): string {
  const [y0, m0, d0] = start.slice(0, 10).split('-').map(Number);
  const [y1, m1, d1] = end.slice(0, 10).split('-').map(Number);
  const month = (m: number) => MONTHS_SHORT[m - 1];
  if (y0 !== y1) return `${d0} ${month(m0)} ${y0} – ${d1} ${month(m1)} ${y1}`;
  if (m0 !== m1) return `${d0} ${month(m0)} – ${d1} ${month(m1)} ${y1}`;
  if (d0 !== d1) return `${d0}–${d1} ${month(m1)} ${y1}`;
  return `${d0} ${month(m0)} ${y0}`;
}
