import { describe, expect, it } from 'vitest';
import type { BuddyNote, Tank } from '$lib/core/dive/types.js';
import { DEFAULT_CONFIG } from '$lib/core/dive/config.js';
import { todayLocal } from '$lib/core/dive/format.js';
import { fakeDiveAdmin } from '$lib/components/admin/__fixtures__/dive.js';
import {
  CYLINDER_PRESETS,
  DERIVED_GAS_FIELDS,
  DIVE_TAGS,
  presetsFor,
  STANDARD_GASES,
  MAX_SURFACE_INTERVAL_MIN,
  TEMPLATE_FIELDS,
  TEMPLATE_GROUPS,
  applyGearSetup,
  applyTemplate,
  backupKey,
  buddyNotesPayload,
  cleanInput,
  clearBackup,
  diveTemplate,
  durationFromTimes,
  emptyTank,
  fieldId,
  filledCount,
  formatInterval,
  inputFromDiveIn,
  isBlankTank,
  isEmptyAnnotation,
  normalizeInterval,
  timeOutBeforeIn,
  isBlank,
  minutesOf,
  orderedErrors,
  parseBackup,
  previousDive,
  readBackup,
  sectionOf,
  serializeBackup,
  setupHasTemplate,
  shiftDate,
  surfaceIntervalFrom,
  templateFills,
  templateFromDiveIn,
  templatePath,
  validateEssentials,
  writeBackup,
  type DiveInput,
  diveToInput,
  emptyDiveInput,
  formPayload,
  formSnapshot,
  liveFields,
  parseComputer,
  savePayload,
} from './dive-input.js';

describe('emptyDiveInput', () => {
  it('assumes nothing about depth, time or gas, and dates the dive today, locally', () => {
    const form = emptyDiveInput(12);
    expect(form.number).toBe(12);
    expect(form.date).toBe(todayLocal());
    expect(form.duration_min).toBeNull();
    expect(form.max_depth_m).toBeNull();
    expect(form.gas).toBeNull();
    expect(form.o2_pct).toBeNull();
    expect(form.he_pct).toBeNull();
    expect(form.tanks).toEqual([]);
    expect(form.visibility).toBe('public');
  });
});

describe('formPayload', () => {
  it('leaves the gas fields to the server, which derives them from the tanks', () => {
    const payload = formPayload(emptyDiveInput(3), '');
    for (const key of DERIVED_GAS_FIELDS) expect(payload).not.toHaveProperty(key);
    expect(payload).toHaveProperty('gas_raw');
    expect(payload).toHaveProperty('tanks');
  });

  it('turns typed depth and duration into numbers and blanks into null', () => {
    const form = emptyDiveInput(3);
    form.duration_min = '52' as unknown as number;
    form.max_depth_m = '' as unknown as number;
    const payload = formPayload(form, '');
    expect(payload.duration_min).toBe(52);
    expect(payload.max_depth_m).toBeNull();
  });
});

describe('savePayload', () => {
  it('takes the cover and flags from the dive as stored now, not as the form opened', () => {
    const opened = fakeDiveAdmin();
    const form = diveToInput(opened);
    const now = fakeDiveAdmin({
      cover_attachment_id: 'p9',
      private: { ...opened.private!, flags: ['late'] },
    });
    const payload = savePayload(form, '', now);
    expect(payload.cover_attachment_id).toBe('p9');
    expect(payload.flags).toEqual(['late']);
    expect(payload.title).toBe(opened.title);
  });

  it('starts a new dive with no cover and no flags', () => {
    expect(liveFields(null)).toEqual({ cover_attachment_id: null, flags: [] });
    expect(savePayload(emptyDiveInput(1), '', null).cover_attachment_id).toBeNull();
  });
});

describe('buddy notes', () => {
  const note = (person: string, isPublic = true): BuddyNote => ({
    person,
    comment: 'Great vis',
    strokes: [
      [
        [12, 300],
        [18, 290],
      ],
    ],
    signed_at: '2026-10-27T19:40:00+02:00',
    public: isPublic,
  });

  it('opens a stored dive with each note as person and public only', () => {
    const dive = fakeDiveAdmin({ buddy_notes: [note('alex'), note('kim', false)] });
    expect(diveToInput(dive).buddy_notes).toEqual([
      { person: 'alex', public: true },
      { person: 'kim', public: false },
    ]);
  });

  it('opens a dive from a server without notes with none', () => {
    const dive = fakeDiveAdmin();
    delete dive.buddy_notes;
    expect(diveToInput(dive).buddy_notes).toEqual([]);
  });

  it('starts a new dive with no notes and sends an empty list for it', () => {
    expect(emptyDiveInput(4).buddy_notes).toEqual([]);
    expect(savePayload(emptyDiveInput(4), '', null).buddy_notes).toEqual([]);
  });

  it('never takes the previous dive’s notes into a new one', () => {
    const input = inputFromDiveIn({
      number: 9,
      date: '2026-10-25',
      buddy_notes: [{ person: 'alex', public: true }],
    });
    expect(input.buddy_notes).toEqual([]);
  });

  it('sends null when the save leaves the notes as they are', () => {
    const dive = fakeDiveAdmin({ buddy_notes: [note('alex')] });
    const form = diveToInput(dive);
    expect(savePayload(form, '', dive, form.buddy_notes).buddy_notes).toBeNull();
    expect(savePayload(form, '', dive).buddy_notes).toBeNull();
  });

  it('sends the public choice the owner changed', () => {
    const dive = fakeDiveAdmin({ buddy_notes: [note('alex'), note('kim')] });
    const opened = diveToInput(dive).buddy_notes;
    const form = { ...diveToInput(dive), buddy_notes: [...opened] };
    form.buddy_notes[1] = { person: 'kim', public: false };
    expect(savePayload(form, '', dive, opened).buddy_notes).toEqual([
      { person: 'alex', public: true },
      { person: 'kim', public: false },
    ]);
  });

  it('sends the set without a note the owner deleted', () => {
    const dive = fakeDiveAdmin({ buddy_notes: [note('alex'), note('kim')] });
    const opened = diveToInput(dive).buddy_notes;
    const form = { ...diveToInput(dive), buddy_notes: opened.filter((n) => n.person !== 'alex') };
    expect(savePayload(form, '', dive, opened).buddy_notes).toEqual([
      { person: 'kim', public: true },
    ]);
    expect(savePayload(form, '', dive).buddy_notes).toBeNull();
  });

  it('keeps a note signed after the form opened', () => {
    const opened = fakeDiveAdmin({ buddy_notes: [note('alex')] });
    const form = diveToInput(opened);
    const openedNotes = form.buddy_notes;
    const now = fakeDiveAdmin({ buddy_notes: [note('alex'), note('kim')] });
    expect(savePayload(form, '', now, openedNotes).buddy_notes).toBeNull();
    form.buddy_notes = [{ person: 'alex', public: false }];
    expect(savePayload(form, '', now, openedNotes).buddy_notes).toEqual([
      { person: 'alex', public: false },
      { person: 'kim', public: true },
    ]);
  });

  it('does not bring back a note deleted elsewhere since the form opened', () => {
    const opened = [
      { person: 'alex', public: true },
      { person: 'kim', public: true },
    ];
    const now = fakeDiveAdmin({ buddy_notes: [note('kim')] });
    expect(buddyNotesPayload(opened, now, opened)).toBeNull();
    expect(
      buddyNotesPayload(
        [
          { person: 'alex', public: true },
          { person: 'kim', public: false },
        ],
        now,
        opened,
      ),
    ).toEqual([{ person: 'kim', public: false }]);
  });

  it('marks the form unsaved when a public choice or a deletion changes', () => {
    const form = diveToInput(fakeDiveAdmin({ buddy_notes: [note('alex')] }));
    const before = formSnapshot(form, '');
    expect(
      formSnapshot({ ...form, buddy_notes: [{ person: 'alex', public: false }] }, ''),
    ).not.toBe(before);
    expect(formSnapshot({ ...form, buddy_notes: [] }, '')).not.toBe(before);
    expect(formSnapshot({ ...form, buddy_notes: [{ person: 'alex', public: true }] }, '')).toBe(
      before,
    );
  });

  it('reads an older backup without notes as having none', () => {
    const old = JSON.stringify({
      v: 1,
      savedAt: 'x',
      form: { number: 3, date: 'd', tanks: [], people_ids: [] },
    });
    expect(parseBackup(old)!.form.buddy_notes).toEqual([]);
  });
});

describe('cleanInput', () => {
  it('keeps required text empty instead of null, and blanks the rest', () => {
    const form = emptyDiveInput(7);
    form.title = '';
    form.body_md = '';
    form.section = '';
    form.rating = '' as unknown as number;
    const out = cleanInput(form);
    expect(out.title).toBe('');
    expect(out.body_md).toBe('');
    expect(out.section).toBeNull();
    expect(out.rating).toBeNull();
  });

  it('turns numeric text into numbers', () => {
    const form = emptyDiveInput(8);
    form.water_temp_c = ' 24.5 ' as unknown as number;
    expect(cleanInput(form).water_temp_c).toBe(24.5);
  });
});

describe('formSnapshot', () => {
  it('treats an emptied optional field as unchanged', () => {
    const form = emptyDiveInput(9);
    const before = formSnapshot(form, '');
    form.section = '';
    expect(formSnapshot(form, '')).toBe(before);
  });

  it('changes when a field or the computer numbers change', () => {
    const form = emptyDiveInput(9);
    const before = formSnapshot(form, '');
    expect(formSnapshot(form, '457')).not.toBe(before);
    form.max_depth_m = 30;
    expect(formSnapshot(form, '')).not.toBe(before);
  });

  it('parses computer numbers from free text', () => {
    expect(parseComputer('457, 458 x 0')).toEqual([457, 458]);
  });
});

describe('templates', () => {
  const previous = {
    number: 41,
    date: '2026-02-07',
    duration_min: 55,
    max_depth_m: 21,
    time_in: '10:00',
    time_out: '10:55',
    site_id: 'mex-tortuga',
    section: 'upstream',
    trip_id: 'mexico-2026',
    people_ids: ['anna'],
    tags: ['cave'],
    guide: 'Pepe',
    operator: null,
    gear_setup_id: 'sidemount',
    mode: 'sidemount',
    suit: '5 mm',
    weights_kg: 2,
    tanks: [{ cylinder: 'AL80', o2_pct: 32, gas: 'nitrox', role: 'back' as const }],
    body_md: 'A story that never travels',
    water_temp_c: 25,
    profile: null,
  };

  it('reads the previous dive in the API input shape, filling what it leaves out', () => {
    const input = inputFromDiveIn(previous);
    expect(input.number).toBe(41);
    expect(input.visibility).toBe('public');
    expect(input.computer).toEqual([]);
    expect(input.tanks[0]).toMatchObject({ cylinder: 'AL80', o2_pct: 32, volume_l: null });
    expect(input).not.toHaveProperty('profile');
  });

  it('copies only where, with whom and with what kit', () => {
    const template = templateFromDiveIn(previous);
    expect(Object.keys(template).sort()).toEqual([...TEMPLATE_FIELDS].sort());
    expect(template).not.toHaveProperty('body_md');
    expect(template).not.toHaveProperty('water_temp_c');
    const form = applyTemplate({ ...emptyDiveInput(42), max_depth_m: 12 }, template);
    expect(form.number).toBe(42);
    expect(form.max_depth_m).toBe(12);
    expect(form.site_id).toBe('mex-tortuga');
    expect(form.section).toBe('upstream');
    expect(form.guide).toBe('Pepe');
    expect(form.people_ids).toEqual(['anna']);
    expect(form.people_ids).not.toBe(template.people_ids);
    expect(form.tanks).not.toBe(template.tanks);
    expect(form.tanks[0]).not.toBe(template.tanks[0]);
    expect(form.body_md).toBe('');
  });

  it('never overwrites what the owner already typed or picked', () => {
    const template = templateFromDiveIn(previous);
    const typed = {
      ...emptyDiveInput(42),
      site_id: 'mex-taj-mahal',
      people_ids: ['bob'],
      suit: 'drysuit',
      mode: 'CCR',
    };
    expect(templateFills(typed, template)).not.toContain('site_id');
    const form = applyTemplate(typed, template);
    expect(form.site_id).toBe('mex-taj-mahal');
    expect(form.people_ids).toEqual(['bob']);
    expect(form.suit).toBe('drysuit');
    expect(form.mode).toBe('CCR');
    expect(form.section).toBe('upstream');
    expect(form.trip_id).toBe('mexico-2026');
  });

  it('fills one group at a time and reports what it would fill', () => {
    const template = templateFromDiveIn(previous);
    const blank = emptyDiveInput(42);
    expect(templateFills(blank, template, TEMPLATE_GROUPS.trip.fields)).toEqual(['trip_id']);
    const form = applyTemplate(blank, template, TEMPLATE_GROUPS.kit.fields);
    expect(form.mode).toBe('sidemount');
    expect(form.site_id).toBeNull();
    expect(templateFills(form, template, TEMPLATE_GROUPS.kit.fields)).toEqual([]);
    expect(templateFills(form, template, TEMPLATE_GROUPS.site.fields)).toEqual([
      'site_id',
      'section',
      'people_ids',
      'tags',
      'guide',
    ]);
  });

  it("treats the blank form's own defaults as blank", () => {
    expect(isBlank('mode', 'OC')).toBe(true);
    expect(isBlank('mode', 'CCR')).toBe(false);
    expect(isBlank('visibility', 'public')).toBe(true);
    expect(isBlank('tags', [])).toBe(true);
    expect(isBlank('weights_kg', 0)).toBe(false);
    expect(isBlank('number', 0)).toBe(false);
  });

  it('keeps the template of a stored dive and the previous dive summary', () => {
    const template = diveTemplate(fakeDiveAdmin({ site_id: 'x', people_ids: ['p'] }));
    expect(template.site_id).toBe('x');
    expect(template.people_ids).toEqual(['p']);
    const prev = previousDive(previous);
    expect(prev).toMatchObject({
      number: 41,
      site_id: 'mex-tortuga',
      date: '2026-02-07',
      time_out: '10:55',
      duration_min: 55,
    });
    expect(prev.template.trip_id).toBe('mexico-2026');
  });
});

describe('gear setups', () => {
  const setup = {
    id: 'sm',
    tanks: [{ ...emptyTank('back'), cylinder: 'AL80' }],
    suit: '3 mm',
    weights_kg: 0,
  };

  it('knows whether a setup has anything to fill', () => {
    expect(setupHasTemplate(setup)).toBe(true);
    expect(setupHasTemplate({ id: 'x', tanks: [], suit: null, weights_kg: null })).toBe(false);
    expect(setupHasTemplate({ id: 'x', weights_kg: 0 })).toBe(true);
    expect(setupHasTemplate(undefined)).toBe(false);
  });

  it('fills tanks, suit and weights from the setup, keeping what it leaves empty', () => {
    const form = { ...emptyDiveInput(3), suit: 'drysuit', weights_kg: 4 };
    const out = applyGearSetup(form, { id: 'sm', tanks: [], suit: null, weights_kg: 2 });
    expect(out.gear_setup_id).toBe('sm');
    expect(out.suit).toBe('drysuit');
    expect(out.weights_kg).toBe(2);
    const full = applyGearSetup(form, setup);
    expect(full.tanks).toEqual(setup.tanks);
    expect(full.tanks[0]).not.toBe(setup.tanks[0]);
    expect(full.suit).toBe('3 mm');
    expect(full.weights_kg).toBe(0);
  });
});

describe('derivations', () => {
  it('derives the duration from time in and out, past midnight too', () => {
    expect(durationFromTimes('09:30', '10:20')).toBe(50);
    expect(durationFromTimes('23:40', '00:25')).toBe(45);
    expect(durationFromTimes('09:30', null)).toBeNull();
    expect(durationFromTimes('9:30', '9:30')).toBeNull();
    expect(durationFromTimes('25:00', '10:00')).toBeNull();
    expect(minutesOf('7:05')).toBe(425);
  });

  it('derives the surface interval from the previous dive', () => {
    const prev = { date: '2026-02-08', time_in: '09:30', time_out: '10:20' };
    expect(surfaceIntervalFrom(prev, { date: '2026-02-08', time_in: '11:45' })).toBe('1:25');
    expect(surfaceIntervalFrom(prev, { date: '2026-02-09', time_in: '09:00' })).toBe('22:40');
    expect(surfaceIntervalFrom(prev, { date: '2026-02-08', time_in: null })).toBeNull();
    expect(surfaceIntervalFrom(prev, { date: '2026-02-08', time_in: '10:00' })).toBeNull();
    expect(surfaceIntervalFrom(prev, { date: '2026-02-12', time_in: '09:00' })).toBeNull();
  });

  it('ends the previous dive from time in plus duration, and past midnight', () => {
    const noOut = { date: '2026-02-08', time_in: '22:00', time_out: null, duration_min: 50 };
    expect(surfaceIntervalFrom(noOut, { date: '2026-02-08', time_in: '23:30' })).toBe('0:40');
    const night = { date: '2026-02-08', time_in: '23:30', time_out: '00:30' };
    expect(surfaceIntervalFrom(night, { date: '2026-02-09', time_in: '02:00' })).toBe('1:30');
    const unknown = { date: '2026-02-08', time_in: null, time_out: null };
    expect(surfaceIntervalFrom(unknown, { date: '2026-02-08', time_in: '12:00' })).toBeNull();
  });

  it('shifts dates and formats intervals', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('nope', 1)).toBe('nope');
    expect(formatInterval(5)).toBe('0:05');
    expect(formatInterval(MAX_SURFACE_INTERVAL_MIN)).toBe('48:00');
  });
});

describe('sections and errors', () => {
  it('maps field paths to sections and control ids', () => {
    expect(sectionOf('max_depth_m')).toBe('essentials');
    expect(sectionOf('tanks.0.o2_pct')).toBe('gas');
    expect(sectionOf('notes_nl')).toBe('transcription');
    expect(sectionOf('unknown')).toBe('essentials');
    expect(fieldId('tanks.0.o2_pct')).toBe('dl-dive-tanks-0-o2_pct');
  });

  it('orders errors as the page shows the fields', () => {
    expect(orderedErrors({ visibility: 'x', 'tanks.1.he_pct': 'y', max_depth_m: 'z' })).toEqual([
      'max_depth_m',
      'tanks.1.he_pct',
      'visibility',
    ]);
  });

  it('blocks a save while the essentials are missing', () => {
    const errors = validateEssentials({ ...emptyDiveInput(0), date: '' });
    expect(Object.keys(errors).sort()).toEqual(['date', 'duration_min', 'max_depth_m', 'number']);
    const typed = { ...emptyDiveInput(3), duration_min: '40', max_depth_m: '0' };
    expect(validateEssentials(typed as unknown as DiveInput)).toEqual({});
    expect(
      validateEssentials({ ...emptyDiveInput(3), duration_min: 0.5, max_depth_m: -1 }),
    ).toMatchObject({ duration_min: expect.any(String), max_depth_m: expect.any(String) });
  });

  it('counts the filled fields of a section', () => {
    const form = { ...emptyDiveInput(3), water_temp_c: 24, tags: ['cave'], conditions: '' };
    expect(filledCount(form, 'conditions')).toBe(2);
    expect(filledCount(form, 'private')).toBe(0);
  });

  it('builds the template request path', () => {
    expect(templatePath(null, null)).toBe('/admin/dives/template');
    expect(templatePath('fra-ressel', '2026-02-08')).toBe(
      '/admin/dives/template?site=fra-ressel&date=2026-02-08',
    );
    expect(templatePath(null, '2026-02-08', 651)).toBe(
      '/admin/dives/template?date=2026-02-08&before=651',
    );
  });
});

describe('backup', () => {
  function memory() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  it('round-trips the form and the computer text', () => {
    const form = { ...emptyDiveInput(5), title: 'Half typed', tags: ['night'] };
    const raw = serializeBackup(form, '457', new Date('2026-02-08T10:00:00Z'));
    const back = parseBackup(raw)!;
    expect(back.savedAt).toBe('2026-02-08T10:00:00.000Z');
    expect(back.form).toEqual(form);
    expect(back.computerText).toBe('457');
  });

  it('ignores anything that is not a backup of this editor', () => {
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup(JSON.stringify({ v: 2 }))).toBeNull();
    expect(parseBackup(JSON.stringify({ v: 1, savedAt: 'x', form: { tanks: 'no' } }))).toBeNull();
    const old = JSON.stringify({
      v: 1,
      savedAt: 'x',
      form: { number: 3, date: 'd', tanks: [], people_ids: [] },
    });
    expect(parseBackup(old)!.form.mode).toBe('OC');
    expect(parseBackup(old)!.computerText).toBe('');
  });

  it('keys backups per dive and survives storage that throws', () => {
    expect(backupKey(650)).toBe('dl-dive-backup:650');
    expect(backupKey(null)).toBe('dl-dive-backup:new');
    const store = memory();
    writeBackup('k', emptyDiveInput(1), '', store);
    expect(readBackup('k', store)?.form.number).toBe(1);
    clearBackup('k', store);
    expect(readBackup('k', store)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readBackup('k', broken)).toBeNull();
    expect(() => writeBackup('k', emptyDiveInput(1), '', broken)).not.toThrow();
    expect(() => clearBackup('k', broken)).not.toThrow();
    expect(readBackup('k', undefined)).toBeNull();
  });
});

describe('tanks', () => {
  it('seeds one back tank from the old single-line fields', async () => {
    const { legacyTanks } = await import('./dive-input.js');
    expect(
      legacyTanks({
        cylinder: 'D12',
        gas: 'nitrox',
        o2_pct: 32,
        o2_measured_pct: null,
        he_pct: null,
        pressure_in_bar: 200,
        pressure_out_bar: 80,
      }),
    ).toEqual([
      {
        cylinder: 'D12',
        volume_l: null,
        gas: 'nitrox',
        o2_pct: 32,
        o2_measured_pct: null,
        he_pct: null,
        pressure_in_bar: 200,
        pressure_out_bar: 80,
        role: 'back',
      },
    ]);
    expect(
      legacyTanks({
        cylinder: null,
        gas: 'air',
        o2_pct: null,
        o2_measured_pct: null,
        he_pct: null,
        pressure_in_bar: null,
        pressure_out_bar: null,
      }),
    ).toEqual([]);
  });

  it('drops blank rows and turns typed numbers into numbers in the payload', async () => {
    const { emptyDiveInput, emptyTank, formPayload } = await import('./dive-input.js');
    const form = emptyDiveInput(1);
    const typed = { ...emptyTank('back'), pressure_in_bar: '200', pressure_out_bar: '' };
    const blank = { ...emptyTank('deco'), cylinder: '  ', volume_l: null };
    form.tanks = [typed, blank] as unknown as Tank[];
    const payload = formPayload(form, '');
    expect(payload.tanks).toHaveLength(1);
    expect(payload.tanks[0].pressure_in_bar).toBe(200);
    expect(payload.tanks[0].pressure_out_bar).toBeNull();
    expect(payload.tanks[0].cylinder).toBe('D12');
  });
});

describe('presetsFor', () => {
  it('falls back to the built-in presets', () => {
    expect(presetsFor(DEFAULT_CONFIG)).toEqual({
      tags: DIVE_TAGS,
      cylinders: CYLINDER_PRESETS,
      gases: STANDARD_GASES,
    });
  });

  it('takes each preset list from the config when given', () => {
    const presets = presetsFor({
      ...DEFAULT_CONFIG,
      presets: { tags: ['reef'], cylinders: [{ name: 'AL80', volume_l: 11.1 }] },
    });
    expect(presets.tags).toEqual(['reef']);
    expect(presets.cylinders).toEqual([{ name: 'AL80', volume_l: 11.1 }]);
    expect(presets.gases).toBe(STANDARD_GASES);
  });
});

describe('tank rows without a cylinder', () => {
  it('keeps a filled row and asks for its cylinder, so its pressures are never dropped', () => {
    const form = { ...emptyDiveInput(1), duration_min: 40, max_depth_m: 12 };
    const filled = { ...emptyTank('back'), cylinder: '', pressure_in_bar: 200 };
    const blank = { ...emptyTank('stage'), cylinder: ' ', volume_l: null };
    form.tanks = [blank, filled];
    expect(isBlankTank(blank)).toBe(true);
    expect(isBlankTank(filled)).toBe(false);
    expect(validateEssentials(form)).toEqual({ 'tanks.1.cylinder': 'Cylinder required' });
    expect(cleanInput(form).tanks).toEqual([{ ...filled, cylinder: '' }]);
  });

  it('asks for the cylinder of an old dive whose single-line gas had none', async () => {
    const { legacyTanks } = await import('./dive-input.js');
    const tanks = legacyTanks({
      cylinder: null,
      gas: 'air',
      o2_pct: null,
      o2_measured_pct: null,
      he_pct: null,
      pressure_in_bar: 210,
      pressure_out_bar: 60,
    });
    const form = { ...emptyDiveInput(1), duration_min: 40, max_depth_m: 12, tanks };
    expect(validateEssentials(form)).toHaveProperty(['tanks.0.cylinder']);
  });
});

describe('time out before time in', () => {
  it('derives no duration from a wrap of more than six hours, and flags time out', () => {
    expect(durationFromTimes('10:00', '09:00')).toBeNull();
    expect(durationFromTimes('22:30', '01:00')).toBe(150);
    expect(timeOutBeforeIn('10:00', '09:00')).toBe(true);
    expect(timeOutBeforeIn('22:30', '01:00')).toBe(false);
    expect(timeOutBeforeIn('10:00', null)).toBe(false);
    const form = { ...emptyDiveInput(1), duration_min: 40, max_depth_m: 12 };
    expect(validateEssentials({ ...form, time_in: '10:00', time_out: '09:10' })).toEqual({
      time_out: 'Time out is before time in',
    });
  });
});

describe('surface interval typing', () => {
  it('writes the phone keypad forms as H:MM and leaves anything else as typed', () => {
    expect(normalizeInterval('1.15')).toBe('1:15');
    expect(normalizeInterval('1,05')).toBe('1:05');
    expect(normalizeInterval(' 2h30 ')).toBe('2:30');
    expect(normalizeInterval('0 45')).toBe('0:45');
    expect(normalizeInterval('01:15')).toBe('1:15');
    expect(normalizeInterval('1.75')).toBe('1.75');
    expect(normalizeInterval('overnight')).toBe('overnight');
    expect(normalizeInterval(null)).toBeNull();
  });
});

describe('empty map annotations', () => {
  const annotation = {
    map_id: 'm1',
    revision: 3,
    route: [],
    turn: null,
    pins: [],
    path: [],
    turn_at: null,
    note: ' ',
  };

  it('saves an annotation that marks nothing as none', () => {
    expect(isEmptyAnnotation(annotation)).toBe(true);
    expect(isEmptyAnnotation(null)).toBe(true);
    const form = { ...emptyDiveInput(1), map_annotation: annotation };
    expect(cleanInput(form).map_annotation).toBeNull();
    expect(formSnapshot(form, '')).toBe(formSnapshot(emptyDiveInput(1), ''));
  });

  it('keeps a track, a route, a pin or a note', () => {
    const track = { ...annotation, path: [{ x: 1, y: 2 }] };
    expect(isEmptyAnnotation(track)).toBe(false);
    expect(isEmptyAnnotation({ ...annotation, route: [{ from: 'a', to: 'b' }] })).toBe(false);
    const pin = { id: 'p1', x: 0, y: 0, note: '' };
    expect(isEmptyAnnotation({ ...annotation, pins: [pin] })).toBe(false);
    expect(isEmptyAnnotation({ ...annotation, note: 'clear water' })).toBe(false);
    expect(cleanInput({ ...emptyDiveInput(1), map_annotation: track }).map_annotation).toEqual(
      track,
    );
  });
});
