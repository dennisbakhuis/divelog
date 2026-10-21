import type { DiveAdmin, Tank, TankGas } from '$lib/core/dive/types.js';
import type { DiveMapAnnotation } from '$lib/core/dive/sitemap.js';
import type { CylinderPreset, DivelogConfig, GasPreset } from '$lib/core/dive/config.js';
import { todayLocal } from '$lib/core/dive/format.js';

/** Canonical tags a dive can carry; the paper log's own words stay in `types_raw`. */
export const DIVE_TAGS = [
  'cave',
  'cavern',
  'mine',
  'wreck',
  'night',
  'drift',
  'deco',
  'dpv',
  'boat',
  'training',
  'stage',
] as const;

export type DiveInput = {
  number: number;
  title: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  /** Required by the API; `null` until typed, so a new dive never saves a made-up value. */
  duration_min: number | null;
  max_depth_m: number | null;
  avg_depth_m: number | null;
  water_temp_c: number | null;
  surface_temp_c: number | null;
  air_temp_c: number | null;
  thermocline_m: number | null;
  visibility_m: number | null;
  visibility_raw: string | null;
  site_id: string | null;
  section: string | null;
  trip_id: string | null;
  tags: string[];
  types_raw: string | null;
  gas: string | null;
  o2_pct: number | null;
  o2_measured_pct: number | null;
  he_pct: number | null;
  gas_raw: string | null;
  mode: string;
  suit: string | null;
  weights_kg: number | null;
  cylinder: string | null;
  pressure_in_bar: number | null;
  pressure_out_bar: number | null;
  tanks: Tank[];
  safety_stop_min: number | null;
  surface_interval: string | null;
  conditions: string | null;
  difficulty: string | null;
  course: string | null;
  rating: number | null;
  gear_setup_id: string | null;
  guide: string | null;
  operator: string | null;
  buddy_raw: string | null;
  buddy_role: string | null;
  body_md: string;
  notes_nl: string | null;
  visibility: 'public' | 'private' | 'draft';
  people_ids: string[];
  cover_attachment_id: string | null;
  computer: number[];
  flags: string[];
  sketch: string | null;
  map_annotation: DiveMapAnnotation | null;
};

/** The editable input a stored dive corresponds to, for PUT round-trips. */
export function diveToInput(dive: DiveAdmin): DiveInput {
  return {
    number: dive.number,
    title: dive.title,
    date: dive.date,
    time_in: dive.time_in,
    time_out: dive.time_out,
    duration_min: dive.duration_min,
    max_depth_m: dive.max_depth_m,
    avg_depth_m: dive.avg_depth_m,
    water_temp_c: dive.water_temp_c,
    surface_temp_c: dive.surface_temp_c,
    air_temp_c: dive.air_temp_c,
    thermocline_m: dive.thermocline_m,
    visibility_m: dive.visibility_m,
    visibility_raw: dive.visibility_raw,
    site_id: dive.site_id,
    section: dive.section,
    trip_id: dive.trip_id,
    tags: [...dive.tags],
    types_raw: dive.types_raw,
    gas: dive.gas,
    o2_pct: dive.o2_pct,
    o2_measured_pct: dive.o2_measured_pct,
    he_pct: dive.he_pct,
    gas_raw: dive.gas_raw,
    mode: dive.mode,
    suit: dive.suit,
    weights_kg: dive.weights_kg,
    cylinder: dive.cylinder,
    pressure_in_bar: dive.pressure_in_bar,
    pressure_out_bar: dive.pressure_out_bar,
    tanks: dive.tanks.length ? dive.tanks.map((t) => ({ ...t })) : legacyTanks(dive),
    safety_stop_min: dive.safety_stop_min,
    surface_interval: dive.surface_interval,
    conditions: dive.conditions,
    difficulty: dive.difficulty,
    course: dive.course,
    rating: dive.rating,
    gear_setup_id: dive.gear_setup_id,
    guide: dive.guide,
    operator: dive.private?.operator ?? null,
    buddy_raw: dive.private?.buddy_raw ?? null,
    buddy_role: dive.private?.buddy_role ?? null,
    body_md: dive.body_md,
    notes_nl: dive.notes_nl,
    visibility: dive.visibility,
    people_ids: [...dive.people_ids],
    cover_attachment_id: dive.cover_attachment_id,
    computer: [...dive.computer],
    flags: [...(dive.private?.flags ?? [])],
    sketch: dive.private?.sketch ?? null,
    map_annotation: dive.map_annotation,
  };
}

/** A blank dive: today's local date and nothing assumed about depth, time or gas. */
export function emptyDiveInput(number: number): DiveInput {
  return {
    number,
    title: '',
    date: todayLocal(),
    time_in: null,
    time_out: null,
    duration_min: null,
    max_depth_m: null,
    avg_depth_m: null,
    water_temp_c: null,
    surface_temp_c: null,
    air_temp_c: null,
    thermocline_m: null,
    visibility_m: null,
    visibility_raw: null,
    site_id: null,
    section: null,
    trip_id: null,
    tags: [],
    types_raw: null,
    gas: null,
    o2_pct: null,
    o2_measured_pct: null,
    he_pct: null,
    gas_raw: null,
    mode: 'OC',
    suit: null,
    weights_kg: null,
    cylinder: null,
    pressure_in_bar: null,
    pressure_out_bar: null,
    tanks: [],
    safety_stop_min: null,
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
    people_ids: [],
    cover_attachment_id: null,
    computer: [],
    flags: [],
    sketch: null,
    map_annotation: null,
  };
}

/** Empty strings from form fields become nulls; numeric strings become numbers. */
/** Fields the API wants as a string, so an empty one stays '' rather than becoming null. */
const REQUIRED_TEXT = new Set(['title', 'body_md']);

export function cleanInput(form: DiveInput): DiveInput {
  const out = { ...form } as Record<string, unknown>;
  for (const [key, value] of Object.entries(out)) {
    if (value === '' && !REQUIRED_TEXT.has(key)) out[key] = null;
  }
  const numeric = [
    'duration_min',
    'max_depth_m',
    'avg_depth_m',
    'water_temp_c',
    'surface_temp_c',
    'air_temp_c',
    'thermocline_m',
    'visibility_m',
    'o2_pct',
    'o2_measured_pct',
    'he_pct',
    'weights_kg',
    'pressure_in_bar',
    'pressure_out_bar',
    'safety_stop_min',
    'rating',
  ];
  for (const key of numeric) {
    const value = out[key];
    if (typeof value === 'string') out[key] = value.trim() === '' ? null : Number(value);
  }
  const tankNumeric = [
    'volume_l',
    'o2_pct',
    'o2_measured_pct',
    'he_pct',
    'pressure_in_bar',
    'pressure_out_bar',
  ] as const;
  out.tanks = (out.tanks as Tank[])
    .filter((t) => !isBlankTank(t))
    .map((t) => {
      const tank: Record<string, unknown> = { ...t, cylinder: t.cylinder.trim() };
      for (const key of tankNumeric) {
        const value = tank[key];
        if (typeof value === 'string') tank[key] = value.trim() === '' ? null : Number(value);
      }
      return tank as unknown as Tank;
    });
  if (isEmptyAnnotation(out.map_annotation as DiveMapAnnotation | null)) out.map_annotation = null;
  return out as DiveInput;
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

/**
 * A tank row the owner never filled: no cylinder, volume or pressure. The gas and role
 * always hold a value, so they do not count; such a row is left out of the save.
 */
export function isBlankTank(tank: Tank): boolean {
  return (
    isEmptyValue(tank.cylinder) &&
    isEmptyValue(tank.volume_l) &&
    isEmptyValue(tank.o2_measured_pct) &&
    isEmptyValue(tank.pressure_in_bar) &&
    isEmptyValue(tank.pressure_out_bar)
  );
}

/** An annotation that marks nothing: no route, track, turn or pin, and no note. */
export function isEmptyAnnotation(annotation: DiveMapAnnotation | null | undefined): boolean {
  if (!annotation) return true;
  return (
    !annotation.route?.length &&
    !annotation.path?.length &&
    !annotation.pins?.length &&
    !annotation.turn &&
    !(annotation.note ?? '').trim()
  );
}

/** Perdix dive numbers typed as free text, e.g. "457, 458". */
export function parseComputer(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * The single-gas fields the server derives from the first back-gas tank; the form never sends
 * them, so a dive without tanks is stored with an unknown gas rather than a guessed one.
 */
export const DERIVED_GAS_FIELDS = [
  'gas',
  'o2_pct',
  'o2_measured_pct',
  'he_pct',
  'cylinder',
  'pressure_in_bar',
  'pressure_out_bar',
] as const satisfies readonly (keyof DiveInput)[];

export type DivePayload = Omit<DiveInput, (typeof DERIVED_GAS_FIELDS)[number]>;

/** What the form would save: the cleaned input with the computer numbers parsed. */
export function formPayload(form: DiveInput, computerText: string): DivePayload {
  const out: Partial<DiveInput> = { ...cleanInput(form), computer: parseComputer(computerText) };
  for (const key of DERIVED_GAS_FIELDS) delete out[key];
  return out as DivePayload;
}

/** Fields the form does not edit; a save takes them from the stored dive as it is now. */
export const LIVE_FIELDS = [
  'cover_attachment_id',
  'flags',
] as const satisfies readonly (keyof DiveInput)[];

export type LiveFields = Pick<DiveInput, (typeof LIVE_FIELDS)[number]>;

/**
 * The fields of the current stored dive that a save must not roll back: the cover (set from the
 * attachments while the form is open) and the private flags. A new dive starts with none.
 */
export function liveFields(dive: DiveAdmin | null): LiveFields {
  return {
    cover_attachment_id: dive?.cover_attachment_id ?? null,
    flags: [...(dive?.private?.flags ?? [])],
  };
}

/** The body a save sends: the form's payload over the live fields of the stored dive. */
export function savePayload(
  form: DiveInput,
  computerText: string,
  dive: DiveAdmin | null,
): DivePayload {
  return { ...formPayload(form, computerText), ...liveFields(dive) };
}

/** A comparable fingerprint of the form; unequal fingerprints mean unsaved changes. */
export function formSnapshot(form: DiveInput, computerText: string): string {
  return JSON.stringify(formPayload(form, computerText));
}

/**
 * The parts of the previous dive a new one can start from, as the "Same as previous dive"
 * chips offer them: where and with whom, the kit, and the trip.
 */
export const TEMPLATE_GROUPS = {
  site: {
    label: 'Site & buddies',
    fields: ['site_id', 'section', 'people_ids', 'tags', 'guide', 'operator'],
  },
  kit: {
    label: 'Tanks & kit',
    fields: ['tanks', 'gear_setup_id', 'mode', 'suit', 'weights_kg'],
  },
  trip: { label: 'Trip', fields: ['trip_id'] },
} as const satisfies Record<string, { label: string; fields: readonly (keyof DiveInput)[] }>;

export type TemplateGroup = keyof typeof TEMPLATE_GROUPS;

/** Every field a template carries, over all groups. */
export const TEMPLATE_FIELDS = [
  ...TEMPLATE_GROUPS.site.fields,
  ...TEMPLATE_GROUPS.kit.fields,
  ...TEMPLATE_GROUPS.trip.fields,
] as const;

export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export type DiveTemplate = Pick<DiveInput, TemplateField>;

function pickTemplate(input: DiveInput): DiveTemplate {
  return Object.fromEntries(TEMPLATE_FIELDS.map((key) => [key, input[key]])) as DiveTemplate;
}

/** The part of a stored dive a new dive can start from. */
export function diveTemplate(dive: DiveAdmin): DiveTemplate {
  return pickTemplate(diveToInput(dive));
}

/** A dive as the API's input shape: only `number`, `date`, depth and duration are certain. */
export type DiveInLike = {
  number: number;
  date: string;
  duration_min?: number | null;
  max_depth_m?: number | null;
} & { [K in keyof DiveInput]?: unknown };

/**
 * The form a dive in the API's input shape (the template's `previous`) corresponds to:
 * missing fields take the blank form's value, tanks get every column.
 */
export function inputFromDiveIn(dive: DiveInLike): DiveInput {
  const blank = emptyDiveInput(dive.number);
  const out = { ...blank } as Record<string, unknown>;
  for (const key of Object.keys(blank) as (keyof DiveInput)[]) {
    const value = dive[key];
    if (value !== undefined) out[key] = value;
  }
  const tanks = Array.isArray(dive.tanks) ? (dive.tanks as Partial<Tank>[]) : [];
  out.tanks = tanks.map((t) => ({ ...emptyTankRow(), ...t }));
  for (const key of ['tags', 'people_ids', 'computer', 'flags'] as const)
    out[key] = Array.isArray(out[key]) ? [...(out[key] as unknown[])] : [];
  return out as DiveInput;
}

/** The template a dive in the API's input shape offers. */
export function templateFromDiveIn(dive: DiveInLike): DiveTemplate {
  return pickTemplate(inputFromDiveIn(dive));
}

function emptyTankRow(): Tank {
  return {
    cylinder: '',
    volume_l: null,
    gas: 'air',
    o2_pct: null,
    o2_measured_pct: null,
    he_pct: null,
    pressure_in_bar: null,
    pressure_out_bar: null,
    role: 'back',
  };
}

let blankForm: DiveInput | null = null;

/**
 * Whether a form field still holds nothing the owner chose: null, an empty string or list,
 * or the blank form's own default (open circuit, public).
 */
export function isBlank(key: keyof DiveInput, value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  blankForm ??= emptyDiveInput(0);
  return key !== 'number' && key !== 'date' && value === blankForm[key];
}

/** The fields of `fields` a template would fill: blank in the form, set in the template. */
export function templateFills(
  form: DiveInput,
  template: DiveTemplate,
  fields: readonly TemplateField[] = TEMPLATE_FIELDS,
): TemplateField[] {
  return fields.filter((key) => isBlank(key, form[key]) && !isBlank(key, template[key]));
}

/**
 * The form with the template's `fields` copied into the blank ones; anything the owner
 * typed or picked stays as it is.
 */
export function applyTemplate(
  form: DiveInput,
  template: DiveTemplate,
  fields: readonly TemplateField[] = TEMPLATE_FIELDS,
): DiveInput {
  const out = { ...form } as Record<string, unknown>;
  for (const key of templateFills(form, template, fields)) {
    const value = template[key];
    out[key] =
      key === 'tanks'
        ? (value as Tank[]).map((t) => ({ ...t }))
        : Array.isArray(value)
          ? [...value]
          : value;
  }
  return out as DiveInput;
}

/** The kit side of a gear setup: the tanks, suit and weights it is usually dived with. */
export type SetupTemplate = {
  id: string;
  tanks?: Tank[] | null;
  suit?: string | null;
  weights_kg?: number | null;
};

/** Whether a setup carries any template field to fill a dive from. */
export function setupHasTemplate(setup: SetupTemplate | null | undefined): boolean {
  return !!setup && (!!setup.tanks?.length || !!setup.suit || setup.weights_kg != null);
}

/**
 * "Use gear setup": the setup's tanks, suit and weights replace the form's (an explicit
 * choice, so set values are overwritten); fields the setup leaves empty stay as typed.
 */
export function applyGearSetup(form: DiveInput, setup: SetupTemplate): DiveInput {
  return {
    ...form,
    gear_setup_id: setup.id,
    tanks: setup.tanks?.length ? setup.tanks.map((t) => ({ ...t })) : form.tanks,
    suit: setup.suit || form.suit,
    weights_kg: setup.weights_kg ?? form.weights_kg,
  };
}

/** Minutes of a `HH:MM` time, or null when it is not one. */
export function minutesOf(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Longest dive past midnight; a time out further before the time in is a typing slip. */
export const MAX_OVERNIGHT_MIN = 6 * 60;

/** Whether time out lies before time in by more than a dive past midnight could explain. */
export function timeOutBeforeIn(
  timeIn: string | null | undefined,
  timeOut: string | null | undefined,
): boolean {
  const start = minutesOf(timeIn);
  const end = minutesOf(timeOut);
  return start !== null && end !== null && end < start && end + 24 * 60 - start > MAX_OVERNIGHT_MIN;
}

/**
 * Whole minutes from time in to time out; a dive past midnight ends the next day, up to
 * six hours later. Null when a time is missing or time out lies before time in.
 */
export function durationFromTimes(
  timeIn: string | null | undefined,
  timeOut: string | null | undefined,
): number | null {
  const start = minutesOf(timeIn);
  const end = minutesOf(timeOut);
  if (start === null || end === null || start === end || timeOutBeforeIn(timeIn, timeOut))
    return null;
  return end > start ? end - start : end + 24 * 60 - start;
}

/**
 * A surface interval as typed on a phone keypad, written the log's way: `1.15`, `1,15`,
 * `1h15` and `1 15` become `1:15`. Anything else is returned as typed.
 */
export function normalizeInterval(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const value = text.trim();
  const m = /^(\d{1,2})\s*[:.,h\s]\s*(\d{2})\s*m?$/i.exec(value);
  if (!m || Number(m[2]) > 59) return value;
  return `${Number(m[1])}:${m[2]}`;
}

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : null;
}

/** Minutes since a fixed day of a date and a `HH:MM` time on it. */
function stamp(date: string, minutes: number): number | null {
  const day = dayNumber(date);
  return day === null ? null : day * 24 * 60 + minutes;
}

/** Longest gap still written as a surface interval; longer means a new series of dives. */
export const MAX_SURFACE_INTERVAL_MIN = 48 * 60;

/** `H:MM`, the way the log writes surface intervals. */
export function formatInterval(minutes: number): string {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The surface interval between the previous dive's end (time out, or time in plus the
 * duration) and this dive's time in, as `H:MM`; null when a time is missing, the dive is
 * not after the previous one, or the gap is longer than two days.
 */
export function surfaceIntervalFrom(
  previous: {
    date: string;
    time_in?: string | null;
    time_out?: string | null;
    duration_min?: number | null;
  },
  current: { date: string; time_in: string | null },
): string | null {
  const startNow = minutesOf(current.time_in);
  if (startNow === null) return null;
  let end = minutesOf(previous.time_out);
  let endDate = previous.date;
  if (end === null) {
    const start = minutesOf(previous.time_in);
    if (start === null || !previous.duration_min) return null;
    end = start + Math.round(previous.duration_min);
  } else {
    const start = minutesOf(previous.time_in);
    if (start !== null && end < start) endDate = shiftDate(previous.date, 1);
  }
  const from = stamp(endDate, end);
  const to = stamp(current.date, startNow);
  if (from === null || to === null) return null;
  const gap = to - from;
  return gap > 0 && gap <= MAX_SURFACE_INTERVAL_MIN ? formatInterval(gap) : null;
}

/** An ISO date `days` later (or earlier, when negative). */
export function shiftDate(iso: string, days: number): string {
  const day = dayNumber(iso);
  if (day === null) return iso;
  return new Date((day + days) * 86_400_000).toISOString().slice(0, 10);
}

/** The editor's sections, in page order; a field error opens the section it is in. */
export const DIVE_SECTIONS = [
  'essentials',
  'gas',
  'conditions',
  'map',
  'story',
  'transcription',
  'private',
  'publishing',
] as const;

export type DiveSection = (typeof DIVE_SECTIONS)[number];

/** Which section shows each field; anything unlisted is shown under Essentials. */
export const FIELD_SECTIONS: Partial<Record<keyof DiveInput, DiveSection>> = {
  tanks: 'gas',
  gear_setup_id: 'gas',
  mode: 'gas',
  suit: 'gas',
  weights_kg: 'gas',
  surface_interval: 'gas',
  safety_stop_min: 'gas',
  water_temp_c: 'conditions',
  surface_temp_c: 'conditions',
  air_temp_c: 'conditions',
  thermocline_m: 'conditions',
  visibility_m: 'conditions',
  conditions: 'conditions',
  difficulty: 'conditions',
  rating: 'conditions',
  tags: 'conditions',
  map_annotation: 'map',
  title: 'story',
  body_md: 'story',
  course: 'story',
  notes_nl: 'transcription',
  visibility_raw: 'transcription',
  gas_raw: 'transcription',
  types_raw: 'transcription',
  guide: 'private',
  operator: 'private',
  buddy_raw: 'private',
  buddy_role: 'private',
  sketch: 'private',
  computer: 'private',
  flags: 'private',
  visibility: 'publishing',
};

/** The section a field path (`max_depth_m`, `tanks.0.o2_pct`) is shown in. */
export function sectionOf(path: string): DiveSection {
  const head = path.split('.')[0] as keyof DiveInput;
  return FIELD_SECTIONS[head] ?? 'essentials';
}

/** The id of the control for a field path: `tanks.0.o2_pct` → `dl-dive-tanks-0-o2_pct`. */
export function fieldId(path: string): string {
  return `dl-dive-${path.replace(/\./g, '-')}`;
}

/** The field errors in page order: by section, then as the server listed them. */
export function orderedErrors(errors: Record<string, string>): string[] {
  const keys = Object.keys(errors);
  return keys.sort(
    (a, b) =>
      DIVE_SECTIONS.indexOf(sectionOf(a)) - DIVE_SECTIONS.indexOf(sectionOf(b)) ||
      keys.indexOf(a) - keys.indexOf(b),
  );
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * What the form checks before it saves: the fields the API requires, so a dive with a
 * missing depth or duration is never sent (and never goes live half-filled), a time out
 * before the time in, and a filled tank row without its cylinder.
 */
export function validateEssentials(form: DiveInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const number = asNumber(form.number);
  if (number === null || !Number.isInteger(number) || number < 1)
    errors.number = 'Give the dive a number of 1 or more';
  if (!form.date) errors.date = 'Pick the date of the dive';
  const duration = asNumber(form.duration_min);
  if (duration === null) errors.duration_min = 'Enter how long the dive took';
  else if (duration < 1) errors.duration_min = 'A dive takes at least a minute';
  const depth = asNumber(form.max_depth_m);
  if (depth === null) errors.max_depth_m = 'Enter the maximum depth';
  else if (depth < 0) errors.max_depth_m = 'Depth cannot be negative';
  if (timeOutBeforeIn(form.time_in, form.time_out))
    errors.time_out = 'Time out is before time in';
  form.tanks.forEach((tank, i) => {
    if (!isBlankTank(tank) && isEmptyValue(tank.cylinder))
      errors[`tanks.${i}.cylinder`] = 'Cylinder required';
  });
  return errors;
}

/** A form saved in `sessionStorage` while it has unsaved changes. */
export type DiveBackup = { v: 1; savedAt: string; form: DiveInput; computerText: string };

/** The storage key of the backup of dive `number`, or of the new-dive form. */
export function backupKey(number: number | null): string {
  return `dl-dive-backup:${number ?? 'new'}`;
}

export function serializeBackup(form: DiveInput, computerText: string, now = new Date()): string {
  const backup: DiveBackup = { v: 1, savedAt: now.toISOString(), form, computerText };
  return JSON.stringify(backup);
}

/** A backup read back, or null when there is none or it is not one this editor wrote. */
export function parseBackup(raw: string | null | undefined): DiveBackup | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DiveBackup>;
    if (value?.v !== 1 || typeof value.savedAt !== 'string') return null;
    const form = value.form as DiveInput | undefined;
    if (!form || typeof form !== 'object' || !Array.isArray(form.tanks)) return null;
    if (typeof form.date !== 'string' || !Array.isArray(form.people_ids)) return null;
    return {
      v: 1,
      savedAt: value.savedAt,
      form: { ...emptyDiveInput(form.number), ...form },
      computerText: typeof value.computerText === 'string' ? value.computerText : '',
    };
  } catch {
    return null;
  }
}

/** Storage that may be missing or throw (private windows, blocked site data). */
type MaybeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;

function session(): MaybeStorage {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readBackup(key: string, storage: MaybeStorage = session()): DiveBackup | null {
  try {
    return parseBackup(storage?.getItem(key));
  } catch {
    return null;
  }
}

export function writeBackup(
  key: string,
  form: DiveInput,
  computerText: string,
  storage: MaybeStorage = session(),
): void {
  try {
    storage?.setItem(key, serializeBackup(form, computerText));
  } catch {
    // storage full or blocked: the form simply has no backup
  }
}

export function clearBackup(key: string, storage: MaybeStorage = session()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clear
  }
}

/** Cylinder names the tank editor offers, with their water volume in litres. */
export const CYLINDER_PRESETS: CylinderPreset[] = [
  { name: 'D12', volume_l: 24 },
  { name: 'D10', volume_l: 20 },
  { name: 'D7', volume_l: 14 },
  { name: 'Alu80', volume_l: 11.1 },
  { name: 'S80', volume_l: 11.1 },
  { name: 'S40', volume_l: 5.7 },
  { name: '12 L', volume_l: 12 },
  { name: '10 L', volume_l: 10 },
  { name: '15 L', volume_l: 15 },
];

export function emptyTank(role: Tank['role'] = 'back'): Tank {
  return {
    cylinder: role === 'back' ? 'D12' : 'Alu80',
    volume_l: role === 'back' ? 24 : 11.1,
    gas: role === 'deco' ? 'oxygen' : 'nitrox',
    o2_pct: role === 'deco' ? 100 : 32,
    o2_measured_pct: null,
    he_pct: null,
    pressure_in_bar: null,
    pressure_out_bar: null,
    role,
  };
}

/** The old single-line gas fields as one back tank, so the editor always shows a row. */
export function legacyTanks(dive: {
  cylinder: string | null;
  gas: string | null;
  o2_pct: number | null;
  o2_measured_pct: number | null;
  he_pct: number | null;
  pressure_in_bar: number | null;
  pressure_out_bar: number | null;
}): Tank[] {
  if (!dive.cylinder && dive.pressure_in_bar === null) return [];
  return [
    {
      cylinder: dive.cylinder ?? '',
      volume_l: null,
      gas: (['air', 'nitrox', 'trimix'].includes(dive.gas ?? '') ? dive.gas : 'air') as TankGas,
      o2_pct: dive.o2_pct,
      o2_measured_pct: dive.o2_measured_pct,
      he_pct: dive.he_pct,
      pressure_in_bar: dive.pressure_in_bar,
      pressure_out_bar: dive.pressure_out_bar,
      role: 'back',
    },
  ];
}

/** GUE standard gases: one pick sets the mix of a tank. */
export const STANDARD_GASES: GasPreset[] = [
  { label: 'Air', gas: 'air', o2: null, he: null },
  { label: 'EAN32', gas: 'nitrox', o2: 32, he: null },
  { label: 'Trimix 30/30', gas: 'trimix', o2: 30, he: 30 },
  { label: 'Trimix 21/35', gas: 'trimix', o2: 21, he: 35 },
  { label: 'Trimix 18/45', gas: 'trimix', o2: 18, he: 45 },
  { label: 'Trimix 15/55', gas: 'trimix', o2: 15, he: 55 },
  { label: 'EAN50', gas: 'nitrox', o2: 50, he: null },
  { label: 'Oxygen', gas: 'oxygen', o2: 100, he: null },
];

export type EditorPresets = {
  tags: readonly string[];
  cylinders: CylinderPreset[];
  gases: GasPreset[];
};

/** The editor's tag, cylinder and gas choices: the config's presets over the defaults. */
export function presetsFor(config: DivelogConfig): EditorPresets {
  return {
    tags: config.presets?.tags ?? DIVE_TAGS,
    cylinders: config.presets?.cylinders ?? CYLINDER_PRESETS,
    gases: config.presets?.gases ?? STANDARD_GASES,
  };
}

/** The dive before the one in the form: what "Same as previous dive" and the derivations use. */
export type PreviousDive = {
  number: number;
  title: string;
  site_id: string | null;
  date: string;
  time_in: string | null;
  time_out: string | null;
  duration_min: number | null;
  template: DiveTemplate;
};

/** The previous dive of a template (in the API's input shape) as the form uses it. */
export function previousDive(dive: DiveInLike): PreviousDive {
  const input = inputFromDiveIn(dive);
  return {
    number: input.number,
    title: input.title,
    site_id: input.site_id,
    date: input.date,
    time_in: input.time_in,
    time_out: input.time_out,
    duration_min: input.duration_min,
    template: pickTemplate(input),
  };
}

/** How many fields of a section hold something: the count on a collapsed section. */
export function filledCount(form: DiveInput, section: DiveSection): number {
  return (Object.keys(FIELD_SECTIONS) as (keyof DiveInput)[]).filter(
    (key) => FIELD_SECTIONS[key] === section && key !== 'flags' && !isBlank(key, form[key]),
  ).length;
}

/**
 * `GET /admin/dives/template` path for a site and a day; `before` (a dive number) asks for
 * the dive logged before that one as `previous`, for an existing dive.
 */
export function templatePath(
  site: string | null,
  date: string | null,
  before: number | null = null,
): string {
  const params = new URLSearchParams();
  if (site) params.set('site', site);
  if (date) params.set('date', date);
  if (before !== null) params.set('before', String(before));
  const query = params.toString();
  return `/admin/dives/template${query ? `?${query}` : ''}`;
}
