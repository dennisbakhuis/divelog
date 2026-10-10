import { describe, expect, it } from 'vitest';
import { latestMatches, sparkline } from './sparkline.js';

describe('sparkline', () => {
  it('is empty without data', () => {
    expect(sparkline([], 100, 20)).toEqual({ line: '', area: '', last: null, peak: null });
  });

  it('spans the box and closes the area on the baseline', () => {
    const s = sparkline(
      [
        { year: 2020, dives: 0 },
        { year: 2021, dives: 10 },
        { year: 2022, dives: 5 },
      ],
      104,
      24,
    );
    expect(s.line).toBe('M2 22 L52 2 L102 12');
    expect(s.area).toBe('M2 22 L52 2 L102 12 L102 24 L2 24 Z');
    expect(s.last).toEqual({ x: 102, y: 12 });
    expect(s.peak).toEqual({ year: 2021, dives: 10 });
  });

  it('centres a single year', () => {
    expect(sparkline([{ year: 2020, dives: 3 }], 100, 20).line).toBe('M50 2');
  });

  it('matches the latest public dive to the summary date', () => {
    const timeline = { years: [], latest: { number: 7, date: '2026-08-08', site: null } };
    expect(latestMatches(timeline, '2026-08-08')).toBe(true);
    expect(latestMatches(timeline, '2026-08-09')).toBe(false);
    expect(latestMatches(null, '2026-08-08')).toBe(false);
    expect(latestMatches(timeline, null)).toBe(false);
  });
});
