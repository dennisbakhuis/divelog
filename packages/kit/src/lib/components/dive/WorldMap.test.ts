import { afterEach, describe, expect, it, vi } from 'vitest';
import WorldMap from './WorldMap.svelte';
import type { MapSite } from '$lib/core/dive/types.js';
import { key, render } from '$lib/components/ui/__fixtures__/test-utils.js';

function dot(slug: string, name: string, dives: number) {
  return {
    slug,
    name,
    country_code: 'NL',
    lat: 52,
    lon: 5,
    dives,
    minutes: dives * 50,
    site_type: 'lake',
    max_depth_m: 20,
    first_year: 2020,
    last_year: 2024,
    point: { x: 10, y: 20 },
  } as unknown as MapSite & { point: { x: number; y: number } };
}

const map = {
  landPath: 'M0 0',
  spherePath: 'M0 0',
  width: 100,
  height: 50,
  dots: [dot('vinkeveen', 'Vinkeveen', 40), dot('zeelandbrug', 'Zeelandbrug', 1)],
};

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));

function world(props: Record<string, unknown>) {
  const rendered = render(WorldMap, { map, compact: true, ...props } as never);
  cleanups.push(rendered.destroy);
  return rendered.target;
}

describe('WorldMap', () => {
  it('is a labelled group whose dots link to the site pages without a select handler', () => {
    const target = world({ label: 'Sites of the trip' });
    const svg = target.querySelector('svg.world')!;
    expect(svg.getAttribute('role')).toBe('group');
    const title = document.getElementById(svg.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe('Sites of the trip');
    const links = [...target.querySelectorAll('svg a')];
    expect(links.map((a) => [a.getAttribute('href'), a.getAttribute('aria-label')])).toEqual([
      ['/dive/sites/vinkeveen', 'Vinkeveen, 40 dives'],
      ['/dive/sites/zeelandbrug', 'Zeelandbrug, 1 dive'],
    ]);
    expect(target.querySelector('[role="button"]')).toBeNull();
    expect(target.querySelector('ul.dl-visually-hidden')).toBeNull();
  });

  it('gives every map its own title id', () => {
    const a = world({}).querySelector('svg')!.getAttribute('aria-labelledby');
    const b = world({}).querySelector('svg')!.getAttribute('aria-labelledby');
    expect(a).not.toBe(b);
  });

  it('toggles the filter from the keyboard when the dots filter', () => {
    const onSelect = vi.fn();
    const target = world({ onSelect, activeSite: 'zeelandbrug' });
    const buttons = [...target.querySelectorAll<SVGElement>('[role="button"]')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(buttons[0].getAttribute('tabindex')).toBe('0');
    expect(target.querySelector('svg a')).toBeNull();

    key(buttons[0], 'Enter');
    expect(onSelect).toHaveBeenLastCalledWith('vinkeveen');
    key(buttons[1], ' ');
    expect(onSelect).toHaveBeenLastCalledWith('');
    key(buttons[0], 'x');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('keeps the hover card out of the accessibility tree', () => {
    const target = world({});
    expect(target.querySelector('.tooltip')?.getAttribute('aria-hidden')).toBe('true');
    expect(target.querySelector('[aria-live]')).toBeNull();
  });
});
