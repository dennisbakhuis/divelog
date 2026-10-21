/**
 * The Shearwater Cloud export import: the clock offset typed on the page, the preview's dive
 * rows with their checkboxes, and the query fields of the dry run and the commit.
 */
import type { ImportDive, ImportResult } from '$lib/core/dive/types.js';
import { formatDate, formatDepth, pluralize } from '$lib/core/dive/format.js';
import { AdminApiError } from './client.js';

/**
 * How to get the export, under the card's button. One place, so the app's exact menu path can
 * be added once it is known.
 */
export const CLOUD_EXPORT_HELP =
  'Export your dive database from the Shearwater Cloud app (a .db file) and pick it here. ' +
  'The desktop dive_data.db and an account ZIP work too.';

/** The furthest a computer clock may be corrected, either way: one day. */
export const MAX_CLOCK_OFFSET_MIN = 1440;

const HOURS = '(?:hours?|hrs?|h)';
const MINUTES = '(?:minutes?|mins?|m)';
const COLON = /^(\d{1,2}):([0-5]\d)$/;
const PLAIN = /^\d+(?:[.,]\d+)?$/;
const UNITS = new RegExp(`^(?:(\\d+(?:[.,]\\d+)?)\\s*${HOURS})?\\s*(?:(\\d+)\\s*(${MINUTES})?)?$`);

const number = (text: string) => Number(text.replace(',', '.'));

/** The magnitude of an offset without its sign, in minutes, or null when it does not parse. */
function magnitude(body: string): number | null {
  const colon = COLON.exec(body);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  if (PLAIN.test(body)) return number(body) * 60;
  const units = UNITS.exec(body);
  if (!units || (!units[1] && !units[2])) return null;
  return (units[1] ? number(units[1]) * 60 : 0) + (units[2] ? Number(units[2]) : 0);
}

/**
 * A clock offset as typed, in whole minutes: `+7 h`, `-7h`, `7` (hours), `+1:30`, `-30 min`,
 * `90 min`, `+1 h 30 min`; empty means 0. Null when it does not parse or lies beyond a day.
 */
export function parseClockOffset(text: string): number | null {
  const trimmed = text.trim().toLowerCase().replace(/−/g, '-');
  if (!trimmed) return 0;
  const sign = trimmed[0] === '-' ? -1 : 1;
  const body = trimmed.replace(/^[+-]\s*/, '');
  if (!body) return null;
  const minutes = magnitude(body);
  if (minutes === null) return null;
  const total = Math.round(sign * minutes) + 0;
  return Math.abs(total) <= MAX_CLOCK_OFFSET_MIN ? total : null;
}

/** An offset the way the field shows it: `+7 h`, `-30 min`, `+1 h 30 min`, `0`. */
export function formatClockOffset(min: number): string {
  if (!min) return '0';
  const sign = min < 0 ? '-' : '+';
  const hours = Math.floor(Math.abs(min) / 60);
  const minutes = Math.abs(min) % 60;
  const parts = [hours ? `${hours} h` : '', minutes ? `${minutes} min` : ''].filter(Boolean);
  return `${sign}${parts.join(' ')}`;
}

/** A dive of the export the preview lists: `new` and `attach` can be ticked, `error` cannot. */
export interface CloudRow {
  key: string;
  computerNo: number;
  status: 'new' | 'attach' | 'error';
  eligible: boolean;
  /** `Perdix AI #674`. */
  title: string;
  /** `8 Aug 2026 14:44 (computer 07:44)`. */
  when: string;
  /** `32.1 m, 58 min`. */
  facts: string;
  /** `new draft #651`, `profile for #640`, `can't be read: …`. */
  outcome: string;
  /** The whole row as one line, for the checkbox's name. */
  label: string;
}

export interface CloudPreview {
  /** Newest first. */
  rows: CloudRow[];
  /** Dives of the export that are in the log already, with their profile. */
  haveCount: number;
  /** Computer numbers ticked by default: every `new` and `attach` dive. */
  ticked: number[];
}

const day = (iso: string) => iso.slice(0, 10);
const clock = (iso: string) => iso.slice(11, 16);

function when(dive: ImportDive): string {
  const at = `${formatDate(day(dive.start))} ${clock(dive.start)}`;
  if (dive.computer_start.slice(0, 16) === dive.start.slice(0, 16)) return at;
  const computerDay =
    day(dive.computer_start) === day(dive.start) ? '' : `${formatDate(day(dive.computer_start))} `;
  return `${at} (computer ${computerDay}${clock(dive.computer_start)})`;
}

function outcome(dive: ImportDive): string {
  if (dive.status === 'error') return `can't be read: ${dive.error ?? 'unknown error'}`;
  const n = dive.dive_number === null ? '' : ` #${dive.dive_number}`;
  return dive.status === 'attach' ? `profile for${n || ' a logged dive'}` : `new draft${n}`;
}

function row(dive: ImportDive & { status: CloudRow['status'] }): CloudRow {
  const title = `${dive.model ?? 'Dive'} #${dive.computer_no}`;
  const facts = `${formatDepth(dive.max_depth_m)}, ${Math.round(dive.duration_min)} min`;
  const parts = { title, when: when(dive), facts, outcome: outcome(dive) };
  return {
    key: `${dive.serial}-${dive.computer_no}`,
    computerNo: dive.computer_no,
    status: dive.status,
    eligible: dive.status !== 'error',
    ...parts,
    label: `${title}, ${parts.when}, ${facts}: ${parts.outcome}`,
  };
}

const listed = (dive: ImportDive): dive is ImportDive & { status: CloudRow['status'] } =>
  dive.status !== 'have';

/** The preview of an export: its new, attach and unreadable dives newest first, the rest counted. */
export function previewRows(result: ImportResult): CloudPreview {
  const dives = result.dives ?? [];
  const rows = dives
    .filter(listed)
    .sort((a, b) => b.start.localeCompare(a.start) || b.computer_no - a.computer_no)
    .map(row);
  return {
    rows,
    haveCount: dives.length - rows.length,
    ticked: rows.filter((r) => r.eligible).map((r) => r.computerNo),
  };
}

/**
 * The ticks after a new dry run: rows that were eligible before and left unticked stay
 * unticked; everything else eligible is ticked.
 */
export function carryTicks(rows: CloudRow[], before: CloudRow[], ticked: number[]): number[] {
  const unticked = new Set(
    before.filter((r) => r.eligible && !ticked.includes(r.computerNo)).map((r) => r.computerNo),
  );
  return rows.filter((r) => r.eligible && !unticked.has(r.computerNo)).map((r) => r.computerNo);
}

/** `ticked` with `n` ticked or unticked. */
export function setTick(ticked: number[], n: number, on: boolean): number[] {
  const rest = ticked.filter((t) => t !== n);
  return on ? [...rest, n] : rest;
}

/** How many of the eligible rows are ticked. */
export function tickedCount(rows: CloudRow[], ticked: number[]): number {
  return rows.filter((r) => r.eligible && ticked.includes(r.computerNo)).length;
}

/**
 * The `only` query value: the ticked computer numbers, ascending and comma separated, or
 * undefined when every eligible row is ticked (the server's default).
 */
export function onlyParam(rows: CloudRow[], ticked: number[]): string | undefined {
  const eligible = rows.filter((r) => r.eligible).map((r) => r.computerNo);
  const chosen = eligible.filter((n) => ticked.includes(n)).sort((a, b) => a - b);
  return chosen.length === eligible.length ? undefined : chosen.join(',');
}

/** The query fields of `POST /admin/import/shearwater-cloud`; defaults are left out. */
export function cloudFields({
  dryRun,
  only,
  clockOffsetMin,
}: {
  dryRun: boolean;
  only?: string;
  clockOffsetMin: number;
}): Record<string, string> {
  const fields: Record<string, string> = {};
  if (dryRun) fields.dry_run = 'true';
  if (only !== undefined) fields.only = only;
  if (clockOffsetMin) fields.clock_offset_min = String(clockOffsetMin);
  return fields;
}

/** What the page says when an upload fails; a 413 may come from a proxy without a message. */
export function cloudErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof AdminApiError)) return fallback;
  if (err.status === 413) return 'The export is too large to upload.';
  return err.message || fallback;
}

/** The preview's summary: the dives in the export and how many the log has already. */
export function cloudLines(result: ImportResult, preview: CloudPreview): string[] {
  const range =
    result.first_date && result.last_date
      ? result.first_date === result.last_date
        ? ` on ${result.first_date}`
        : ` from ${result.first_date} to ${result.last_date}`
      : '';
  return [
    `${pluralize(result.dives_in_file, 'dive')} in the export${range}`,
    `${pluralize(preview.haveCount, 'dive')} already in the log`,
  ];
}

/** Whether the export holds nothing to import: no `new` or `attach` dive. */
export function nothingNew(preview: CloudPreview): boolean {
  return !preview.rows.some((r) => r.eligible);
}

/** `2 of 3 dives selected`. */
export function selectionLine(preview: CloudPreview, ticked: number[]): string {
  const eligible = preview.rows.filter((r) => r.eligible).length;
  return `${tickedCount(preview.rows, ticked)} of ${pluralize(eligible, 'dive')} selected`;
}

/** The screen reader's line once a preview is ready. */
export function previewAnnouncement(result: ImportResult, preview: CloudPreview): string {
  const outcome = nothingNew(preview)
    ? 'Nothing new to import'
    : selectionLine(preview, preview.ticked);
  return [...cloudLines(result, preview), outcome].join('; ');
}
