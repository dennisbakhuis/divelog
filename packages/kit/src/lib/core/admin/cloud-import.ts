/**
 * The Shearwater Cloud export import: the clock offset typed on the page, the preview's dive
 * rows with their checkboxes and "Belongs to" choices (a new draft, a log dive to add the
 * profile to, or the dive before it to join), the surface breaks a dive may be split at with the
 * parts that makes, and the query fields of the dry run and the commit.
 */
import type {
  ImportBreak,
  ImportCandidate,
  ImportDive,
  ImportPart,
  ImportResult,
} from '$lib/core/dive/types.js';
import { formatDate, formatDepth, pluralize } from '$lib/core/dive/format.js';
import { AdminApiError } from './client.js';

/** How to get the export, under the card's button. */
export const CLOUD_EXPORT_HELP =
  'In the Shearwater Cloud app, open the Profile tab and tap Export (*.db), save the file, ' +
  'then pick it here. The desktop dive_data.db and an account ZIP work too. If a short surface ' +
  'break did not end the dive on the computer, tick Split to log the parts as separate dives.';

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

/**
 * What a row becomes: imported as itself (`own`: a new draft, or the profile of the dive it
 * matched), joined to the dive before it (`join`), or linked to a log dive (its number).
 */
export type CloudChoice = 'own' | 'join' | number;

/** The "Belongs to" choices the owner made, by computer number; a row left out takes its default. */
export type CloudChoices = Record<number, CloudChoice>;

/** The "Belongs to" choices of split parts, by `614.2`; a part left out takes its default. */
export type CloudPartChoices = Record<string, CloudChoice>;

/** The breaks the owner ticked, by computer number; a row left out is split at the suggested ones. */
export type CloudSplits = Record<number, number[]>;

/** One option of a row's "Belongs to" select. */
export interface CloudOption {
  value: string;
  label: string;
}

/** The dive just before a row, from the same computer on the same day, that it may join. */
export interface CloudJoinable {
  computerNo: number;
  /** Minutes at the surface between the two, when the server knows. */
  surfaceMin: number | null;
}

/** What a row or a part may belong to: itself, the dive before it, or one of its candidates. */
interface Belonging {
  status: 'new' | 'attach' | 'error';
  eligible: boolean;
  /** The log dive it matches (attach) or the number it would get (new). */
  diveNumber: number | null;
  /** The log dives of that day a `new` one may belong to, nearest first. */
  candidates: ImportCandidate[];
  /** The candidate picked by default, or null. */
  suggested: number | null;
  /** The dive before it that it may join, or null. */
  joinable: CloudJoinable | null;
}

/** A surface break of a computer dive, where it may be split. */
export interface CloudBreak {
  /** Seconds into the dive: the break's id in `split`. */
  startS: number;
  suggested: boolean;
  /** `29 min · surfaced 10 min (11:48–11:58)`. */
  label: string;
}

/** One part of a split dive, as the dry run that cut it reported it. */
export interface CloudPart extends Belonging {
  /** `614.2`, its key in the part choices and the `link` value. */
  key: string;
  part: number;
  status: 'new' | 'attach';
  /** `Part 2 · 12:32 · 42.8 min · 13.2 m`. */
  title: string;
  /** Before any choice: `new draft #651` or `add profile to dive #612`. */
  outcome: string;
}

/** A dive of the export the preview lists: `new` and `attach` can be ticked, `error` cannot. */
export interface CloudRow extends Belonging {
  key: string;
  computerNo: number;
  /** Ticked by default: the server's `selected`. */
  selected: boolean;
  /** A new dive the server leaves unticked: older than the newest one the log has. */
  older: boolean;
  /** The corrected start, ISO 8601. */
  start: string;
  /** `Perdix AI`, or `Dive` without a model. */
  model: string;
  maxDepthM: number;
  durationMin: number;
  /** `Perdix AI #674`. */
  title: string;
  /** `8 Aug 2026 14:44 (computer 07:44)`. */
  when: string;
  /** `32.1 m, 58 min`. */
  facts: string;
  /** Before any choice: `new draft #651`, `add profile to dive #640`, `can't be read: …`. */
  outcome: string;
  /** The surface breaks it may be split at; empty for an unreadable dive. */
  breaks: CloudBreak[];
  /** The breaks it is split at with the current choices (see `applySplits`), in time order. */
  split: number[];
  /** The breaks the dry run cut it at, which its `parts` are of. */
  cut: number[];
  parts: CloudPart[];
}

export interface CloudPreview {
  /** Newest first. */
  rows: CloudRow[];
  /** Dives of the export that are in the log already, with their profile. */
  haveCount: number;
  /** Computer numbers ticked by default: the rows the server selected. */
  ticked: number[];
}

/** A break as its checkbox shows it. */
export interface CloudBreakView extends CloudBreak {
  checked: boolean;
}

/** A part as its sub-row shows it with the current choices. */
export interface CloudPartView {
  part: CloudPart;
  /** The value of its "Belongs to" select. */
  value: string;
  /** The select's options; it is shown only with more than one. */
  options: CloudOption[];
  /** `new draft #651`, `add profile to dive #612`. */
  outcome: string;
}

/** A row as the preview shows it with the current choices. */
export interface CloudRowView {
  row: CloudRow;
  /** The value of its "Belongs to" select. */
  value: string;
  /** The select's options; it is shown only with more than one. */
  options: CloudOption[];
  /** The first computer number of the group when the row is joined to the dive before it. */
  joinedTo: number | null;
  /** `Perdix AI #674`, or `Perdix AI #13 + #14, one dive` on the first row of a group. */
  title: string;
  when: string;
  /** The group's deepest depth and summed minutes on its first row. */
  facts: string;
  /** `new draft #651`, `add profile to dive #675`, `same dive as #13`, … */
  outcome: string;
  /** The whole row as one line, for the checkbox's name. */
  label: string;
  /** The breaks of its Split control; empty when it has none or is part of a join. */
  breaks: CloudBreakView[];
  /** Its parts when the preview shows the dive split as chosen. */
  parts: CloudPartView[];
}

const day = (iso: string) => iso.slice(0, 10);
const clock = (iso: string) => iso.slice(11, 16);
const facts = (depth: number, minutes: number) =>
  `${formatDepth(depth)}, ${Math.round(minutes)} min`;

function when(dive: ImportDive): string {
  const at = `${formatDate(day(dive.start))} ${clock(dive.start)}`;
  if (dive.computer_start.slice(0, 16) === dive.start.slice(0, 16)) return at;
  const computerDay =
    day(dive.computer_start) === day(dive.start) ? '' : `${formatDate(day(dive.computer_start))} `;
  return `${at} (computer ${computerDay}${clock(dive.computer_start)})`;
}

function outcome(dive: Pick<ImportDive, 'status' | 'dive_number' | 'error'>): string {
  if (dive.status === 'error') return `can't be read: ${dive.error ?? 'unknown error'}`;
  const n = dive.dive_number === null ? '' : ` #${dive.dive_number}`;
  return dive.status === 'attach'
    ? `add profile to ${n ? `dive${n}` : 'a logged dive'}`
    : `new draft${n}`;
}

/** `29 min · surfaced 10 min (11:48–11:58)`: minutes into the dive, how long, and when. */
export function breakLabel(brk: ImportBreak): string {
  return `${Math.round(brk.start_s / 60)} min · surfaced ${brk.minutes} min (${brk.start}–${brk.end})`;
}

const sameList = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** The `split` query value back to the breaks each dive was cut at, in time order. */
function cutsOf(split: string | undefined): Map<number, number[]> {
  const cuts = new Map<number, number[]>();
  for (const pair of (split ?? '').split(',').filter(Boolean)) {
    const [n, at] = pair.split('@').map(Number);
    cuts.set(
      n,
      [...(cuts.get(n) ?? []), at].sort((a, b) => a - b),
    );
  }
  return cuts;
}

function part(computerNo: number, p: ImportPart): CloudPart {
  const isNew = p.status === 'new';
  const candidates = isNew ? (p.candidates ?? []) : [];
  const suggested = isNew ? (p.suggested ?? null) : null;
  const minutes = Math.round(p.duration_min * 10) / 10;
  return {
    key: `${computerNo}.${p.part}`,
    part: p.part,
    status: p.status,
    eligible: true,
    diveNumber: p.dive_number,
    candidates,
    suggested: candidates.some((c) => c.number === suggested) ? suggested : null,
    joinable: null,
    title: `Part ${p.part} · ${clock(p.start)} · ${minutes} min · ${formatDepth(p.max_depth_m)}`,
    outcome: outcome({ status: p.status, dive_number: p.dive_number, error: null }),
  };
}

/** The dive before `dives[i]` from the same computer, when it is that day's and can be imported. */
function joinable(dives: ImportDive[], i: number): CloudJoinable | null {
  const dive = dives[i];
  const before = dives
    .slice(0, i)
    .reverse()
    .find((d) => d.serial === dive.serial);
  if (!before || dive.status === 'error' || day(before.start) !== day(dive.start)) return null;
  if (before.status === 'have' || before.status === 'error') return null;
  return { computerNo: before.computer_no, surfaceMin: dive.surface_before_min ?? null };
}

function row(
  dive: ImportDive & { status: CloudRow['status'] },
  join: CloudJoinable | null,
  cut: number[],
) {
  const model = dive.model ?? 'Dive';
  const isNew = dive.status === 'new';
  const eligible = dive.status !== 'error';
  const selected = eligible && (dive.selected ?? true);
  const candidates = isNew ? (dive.candidates ?? []) : [];
  const suggested = isNew ? (dive.suggested ?? null) : null;
  return {
    key: `${dive.serial}-${dive.computer_no}`,
    computerNo: dive.computer_no,
    status: dive.status,
    eligible,
    selected,
    older: isNew && !selected,
    start: dive.start,
    model,
    diveNumber: dive.dive_number,
    maxDepthM: dive.max_depth_m,
    durationMin: dive.duration_min,
    title: `${model} #${dive.computer_no}`,
    when: when(dive),
    facts: facts(dive.max_depth_m, dive.duration_min),
    outcome: outcome(dive),
    candidates,
    suggested: candidates.some((c) => c.number === suggested) ? suggested : null,
    joinable: join,
    breaks: eligible
      ? (dive.breaks ?? []).map((b) => ({
          startS: b.start_s,
          suggested: b.suggested ?? false,
          label: breakLabel(b),
        }))
      : [],
    split: [],
    cut: eligible ? cut : [],
    parts: eligible ? (dive.parts ?? []).map((p) => part(dive.computer_no, p)) : [],
  } satisfies CloudRow;
}

const listed = (dive: ImportDive): dive is ImportDive & { status: CloudRow['status'] } =>
  dive.status !== 'have';

/**
 * The preview of an export: its new, attach and unreadable dives newest first, the rest counted.
 * `split` is the value the dry run sent, so each row knows which breaks its parts are cut at.
 */
export function previewRows(result: ImportResult, split?: string): CloudPreview {
  const dives = [...(result.dives ?? [])].sort(
    (a, b) => a.start.localeCompare(b.start) || a.computer_no - b.computer_no,
  );
  const cuts = cutsOf(split);
  const rows = dives
    .map((dive, i) =>
      listed(dive) ? row(dive, joinable(dives, i), cuts.get(dive.computer_no) ?? []) : null,
    )
    .filter((r) => r !== null)
    .reverse();
  return {
    rows,
    haveCount: dives.length - rows.length,
    ticked: rows.filter((r) => r.eligible && r.selected).map((r) => r.computerNo),
  };
}

function allowed(row: Belonging, choice: CloudChoice | undefined): choice is CloudChoice {
  if (choice === 'own') return true;
  if (choice === 'join') return row.joinable !== null;
  return row.candidates.some((c) => c.number === choice);
}

const settle = (b: Belonging, chosen: CloudChoice | undefined): CloudChoice =>
  allowed(b, chosen) ? chosen : (b.suggested ?? 'own');

/** What a row becomes: the owner's choice when it still applies, else the suggestion or itself. */
export function choiceOf(row: CloudRow, choices: CloudChoices): CloudChoice {
  return settle(row, choices[row.computerNo]);
}

/** What a part becomes, as `choiceOf` for a row. */
export function partChoiceOf(part: CloudPart, choices: CloudPartChoices): CloudChoice {
  return settle(part, choices[part.key]);
}

/** A select value back to a choice: `own`, `join` or a log dive number. */
export function parseChoice(value: string): CloudChoice {
  return value === 'own' || value === 'join' ? value : Number(value);
}

/** `Dive #675 · 15:54 · Slijk-Ewijk · 26 min apart`, leaving out what the log does not have. */
export function candidateLabel(candidate: ImportCandidate): string {
  const apart = candidate.minutes_apart === null ? '' : `${candidate.minutes_apart} min apart`;
  return [`Dive #${candidate.number}`, candidate.time_in, candidate.site, apart]
    .filter(Boolean)
    .join(' · ');
}

/** `Same dive as #13 (surfaced 12 min)`. */
export function joinLabel(join: CloudJoinable): string {
  const gap = join.surfaceMin === null ? '' : ` (surfaced ${join.surfaceMin} min)`;
  return `Same dive as #${join.computerNo}${gap}`;
}

/**
 * The options of a row's or a part's "Belongs to" select: itself (a new draft, or the dive it
 * matched), the dive before it when it may join it, then the candidates. Empty for an unreadable
 * dive.
 */
export function rowOptions(row: Belonging): CloudOption[] {
  if (!row.eligible) return [];
  const own =
    row.status === 'new'
      ? 'New draft'
      : row.diveNumber === null
        ? 'The logged dive it matches'
        : `Dive #${row.diveNumber} (matched)`;
  return [
    { value: 'own', label: own },
    ...(row.joinable ? [{ value: 'join', label: joinLabel(row.joinable) }] : []),
    ...row.candidates.map((c) => ({ value: String(c.number), label: candidateLabel(c) })),
  ];
}

/** Each row's group, by computer number: the first computer number of the dive it ends up in. */
function heads(rows: CloudRow[], choices: CloudChoices): Map<number, number> {
  const head = new Map<number, number>();
  for (const row of [...rows].reverse()) {
    const before =
      row.joinable && choiceOf(row, choices) === 'join' ? row.joinable.computerNo : null;
    head.set(row.computerNo, before === null ? row.computerNo : head.get(before)!);
  }
  return head;
}

/** The dives the import makes, oldest first: each the computer numbers it joins, in start order. */
export function cloudGroups(rows: CloudRow[], choices: CloudChoices): number[][] {
  const head = heads(rows, choices);
  const groups = new Map<number, number[]>();
  for (const row of [...rows].reverse().filter((r) => r.eligible)) {
    const first = head.get(row.computerNo)!;
    groups.set(first, [...(groups.get(first) ?? []), row.computerNo]);
  }
  return [...groups.values()];
}

/** The `join` query value: `13+14,37+38+39`, or undefined when nothing is joined. */
export function joinParam(rows: CloudRow[], choices: CloudChoices): string | undefined {
  const joined = cloudGroups(rows, choices).filter((g) => g.length > 1);
  return joined.length ? joined.map((g) => g.join('+')).join(',') : undefined;
}

/** The parts the preview shows for a row: those of the dry run, when it cut the row as chosen. */
function partsOf(row: CloudRow): CloudPart[] {
  return row.split.length && sameList(row.split, row.cut) ? row.parts : [];
}

/**
 * The `link` query value: `673:675,614.2:612` for rows and parts of split rows that belong to a
 * log dive, or undefined.
 */
export function linkParam(
  rows: CloudRow[],
  choices: CloudChoices,
  partChoices: CloudPartChoices = {},
): string | undefined {
  const pairs = [...rows].reverse().flatMap((r) => {
    const linked: [string, CloudChoice][] = r.split.length
      ? partsOf(r).map((p) => [p.key, partChoiceOf(p, partChoices)])
      : [[String(r.computerNo), choiceOf(r, choices)]];
    return linked.flatMap(([key, choice]) =>
      typeof choice === 'number' ? [`${key}:${choice}`] : [],
    );
  });
  return pairs.length ? pairs.join(',') : undefined;
}

/** The `split` query value: `614@1740,614@3970`, or undefined when no row is split. */
export function splitParam(rows: CloudRow[]): string | undefined {
  const pairs = [...rows].reverse().flatMap((r) => r.split.map((at) => `${r.computerNo}@${at}`));
  return pairs.length ? pairs.join(',') : undefined;
}

/**
 * The rows with the breaks each is split at: the owner's ticks that still exist, else the
 * suggested ones. A row the owner joined, or that another row joins, takes no suggestion, and a
 * split row can neither join nor be joined, nor belong to a log dive as a whole.
 */
export function applySplits(
  rows: CloudRow[],
  splits: CloudSplits,
  choices: CloudChoices,
): CloudRow[] {
  const joined = new Set<number>();
  for (const row of rows)
    if (row.joinable && choices[row.computerNo] === 'join')
      joined.add(row.computerNo).add(row.joinable.computerNo);
  const splitOf = (row: CloudRow) => {
    const ids = row.breaks.map((b) => b.startS);
    const chosen = splits[row.computerNo];
    if (chosen) return ids.filter((at) => chosen.includes(at));
    return joined.has(row.computerNo)
      ? []
      : row.breaks.filter((b) => b.suggested).map((b) => b.startS);
  };
  const split = new Map(rows.map((r) => [r.computerNo, splitOf(r)]));
  return rows.map((row) => {
    const at = split.get(row.computerNo)!;
    if (at.length) return { ...row, split: at, joinable: null, candidates: [], suggested: null };
    const before = row.joinable && split.get(row.joinable.computerNo)?.length;
    return { ...row, split: [], joinable: before ? null : row.joinable };
  });
}

/** Whether a row is split differently from the dry run the preview shows: it needs another. */
export function needsSplitRun(rows: CloudRow[]): boolean {
  return rows.some((r) => !sameList(r.split, r.cut));
}

/** The splits after the owner ticks or unticks break `at` of `row` (a row of `applySplits`). */
export function chooseSplit(
  splits: CloudSplits,
  row: CloudRow,
  at: number,
  on: boolean,
): CloudSplits {
  const rest = row.split.filter((s) => s !== at);
  return { ...splits, [row.computerNo]: (on ? [...rest, at] : rest).sort((a, b) => a - b) };
}

/** The owner's split ticks after a new dry run: those of breaks that still exist. */
export function carrySplits(rows: CloudRow[], splits: CloudSplits): CloudSplits {
  const kept: CloudSplits = {};
  for (const row of rows) {
    const chosen = splits[row.computerNo];
    if (chosen && row.breaks.length)
      kept[row.computerNo] = chosen.filter((at) => row.breaks.some((b) => b.startS === at));
  }
  return kept;
}

/** The parts' choices after a new dry run: kept while the dive is cut at the same breaks. */
export function carryPartChoices(
  rows: CloudRow[],
  before: CloudRow[],
  choices: CloudPartChoices,
): CloudPartChoices {
  const cuts = new Map(before.map((r) => [r.computerNo, r.cut]));
  const kept: CloudPartChoices = {};
  for (const row of rows) {
    if (!sameList(row.cut, cuts.get(row.computerNo) ?? [])) continue;
    for (const p of row.parts) if (allowed(p, choices[p.key])) kept[p.key] = choices[p.key];
  }
  return kept;
}

/** Whether row `n` is imported: a joined row follows the first row of its group. */
export function isTicked(
  rows: CloudRow[],
  choices: CloudChoices,
  ticked: number[],
  n: number,
): boolean {
  return ticked.includes(heads(rows, choices).get(n) ?? n);
}

/**
 * The choices and ticks after the owner picks `value` for row `n`. The row keeps its tick when it
 * leaves a group, and a ticked row that joins a group ticks the group.
 */
export function chooseRow(
  rows: CloudRow[],
  choices: CloudChoices,
  ticked: number[],
  n: number,
  value: string,
): { choices: CloudChoices; ticked: number[] } {
  const on = isTicked(rows, choices, ticked, n);
  const next = { ...choices, [n]: parseChoice(value) };
  const first = heads(rows, next).get(n) ?? n;
  const kept = setTick(ticked, n, on);
  return { choices: next, ticked: on && first !== n ? setTick(kept, first, true) : kept };
}

/** The owner's choices after a new dry run: those that still apply; the rest take the new default. */
export function carryChoices(rows: CloudRow[], choices: CloudChoices): CloudChoices {
  const kept: CloudChoices = {};
  for (const row of rows) {
    const chosen = choices[row.computerNo];
    if (row.eligible && allowed(row, chosen)) kept[row.computerNo] = chosen;
  }
  return kept;
}

/** A part's sub-row with the current choices. */
function partView(p: CloudPart, choices: CloudPartChoices): CloudPartView {
  const choice = partChoiceOf(p, choices);
  return {
    part: p,
    value: String(choice),
    options: rowOptions(p),
    outcome: typeof choice === 'number' ? `add profile to dive #${choice}` : p.outcome,
  };
}

/** The rows as the preview shows them with the current choices, newest first. */
export function viewRows(
  rows: CloudRow[],
  choices: CloudChoices,
  partChoices: CloudPartChoices = {},
): CloudRowView[] {
  const head = heads(rows, choices);
  const byNo = new Map(rows.map((r) => [r.computerNo, r]));
  const groups = new Map(
    cloudGroups(rows, choices).map((g) => [g[0], g.map((n) => byNo.get(n)!)] as const),
  );
  return rows.map((row) => {
    const choice = choiceOf(row, choices);
    const first = head.get(row.computerNo)!;
    const group = groups.get(row.computerNo) ?? [row];
    const joined = group.length > 1;
    const title = joined
      ? `${row.model} ${group.map((r) => `#${r.computerNo}`).join(' + ')}, one dive`
      : row.title;
    const groupFacts = joined
      ? facts(
          Math.max(...group.map((r) => r.maxDepthM)),
          group.reduce((sum, r) => sum + r.durationMin, 0),
        )
      : row.facts;
    const said =
      first !== row.computerNo
        ? `same dive as #${first}`
        : row.split.length
          ? `split into ${pluralize(row.split.length + 1, 'dive')}`
          : typeof choice === 'number'
            ? `add profile to dive #${choice}`
            : row.outcome;
    const alone = first === row.computerNo && !joined;
    return {
      row,
      value: String(choice),
      options: rowOptions(row),
      joinedTo: first === row.computerNo ? null : first,
      title,
      when: row.when,
      facts: groupFacts,
      outcome: said,
      label: `${title}, ${row.when}, ${groupFacts}: ${said}`,
      breaks: alone ? row.breaks.map((b) => ({ ...b, checked: row.split.includes(b.startS) })) : [],
      parts: partsOf(row).map((p) => partView(p, partChoices)),
    };
  });
}

/** The preview's lists: the dives to import, the older ones not in the log, the unreadable ones. */
export function cloudSections(views: CloudRowView[]): {
  current: CloudRowView[];
  older: CloudRowView[];
  broken: CloudRowView[];
} {
  return {
    current: views.filter((v) => v.row.eligible && !v.row.older),
    older: views.filter((v) => v.row.older),
    broken: views.filter((v) => !v.row.eligible),
  };
}

/**
 * The ticks after a new dry run: rows the preview had keep their tick; rows it did not have take
 * the server's `selected`.
 */
export function carryTicks(rows: CloudRow[], before: CloudRow[], ticked: number[]): number[] {
  const known = new Map(
    before.filter((r) => r.eligible).map((r) => [r.computerNo, ticked.includes(r.computerNo)]),
  );
  return rows
    .filter((r) => r.eligible && (known.get(r.computerNo) ?? r.selected))
    .map((r) => r.computerNo);
}

/** `ticked` with `n` ticked or unticked. */
export function setTick(ticked: number[], n: number, on: boolean): number[] {
  const rest = ticked.filter((t) => t !== n);
  return on ? [...rest, n] : rest;
}

/** How many log dives each group makes: one, or one per part of a split dive. */
function made(rows: CloudRow[], groups: number[][]): number {
  const split = new Map(rows.map((r) => [r.computerNo, r.split.length]));
  return groups.reduce((sum, g) => sum + 1 + (split.get(g[0]) ?? 0), 0);
}

/**
 * How many of the dives the import would make are ticked; a joined group counts once, a split
 * dive once per part.
 */
export function tickedCount(
  rows: CloudRow[],
  ticked: number[],
  choices: CloudChoices = {},
): number {
  return made(
    rows,
    cloudGroups(rows, choices).filter((g) => ticked.includes(g[0])),
  );
}

/**
 * The `only` query value: the computer numbers imported, every member of a ticked group
 * included, ascending and comma separated; undefined when every eligible row is (the default).
 */
export function onlyParam(
  rows: CloudRow[],
  ticked: number[],
  choices: CloudChoices = {},
): string | undefined {
  const head = heads(rows, choices);
  const eligible = rows.filter((r) => r.eligible).map((r) => r.computerNo);
  const chosen = eligible.filter((n) => ticked.includes(head.get(n)!)).sort((a, b) => a - b);
  return chosen.length === eligible.length ? undefined : chosen.join(',');
}

/** The query fields of `POST /admin/import/shearwater-cloud`; defaults are left out. */
export function cloudFields({
  dryRun,
  only,
  link,
  join,
  split,
  clockOffsetMin,
}: {
  dryRun: boolean;
  only?: string;
  link?: string;
  join?: string;
  split?: string;
  clockOffsetMin: number;
}): Record<string, string> {
  const fields: Record<string, string> = {};
  if (dryRun) fields.dry_run = 'true';
  if (only !== undefined) fields.only = only;
  if (link) fields.link = link;
  if (join) fields.join = join;
  if (split) fields.split = split;
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

/** `2 of 3 dives selected`; a joined group is one dive, a split one a dive per part. */
export function selectionLine(
  preview: CloudPreview,
  ticked: number[],
  choices: CloudChoices = {},
): string {
  const dives = made(preview.rows, cloudGroups(preview.rows, choices));
  return `${tickedCount(preview.rows, ticked, choices)} of ${pluralize(dives, 'dive')} selected`;
}

/** The screen reader's line once a preview is ready, naming the dives it splits. */
export function previewAnnouncement(
  result: ImportResult,
  preview: CloudPreview,
  ticked: number[] = preview.ticked,
  choices: CloudChoices = {},
): string {
  const outcome = nothingNew(preview)
    ? 'Nothing new to import'
    : selectionLine(preview, ticked, choices);
  const split = preview.rows
    .filter((r) => r.split.length)
    .map((r) => `${r.title} split into ${pluralize(r.split.length + 1, 'dive')}`)
    .reverse();
  return [...cloudLines(result, preview), outcome, ...split].join('; ');
}
