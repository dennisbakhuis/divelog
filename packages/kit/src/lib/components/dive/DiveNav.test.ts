import { afterEach, describe, expect, it, vi } from 'vitest';

const location = vi.hoisted(() => ({ url: new URL('http://localhost/dive') }));

vi.mock('$app/state', () => ({ page: location }));

import DiveNav from './DiveNav.svelte';
import { render } from '$lib/components/ui/__fixtures__/test-utils.js';

let destroy: (() => void) | undefined;
afterEach(() => destroy?.());

function navAt(pathname: string) {
  location.url = new URL(`http://localhost${pathname}`);
  const rendered = render(DiveNav, {});
  destroy = rendered.destroy;
  return rendered.target.querySelector('nav')!;
}

describe('DiveNav', () => {
  it('is a labelled landmark with one link per section', () => {
    const nav = navAt('/dive');
    expect(nav.getAttribute('aria-label')).toBe('Dive log sections');
    expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Log', '/dive'],
      ['Sites', '/dive/sites'],
      ['Trips', '/dive/trips'],
      ['People', '/dive/people'],
      ['Gear', '/dive/gear'],
    ]);
  });

  it.each([
    ['/dive', 'Log'],
    ['/dive/650', 'Log'],
    ['/dive/sites/nld-vinkeveen', 'Sites'],
    ['/dive/regions/red-sea', 'Sites'],
    ['/dive/trips/red-sea-2025', 'Trips'],
    ['/dive/people/kim', 'People'],
    ['/dive/gear', 'Gear'],
  ])('marks exactly one section current on %s', (pathname, label) => {
    const nav = navAt(pathname);
    const current = [...nav.querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent);
    expect(current).toEqual([label]);
  });

  it('narrows to the detail column on a detail page only', () => {
    expect(navAt('/dive/650').classList.contains('detail')).toBe(true);
    destroy?.();
    expect(navAt('/dive/sites').classList.contains('detail')).toBe(false);
  });
});
