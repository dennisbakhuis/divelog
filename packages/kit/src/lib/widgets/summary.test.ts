import { describe, expect, it, vi } from 'vitest';
import { fakeDivelog } from '../testing/fake.js';
import { loadDiveSummary } from './summary.js';

describe('loadDiveSummary', () => {
  it('loads the summary and the timeline', async () => {
    const divelog = fakeDivelog({
      '/api/v1/dive/summary': { total_dives: 3 },
      '/api/v1/dive/timeline': { years: [] },
    });
    expect(await loadDiveSummary(divelog, vi.fn())).toEqual({
      summary: { total_dives: 3 },
      timeline: { years: [] },
    });
  });

  it('gives null for what the backend cannot answer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const divelog = fakeDivelog({ '/api/v1/dive/summary': { total_dives: 3 } });
    expect(await loadDiveSummary(divelog, vi.fn())).toEqual({
      summary: { total_dives: 3 },
      timeline: null,
    });
  });
});
