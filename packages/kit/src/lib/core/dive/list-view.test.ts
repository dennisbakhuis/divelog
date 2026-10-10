import { describe, expect, it } from 'vitest';
import {
  barPercent,
  DEPTH_BUCKETS,
  DURATION_BUCKETS,
  dayLabel,
  dayOfTrip,
  firstIndexOfYear,
  groupByDay,
  groupByMonth,
  listScale,
  monthLabel,
  parseRange,
  profileArea,
  rangeLabel,
  rangeValue,
  siteGlyph,
  yearsOf,
} from './list-view.js';
import type { DiveListItem } from './types.js';

function dive(number: number, date: string, depth = 20, minutes = 45): DiveListItem {
  return {
    number,
    title: '',
    date,
    time_in: null,
    duration_min: minutes,
    max_depth_m: depth,
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

describe('profileArea', () => {
  it('draws depth downwards from the surface and closes along it', () => {
    expect(profileArea([200, 200], 30, 10)).toBe('M0 0 L10 10 L20 10 L30 0 Z');
  });

  it('keeps shallow dives shallow and scales deep ones to the box', () => {
    expect(profileArea([50], 20, 10)).toBe('M0 0 L10 5 L20 0 Z');
    expect(profileArea([440], 20, 10)).toBe('M0 0 L10 10 L20 0 Z');
    expect(profileArea([], 20, 10)).toBe('');
  });
});

describe('bars', () => {
  it('scales to the list maximum', () => {
    const scale = listScale([dive(1, '2024-01-01', 44, 230), dive(2, '2024-01-02', 11, 46)]);
    expect(scale).toEqual({ depth: 44, time: 230 });
    expect(barPercent(44, scale.depth)).toBe(100);
    expect(barPercent(11, scale.depth)).toBe(25);
    expect(barPercent(0.2, 100)).toBe(2);
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
  });
});

describe('groupByMonth', () => {
  const all = [
    dive(4, '2026-02-20'),
    dive(3, '2026-02-01'),
    dive(2, '2026-01-15'),
    dive(1, '2025-12-31'),
  ];

  it('heads consecutive rows by month with the count over the whole list', () => {
    const groups = groupByMonth(all.slice(0, 3), all);
    expect(groups.map((g) => [g.label, g.count, g.dives.length])).toEqual([
      ['February 2026', 2, 2],
      ['January 2026', 1, 1],
    ]);
    expect(groupByMonth(all.slice(0, 1), all)[0].count).toBe(2);
  });

  it('labels months', () => {
    expect(monthLabel('2005-07')).toBe('July 2005');
  });

  it('finds the first row of a year and the years present', () => {
    expect(firstIndexOfYear(all, 2025)).toBe(3);
    expect(firstIndexOfYear(all, 2019)).toBe(-1);
    expect(yearsOf([...all].reverse())).toEqual([2026, 2025]);
  });
});

describe('ranges', () => {
  it('round-trips select values', () => {
    for (const bucket of [...DEPTH_BUCKETS, ...DURATION_BUCKETS]) {
      expect(parseRange(rangeValue(bucket))).toEqual({ min: bucket.min, max: bucket.max });
    }
    expect(rangeValue({ min: null, max: null })).toBe('');
    expect(parseRange('')).toEqual({ min: null, max: null });
    expect(parseRange('x-5')).toEqual({ min: null, max: 5 });
  });

  it('labels a bucket or a hand-made range', () => {
    expect(rangeLabel({ min: 40, max: null }, DEPTH_BUCKETS, 'm')).toBe('40 m +');
    expect(rangeLabel({ min: 15, max: 25 }, DEPTH_BUCKETS, 'm')).toBe('15–25 m');
  });
});

describe('siteGlyph', () => {
  it('maps site types to map pictograms', () => {
    expect(siteGlyph('cave').type).toBe('entrance');
    expect(siteGlyph('reef with wrecks').type).toBe('wreck');
    expect(siteGlyph('pool')).toEqual({ type: 'object', objectKind: 'ladder' });
    expect(siteGlyph(null).type).toBe('marker');
  });
});

describe('trip grouping', () => {
  const mexico = { slug: 'mexico-2026-02', name: 'Mexico Feb 2026' };
  const inTrip = (d: DiveListItem): DiveListItem => ({ ...d, trip: mexico });

  it('names the trips a month holds', () => {
    const rows = [
      inTrip(dive(3, '2026-02-10')),
      inTrip(dive(2, '2026-02-08')),
      dive(1, '2026-01-02'),
    ];
    const groups = groupByMonth(rows);
    expect(groups[0].trips).toEqual([mexico]);
    expect(groups[1].trips).toEqual([]);
  });

  it('counts trip days from the first day', () => {
    expect(dayOfTrip('2026-02-06', '2026-02-06')).toBe(1);
    expect(dayOfTrip('2026-03-01', '2026-02-27')).toBe(3);
    expect(dayLabel('2026-02-10', '2026-02-08')).toBe('Day 3 · Tue 10 Feb 2026');
  });

  it('heads rows by day of the trip', () => {
    const rows = [dive(1, '2026-02-06'), dive(2, '2026-02-06'), dive(3, '2026-02-08')];
    const groups = groupByDay(rows, '2026-02-06');
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['Day 1 · Fri 6 Feb 2026', 2],
      ['Day 3 · Sun 8 Feb 2026', 1],
    ]);
  });
});
