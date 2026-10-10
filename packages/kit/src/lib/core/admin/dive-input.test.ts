import { describe, expect, it } from 'vitest';
import type { Tank } from '$lib/core/dive/types.js';
import { DEFAULT_CONFIG } from '$lib/core/dive/config.js';
import {
  CYLINDER_PRESETS,
  DIVE_TAGS,
  presetsFor,
  STANDARD_GASES,
  applyTemplate,
  cleanInput,
  emptyDiveInput,
  formSnapshot,
  parseComputer,
} from './dive-input.js';

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
  it('copies only the kit and company of the last dive', () => {
    const last = emptyDiveInput(41);
    const template = {
      site_id: 'mex-tortuga',
      trip_id: 'mexico-2026',
      people_ids: ['anna'],
      gear_setup_id: 'sidemount',
      gas: 'nitrox',
      o2_pct: 32,
      o2_measured_pct: null,
      he_pct: null,
      gas_raw: 'EAN32',
      mode: 'sidemount',
      suit: '5 mm',
      weights_kg: 2,
      cylinder: '2x AL80',
      tanks: [],
    };
    const form = applyTemplate({ ...last, number: 42, max_depth_m: 12 }, template);
    expect(form.number).toBe(42);
    expect(form.max_depth_m).toBe(12);
    expect(form.site_id).toBe('mex-tortuga');
    expect(form.people_ids).toEqual(['anna']);
    expect(form.people_ids).not.toBe(template.people_ids);
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
    form.tanks = [typed, { ...emptyTank('deco'), cylinder: '  ' }] as unknown as Tank[];
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
