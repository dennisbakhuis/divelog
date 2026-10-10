import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import DiveFilters from './DiveFilters.svelte';
import { EMPTY_FILTER, type DiveFilter } from '$lib/core/dive/filter.js';
import type { DiveEnvelope } from '$lib/core/dive/types.js';
import { registerLiveRegion, resetAnnouncer, type Announcement } from '$lib/core/ui/announce.js';
import { render } from '$lib/components/ui/__fixtures__/test-utils.js';

const envelope: DiveEnvelope = {
  dives: [],
  total: 12,
  tags: ['cave', 'wreck'],
  countries: [{ country_code: 'MX', country_name: 'Mexico', dives: 12 }],
  years: [2026],
  regions: [],
  site_types: ['cenote'],
  gear_setups: [],
} as unknown as DiveEnvelope;

let spoken: Announcement[] = [];
let destroy: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  spoken = [];
  resetAnnouncer();
  registerLiveRegion((a) => spoken.push(a));
});

afterEach(() => {
  destroy?.();
  vi.useRealTimers();
  resetAnnouncer();
});

function filters(filter: DiveFilter, count: number) {
  const props = $state({ envelope, filter, count, onChange: vi.fn() });
  const rendered = render(DiveFilters, props);
  destroy = rendered.destroy;
  return { target: rendered.target, props };
}

describe('DiveFilters', () => {
  it('stays silent on the first render and announces the count after a change', () => {
    const { props } = filters(EMPTY_FILTER, 12);
    vi.advanceTimersByTime(1000);
    expect(spoken).toEqual([]);

    props.filter = { ...EMPTY_FILTER, tags: ['cave'] };
    props.count = 4;
    flushSync();
    vi.advanceTimersByTime(1000);
    expect(spoken.map((a) => a.text)).toEqual(['4 of 12 dives match']);

    props.filter = EMPTY_FILTER;
    props.count = 12;
    flushSync();
    vi.advanceTimersByTime(1000);
    expect(spoken.map((a) => a.text).at(-1)).toBe('Showing all 12 dives');
  });

  it('does not announce a sort or map option change', () => {
    const { props } = filters(EMPTY_FILTER, 12);
    props.filter = { ...EMPTY_FILTER, sort: 'depth', mapColour: 'year' };
    flushSync();
    vi.advanceTimersByTime(1000);
    expect(spoken).toEqual([]);
  });

  it('marks tag chips as toggles and names the remove buttons', () => {
    const { target } = filters({ ...EMPTY_FILTER, tags: ['cave'], site: 'mex-x' }, 3);
    const cave = target.querySelector('button[data-tag="cave"]')!;
    expect(cave.getAttribute('aria-pressed')).toBe('true');
    const pinned = target.querySelector('.pinned')!;
    expect(pinned.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'site: mex-x ×, remove filter',
    );
    expect(pinned.querySelector('[aria-hidden="true"]')?.textContent).toBe('×');
  });
});
