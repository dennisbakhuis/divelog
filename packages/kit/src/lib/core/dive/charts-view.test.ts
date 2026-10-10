import { describe, expect, it } from 'vitest';
import {
  axisYears,
  bandActive,
  bands,
  countRows,
  cumulativeHours,
  DEPTH_EDGES,
  DURATION_EDGES,
  gridLines,
  linePath,
  median,
  rhythmTiles,
  spanLabel,
  tagRows,
  tempColour,
  toggleDepthBand,
  toggleDurationBand,
  toggleOne,
  toggleYear,
  waterByCountry,
  yearActive,
  yearBars,
  type ChartDive,
} from './charts-view.js';
import { EMPTY_FILTER } from './filter.js';

const nl = {
  slug: 'grasbroek',
  name: "'t Grasbroek",
  country_code: 'NL',
  country_name: 'Netherlands',
};
const eg = { slug: 'thistlegorm', name: 'Thistlegorm', country_code: 'EG', country_name: 'Egypt' };
const kim = { slug: 'kim', name: 'Kim' };
const daan = { slug: 'daan', name: 'Daan' };

function dive(number: number, date: string, extra: Partial<ChartDive> = {}): ChartDive {
  return {
    number,
    date,
    duration_min: 60,
    max_depth_m: 18,
    water_temp_c: 8,
    tags: [],
    site: nl,
    buddies: [kim],
    trip: null,
    ...extra,
  };
}

const all: ChartDive[] = [
  dive(1, '2019-05-04', { max_depth_m: 7, duration_min: 25, tags: ['training'] }),
  dive(2, '2019-05-04', {
    max_depth_m: 18,
    duration_min: 50,
    tags: ['cave'],
    buddies: [kim, daan],
  }),
  dive(3, '2020-08-10', { max_depth_m: 31, duration_min: 95, tags: ['cave', 'dpv'] }),
  dive(4, '2022-02-01', {
    max_depth_m: 62,
    duration_min: 130,
    site: eg,
    water_temp_c: 24,
    trip: { slug: 'egypt-2022' },
  }),
  dive(5, '2022-02-03', {
    site: eg,
    water_temp_c: 26,
    trip: { slug: 'egypt-2022' },
    tags: ['wreck'],
  }),
  dive(6, '2022-02-05', { site: eg, water_temp_c: 25, trip: { slug: 'egypt-2022' } }),
  dive(7, '2022-09-01', { water_temp_c: null, site: null, buddies: [] }),
];
const caves = all.filter((d) => d.tags.includes('cave'));

describe('bands', () => {
  it('bands a measure half-open and drops empty bands', () => {
    const depth = bands(all, caves, DEPTH_EDGES, (d) => d.max_depth_m);
    expect(depth.map((b) => [b.label, b.total, b.selected])).toEqual([
      ['0–10', 1, 0],
      ['10–20', 4, 1],
      ['30–40', 1, 1],
      ['60+', 1, 0],
    ]);
    expect(depth[0]).toMatchObject({ min: null, max: 10 });
    expect(depth[3]).toMatchObject({ min: 60, max: null });
    const time = bands(all, caves, DURATION_EDGES, (d) => d.duration_min);
    expect(time.map((b) => b.label)).toEqual(['0–30', '45–60', '60–90', '90–120', '120+']);
    expect(time.map((b) => b.total)).toEqual([1, 1, 3, 1, 1]);
  });
});

describe('years', () => {
  it('fills the gap years and sums minutes for both lists', () => {
    const years = yearBars(all, caves);
    expect(years.map((y) => [y.year, y.total, y.selected])).toEqual([
      [2019, 2, 1],
      [2020, 1, 1],
      [2021, 0, 0],
      [2022, 4, 0],
    ]);
    expect(years[0]).toMatchObject({ minutes: 75, selectedMinutes: 50 });
    expect(yearBars([], [])).toEqual([]);
  });

  it('accumulates hours per year', () => {
    const points = cumulativeHours(yearBars(all, caves));
    expect(points.map((p) => p.hours.toFixed(2))).toEqual(['1.25', '2.83', '2.83', '8.00']);
    expect(points[3]).toMatchObject({
      selectedHours: 2.4166666666666665,
      dives: 4,
      selectedDives: 0,
    });
  });

  it('labels a year axis at its ends and round steps', () => {
    expect(axisYears([2005])).toEqual([2005]);
    expect(axisYears([2019, 2020, 2021, 2022])).toEqual([2019, 2020, 2021, 2022]);
    const span = Array.from({ length: 22 }, (_, i) => 2005 + i);
    expect(axisYears(span)).toEqual([2005, 2010, 2015, 2020, 2026]);
    expect(axisYears(span.slice(0, 12))).toEqual([2005, 2010, 2016]);
  });
});

describe('plot helpers', () => {
  it('draws gridlines on round hours below the maximum', () => {
    expect(gridLines(633)).toEqual([200, 400, 600]);
    expect(gridLines(90)).toEqual([25, 50, 75]);
    expect(gridLines(100)).toEqual([25, 50, 75]);
    expect(gridLines(0)).toEqual([]);
  });

  it('builds a line and its closed area', () => {
    const path = linePath(
      [
        { x: 0, y: 10 },
        { x: 5, y: 2.25 },
      ],
      20,
    );
    expect(path.line).toBe('M0.0 10.0 L5.0 2.3');
    expect(path.area).toBe('M0.0 10.0 L5.0 2.3 L5.0 20 L0.0 20 Z');
    expect(linePath([], 20)).toEqual({ line: '', area: '' });
  });
});

describe('rows', () => {
  it('ranks by the selection, then the whole log', () => {
    const sites = countRows(all, caves, (d) => (d.site ? [d.site] : []), 8);
    expect(sites.map((s) => [s.name, s.total, s.selected])).toEqual([
      ["'t Grasbroek", 3, 2],
      ['Thistlegorm', 3, 0],
    ]);
    const people = countRows(all, caves, (d) => d.buddies, 1);
    expect(people).toEqual([{ slug: 'kim', name: 'Kim', total: 6, selected: 2 }]);
    expect(tagRows(all, caves, 8).map((t) => [t.tag, t.total, t.selected])).toEqual([
      ['cave', 2, 2],
      ['dpv', 1, 1],
      ['training', 1, 0],
      ['wreck', 1, 0],
    ]);
  });
});

describe('waterByCountry', () => {
  it('lists the most dived countries coldest first with their range', () => {
    const rows = waterByCountry(all, caves);
    expect(rows.map((r) => [r.code, r.min, r.median, r.max, r.dives, r.selected])).toEqual([
      ['NL', 8, 8, 8, 3, 2],
      ['EG', 24, 25, 26, 3, 0],
    ]);
    expect(waterByCountry(all.slice(0, 2), [])).toEqual([]);
    expect(median([])).toBeNull();
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('colours cold water blue and warm water amber', () => {
    expect(tempColour(4)).toBe('hsl(205 72% 60%)');
    expect(tempColour(28)).toBe('hsl(35 72% 66%)');
    expect(tempColour(-2)).toBe(tempColour(4));
  });
});

describe('rhythmTiles', () => {
  it('reports recency, frequency, the peak year, the longest streak and trips', () => {
    const tiles = rhythmTiles(all, '2022-09-13');
    expect(tiles.map((t) => [t.label, t.value, t.note])).toEqual([
      ['Since last dive', '12 days', '1 Sept 2022'],
      ['Past year', '4 dives', '5 h underwater'],
      ['Dive days', '6 days', 'up to 2 dives in a day'],
      ['Busiest year', '2022', '4 dives · 5 h'],
      ['Longest streak', '1 day', 'one day at a time'],
      ['Trips', '1 trip', '3 dives a trip'],
    ]);
    expect(tiles[3].group).toBe(false);
  });

  it('handles today, yesterday, a two-day streak and a single dive', () => {
    expect(rhythmTiles([], '2022-09-13')).toEqual([]);
    const two = [dive(1, '2022-09-12'), dive(2, '2022-09-13')];
    const tiles = rhythmTiles(two, '2022-09-13');
    expect(tiles[0].value).toBe('today');
    expect(tiles[2].note).toBe('one dive a day');
    expect(tiles[4]).toMatchObject({ value: '2 days', note: 'in a row, 12–13 Sep 2022' });
    expect(tiles.find((t) => t.label === 'Trips')).toBeUndefined();
    expect(rhythmTiles([dive(1, '2022-09-12')], '2022-09-13')[0].value).toBe('1 day');
    expect(spanLabel(59)).toBe('59 days');
    expect(spanLabel(60)).toBe('2 months');
    expect(spanLabel(3240)).toBe('9 years');
    expect(rhythmTiles([dive(1, '2022-09-12')], '2022-09-13').map((t) => t.label)).toEqual([
      'Since last dive',
      'Past year',
      'Dive days',
      'Busiest year',
      'Longest streak',
    ]);
  });
});

describe('toggles', () => {
  it('narrows to a year through the date range and back', () => {
    const on = toggleYear(EMPTY_FILTER, 2017);
    expect(on).toMatchObject({ year: null, dateFrom: '2017-01-01', dateTo: '2017-12-31' });
    expect(yearActive(on, 2017)).toBe(true);
    expect(yearActive(on, 2018)).toBe(false);
    expect(yearActive({ ...EMPTY_FILTER, year: 2017 }, 2017)).toBe(true);
    expect(toggleYear(on, 2017)).toMatchObject({ dateFrom: null, dateTo: null });
    expect(toggleYear({ ...EMPTY_FILTER, year: 2017 }, 2017).year).toBeNull();
  });

  it('toggles depth and bottom-time bands as the filter chips spell them', () => {
    const band = { label: '10–20', min: 10, max: 20, total: 1, selected: 1 };
    const on = toggleDepthBand(EMPTY_FILTER, band);
    expect(on).toMatchObject({ minDepth: 10, maxDepth: 20 });
    expect(bandActive({ min: on.minDepth, max: on.maxDepth }, band)).toBe(true);
    expect(toggleDepthBand(on, band)).toMatchObject({ minDepth: null, maxDepth: null });
    const open = { label: '120+', min: 120, max: null, total: 1, selected: 1 };
    expect(toggleDurationBand(EMPTY_FILTER, open)).toMatchObject({
      minDuration: 120,
      maxDuration: null,
    });
  });

  it('sets and clears single-valued fields', () => {
    const on = toggleOne(EMPTY_FILTER, 'country', 'NL');
    expect(on.country).toBe('NL');
    expect(toggleOne(on, 'country', 'NL').country).toBe('');
    expect(toggleOne(on, 'country', 'EG').country).toBe('EG');
    expect(toggleOne(EMPTY_FILTER, 'site', 'ressel').site).toBe('ressel');
  });
});
