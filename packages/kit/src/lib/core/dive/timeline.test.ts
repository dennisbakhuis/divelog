import { describe, expect, it } from 'vitest';
import {
  countInRange,
  dayAtX,
  dayOf,
  dayScale,
  daysOfRange,
  firstDate,
  isoOfDay,
  labelStep,
  rangeOfDays,
  today,
  xOfDate,
  yearTicks,
} from './timeline.js';
import type { DiveListItem } from './types.js';

function dive(number: number, date: string): DiveListItem {
  return {
    number,
    title: `Dive ${number}`,
    date,
    time_in: null,
    duration_min: 45,
    max_depth_m: 20,
    water_temp_c: null,
    tags: [],
    gas: 'air',
    gases: ['Air'],
    mode: 'OC',
    site: null,
    section: null,
    buddies: [],
    gear_setup: null,
    rating: null,
    has_photos: false,
    has_profile: false,
    spark: null,
    cover_url: null,
    search_text: '',
    trip: null,
  };
}

describe('labelStep', () => {
  it('spreads labels out when years are narrow', () => {
    expect(labelStep(60)).toBe(1);
    expect(labelStep(30)).toBe(2);
    expect(labelStep(10)).toBe(5);
    expect(labelStep(1)).toBe(20);
  });
});

describe('dayScale', () => {
  const scale = dayScale('2010-01-01', '2020-01-01', 1024, 12);

  it('counts whole days and maps them onto the line', () => {
    expect(scale.days).toBe(3652);
    expect(xOfDate(scale, '2010-01-01')).toBe(12);
    expect(xOfDate(scale, '2020-01-01')).toBe(1012);
    expect(xOfDate(scale, '2015-01-01')).toBeCloseTo(12 + (1826 / 3652) * 1000, 5);
  });

  it('clamps dates and pixels to the ends', () => {
    expect(dayOf(scale, '2005-06-01')).toBe(0);
    expect(dayOf(scale, '2030-06-01')).toBe(3652);
    expect(dayAtX(scale, -40)).toBe(0);
    expect(dayAtX(scale, 2000)).toBe(3652);
    expect(isoOfDay(scale, dayAtX(scale, 512))).toBe('2015-01-01');
    expect(isoOfDay(scale, 99_999)).toBe('2020-01-01');
  });

  it('never divides by zero on a one-day log', () => {
    const tiny = dayScale('2020-05-05', '2020-05-05', 10);
    expect(tiny.days).toBe(1);
    expect(tiny.width).toBe(25);
  });

  it('puts one tick per new year inside the range', () => {
    const ticks = yearTicks(scale);
    expect(ticks.map((t) => t.year)).toEqual([
      2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020,
    ]);
    expect(ticks.every((t) => t.labelled)).toBe(true);
    expect(yearTicks(dayScale('2010-01-01', '2020-01-01', 300)).filter((t) => t.labelled)).toEqual([
      expect.objectContaining({ year: 2012 }),
      expect.objectContaining({ year: 2014 }),
      expect.objectContaining({ year: 2016 }),
      expect.objectContaining({ year: 2018 }),
      expect.objectContaining({ year: 2020 }),
    ]);
  });
});

describe('ranges', () => {
  const scale = dayScale('2010-01-01', '2020-01-01', 1024);

  it('turns handles on the ends into open bounds, in either order', () => {
    expect(rangeOfDays(scale, 0, scale.days)).toEqual({ from: null, to: null });
    expect(rangeOfDays(scale, 365, scale.days)).toEqual({ from: '2011-01-01', to: null });
    expect(rangeOfDays(scale, scale.days - 1, 365)).toEqual({
      from: '2011-01-01',
      to: '2019-12-31',
    });
  });

  it('puts open bounds back on the ends', () => {
    expect(daysOfRange(scale, { from: null, to: null })).toEqual([0, scale.days]);
    expect(daysOfRange(scale, { from: '2011-01-01', to: '2019-12-31' })).toEqual([
      365,
      scale.days - 1,
    ]);
  });

  it('finds the first dive and counts dives inside a range', () => {
    const dives = [dive(2, '2012-05-01'), dive(1, '2010-06-01'), dive(3, '2019-12-31')];
    expect(firstDate(dives)).toBe('2010-06-01');
    expect(firstDate([])).toBeNull();
    expect(countInRange(dives, { from: null, to: null })).toBe(3);
    expect(countInRange(dives, { from: '2012-05-01', to: '2019-12-30' })).toBe(1);
  });

  it('writes today as a local ISO date', () => {
    expect(today(new Date(2026, 9, 3, 23, 30))).toBe('2026-10-03');
  });
});
