import type { DiveAdmin, Tank, TankGas } from '$lib/core/dive/types.js';
import type { DiveMapAnnotation } from '$lib/core/dive/sitemap.js';
import type { CylinderPreset, DivelogConfig, GasPreset } from '$lib/core/dive/config.js';

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
  duration_min: number;
  max_depth_m: number;
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
  gas: string;
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

export function emptyDiveInput(number: number): DiveInput {
  return {
    number,
    title: '',
    date: new Date().toISOString().slice(0, 10),
    time_in: null,
    time_out: null,
    duration_min: 45,
    max_depth_m: 18,
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
    gas: 'nitrox',
    o2_pct: 32,
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
    .filter((t) => t.cylinder.trim())
    .map((t) => {
      const tank: Record<string, unknown> = { ...t, cylinder: t.cylinder.trim() };
      for (const key of tankNumeric) {
        const value = tank[key];
        if (typeof value === 'string') tank[key] = value.trim() === '' ? null : Number(value);
      }
      return tank as unknown as Tank;
    });
  return out as DiveInput;
}

/** Perdix dive numbers typed as free text, e.g. "457, 458". */
export function parseComputer(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** What the form would save: the cleaned input with the computer numbers parsed. */
export function formPayload(form: DiveInput, computerText: string): DiveInput {
  return { ...cleanInput(form), computer: parseComputer(computerText) };
}

/** A comparable fingerprint of the form; unequal fingerprints mean unsaved changes. */
export function formSnapshot(form: DiveInput, computerText: string): string {
  return JSON.stringify(formPayload(form, computerText));
}

/** The fields "Copy last dive" carries over: where, with whom and with what kit. */
export const TEMPLATE_FIELDS = [
  'site_id',
  'trip_id',
  'people_ids',
  'gear_setup_id',
  'gas',
  'o2_pct',
  'o2_measured_pct',
  'he_pct',
  'gas_raw',
  'mode',
  'suit',
  'weights_kg',
  'cylinder',
  'tanks',
] as const satisfies readonly (keyof DiveInput)[];

export type DiveTemplate = Pick<DiveInput, (typeof TEMPLATE_FIELDS)[number]>;

/** The part of a stored dive a new dive can start from. */
export function diveTemplate(dive: DiveAdmin): DiveTemplate {
  const input = diveToInput(dive);
  return Object.fromEntries(TEMPLATE_FIELDS.map((key) => [key, input[key]])) as DiveTemplate;
}

/** The form with the template's fields copied in; everything else is left as typed. */
export function applyTemplate(form: DiveInput, template: DiveTemplate): DiveInput {
  return {
    ...form,
    ...template,
    people_ids: [...template.people_ids],
    tanks: template.tanks.map((t) => ({ ...t })),
  };
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
  gas: string;
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
      gas: (['air', 'nitrox', 'trimix'].includes(dive.gas) ? dive.gas : 'air') as TankGas,
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
