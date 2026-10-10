import { describe, expect, it } from 'vitest';
import {
  ceilingSteps,
  clock,
  decoSpans,
  gasSwitchLabel,
  gasSwitches,
  profileFacts,
  sampleAt,
} from './profile-view.js';
import type { ProfileMeta, ProfileSample } from './types.js';

const samples: ProfileSample[] = [
  { t: 0, d: 0 },
  { t: 60, d: 20 },
  { t: 120, d: 30, stop: 6 },
  { t: 180, d: 25, stop: 6 },
  { t: 240, d: 12, stop: 3 },
  { t: 300, d: 5 },
  { t: 360, d: 3, stop: 3 },
  { t: 420, d: 0 },
];

const meta: ProfileMeta = {
  gf: '50/85',
  deco_model: 'ZHL-16C GF',
  deco: true,
  gas_switches: [
    [0, '32'],
    [240, '99'],
    [300, '21/35'],
  ],
  surface_breaks: [],
  temp_min_c: null,
  temp_max_c: null,
  sample_interval_s: 10,
  partial: null,
  samples: 840,
  deco_min: 4,
  deepest_stop_m: 6,
  first_stop_s: 120,
  max_ascent_m_min: 9,
  max_descent_m_min: 20,
  time_at_max_s: 120,
};

describe('ceilingSteps', () => {
  it('merges runs of equal stop depth and ends each at the next sample', () => {
    expect(ceilingSteps(samples)).toEqual([
      { from: 120, to: 240, depth: 6 },
      { from: 240, to: 300, depth: 3 },
      { from: 360, to: 420, depth: 3 },
    ]);
    expect(ceilingSteps([{ t: 0, d: 0 }])).toEqual([]);
  });
});

describe('decoSpans', () => {
  it('starts a span at the sample before the first stop', () => {
    expect(decoSpans(samples)).toEqual([
      { from: 60, to: 240 },
      { from: 300, to: 360 },
    ]);
  });
});

describe('gas switches', () => {
  it('labels the mixes and drops the starting gas', () => {
    expect(gasSwitchLabel('32')).toBe('EAN32');
    expect(gasSwitchLabel('99')).toBe('O₂');
    expect(gasSwitchLabel('100')).toBe('O₂');
    expect(gasSwitchLabel('21')).toBe('Air');
    expect(gasSwitchLabel('21/35')).toBe('21/35');
    expect(gasSwitchLabel(null)).toBe('');
    expect(gasSwitches(meta)).toEqual([
      { t: 240, label: 'O₂' },
      { t: 300, label: '21/35' },
    ]);
    expect(gasSwitches(null)).toEqual([]);
  });
});

describe('sampleAt', () => {
  it('finds the nearest sample in time', () => {
    expect(sampleAt(samples, 0)?.t).toBe(0);
    expect(sampleAt(samples, 89)?.t).toBe(60);
    expect(sampleAt(samples, 91)?.t).toBe(120);
    expect(sampleAt(samples, 9999)?.t).toBe(420);
    expect(sampleAt([], 10)).toBeNull();
  });
});

describe('clock', () => {
  it('formats minutes and seconds, hours when needed', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(3725)).toBe('1:02:05');
  });
});

describe('profileFacts', () => {
  it('lists only the figures the profile backs up', () => {
    const facts = profileFacts(meta, 14.2);
    expect(facts.map((f) => f.label)).toEqual([
      'Avg depth',
      'Deepest at',
      'Descent',
      'Ascent',
      'In deco',
      'First stop at',
      'Samples',
    ]);
    expect(facts[4]).toEqual({ label: 'In deco', value: '4 min', note: 'deepest stop 6 m' });
    expect(facts[6].note).toBe('every 10 s');
    const bare = profileFacts(
      { ...meta, deco_min: null, first_stop_s: null, samples: null, time_at_max_s: null },
      null,
    );
    expect(bare.map((f) => f.label)).toEqual(['Descent', 'Ascent']);
    expect(profileFacts(null, 10)).toEqual([]);
  });
});
