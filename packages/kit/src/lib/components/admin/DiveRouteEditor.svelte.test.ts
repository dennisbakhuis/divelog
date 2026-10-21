import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiveRouteEditor from './DiveRouteEditor.svelte';
import { fakeMap } from '$lib/testing/sharing.js';
import type { DiveMapAnnotation, SiteMapOut } from '$lib/core/dive/sitemap.js';

const stick = fakeMap();
const lake = fakeMap({ id: 'lake-1', kind: 'sitemap', title: 'Lake', edges: [] });

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // jsdom has no layout: a client position is the drawing position.
  const identity = { inverse: () => identity };
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value: () => identity,
  });
  globalThis.DOMPoint ??= class {
    constructor(
      public x = 0,
      public y = 0,
    ) {}
    matrixTransform() {
      return { x: this.x, y: this.y };
    }
  } as unknown as typeof DOMPoint;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function stubMedia({ narrow = false, coarse = false } = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: (narrow && query.includes('max-width')) || (coarse && query.includes('coarse')),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function editor(maps: SiteMapOut[], initial: DiveMapAnnotation | null = null) {
  const state = $state({ value: initial });
  const onChange = vi.fn((a: DiveMapAnnotation | null) => (state.value = a));
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(DiveRouteEditor, {
    target,
    props: {
      maps,
      get value() {
        return state.value;
      },
      onChange,
    },
  });
  flushSync();
  return {
    target,
    onChange,
    current: () => state.value,
    set: (a: DiveMapAnnotation | null) => {
      state.value = a;
      flushSync();
    },
    button: (name: string) =>
      [...target.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim().endsWith(name) || b.getAttribute('aria-label') === name,
      )!,
    tool: (name: string) => {
      [...target.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
        .find((b) => b.textContent?.trim() === name)!
        .click();
      flushSync();
    },
    destroy: () => {
      unmount(app);
      target.remove();
    },
  };
}

function pointer(el: Element, type: string, init: PointerEventInit) {
  el.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...init }),
  );
  flushSync();
}

/** A finger tap that wanders a few pixels between landing and lifting. */
function tap(el: Element, x: number, y: number, wobble = 0) {
  const init = { pointerType: 'touch', clientX: x, clientY: y };
  pointer(el, 'pointerdown', init);
  pointer(el, 'pointermove', { ...init, clientX: x + wobble });
  pointer(el, 'pointerup', { ...init, clientX: x + wobble });
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x + wobble, clientY: y }));
  flushSync();
}

const svgOf = (root: ParentNode) => root.querySelector<SVGSVGElement>('svg.sitemap')!;
const hint = (root: ParentNode) => root.querySelector('.hint')?.textContent?.replace(/\s+/g, ' ');

describe('DiveRouteEditor on a site map', () => {
  it('draws a free track tap by tap, says "Tap" on a touch screen and counts one point', () => {
    stubMedia({ coarse: true });
    const ed = editor([lake]);
    expect(hint(ed.target)).toContain('Tap along the way you swam');
    tap(svgOf(ed.target), 10, 20);
    expect(ed.current()?.path).toEqual([{ x: 10, y: 20 }]);
    expect(hint(ed.target)).toContain('Track of 1 point, 0 m');
    expect(ed.target.querySelector('.track-start')).not.toBeNull();
    tap(svgOf(ed.target), 40, 20, 6);
    expect(ed.current()?.path).toHaveLength(2);
    expect(hint(ed.target)).toContain('Track of 2 points');
    ed.destroy();
  });

  it('dims nothing on a free track', () => {
    const ed = editor([lake]);
    tap(svgOf(ed.target), 10, 20);
    tap(svgOf(ed.target), 30, 20);
    expect(svgOf(ed.target).classList.contains('routed')).toBe(false);
    ed.destroy();
  });

  it('takes back taps, a turn and a clear with Back', () => {
    const ed = editor([lake]);
    const svg = svgOf(ed.target);
    tap(svg, 0, 0);
    tap(svg, 20, 0);
    tap(svg, 20, 20);
    ed.button('Turned here').click();
    flushSync();
    expect(ed.current()?.turn_at).toBe(2);
    ed.button('Clear route').click();
    flushSync();
    expect(ed.current()?.path).toEqual([]);
    ed.button('Back: undo the last step').click();
    flushSync();
    expect(ed.current()?.path).toHaveLength(3);
    expect(ed.current()?.turn_at).toBe(2);
    ed.button('Back: undo the last step').click();
    flushSync();
    expect(ed.current()?.turn_at).toBeNull();
    ed.button('Back: undo the last step').click();
    flushSync();
    expect(ed.current()?.path).toHaveLength(2);
    ed.destroy();
  });

  it('forgets the steps when the route was changed elsewhere', () => {
    const ed = editor([lake]);
    tap(svgOf(ed.target), 0, 0);
    expect(ed.button('Back: undo the last step').disabled).toBe(false);
    ed.set({ ...ed.current()!, path: [{ x: 5, y: 5 }] });
    expect(ed.button('Back: undo the last step').disabled).toBe(true);
    ed.destroy();
  });

  it('keeps pins when Back takes a track point back', () => {
    const ed = editor([lake]);
    tap(svgOf(ed.target), 0, 0);
    ed.tool('Note pin');
    tap(svgOf(ed.target), 10, 10);
    ed.tool('Route');
    ed.button('Back: undo the last step').click();
    flushSync();
    expect(ed.current()?.path).toEqual([]);
    expect(ed.current()?.pins).toHaveLength(1);
    ed.destroy();
  });

  it('turns at the nearest track point even when the tap lands on an object', () => {
    const ed = editor([lake]);
    tap(svgOf(ed.target), 0, 0);
    tap(svgOf(ed.target), 30, 0);
    tap(svgOf(ed.target), 60, 0);
    ed.tool('Turn point');
    expect(hint(ed.target)).toContain('point of the track');
    expect(hint(ed.target)).not.toContain('station');
    tap(ed.target.querySelector('.node[data-id="b"]')!, 31, 1);
    expect(ed.current()?.turn_at).toBe(1);
    ed.destroy();
  });

  it('writes a pin note and the dive note as they are typed', () => {
    const ed = editor([lake]);
    ed.tool('Note pin');
    tap(svgOf(ed.target), 10, 10);
    const note = ed.target.querySelector<HTMLInputElement>('.pin-row input')!;
    note.value = 'found the bus';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    expect(ed.current()?.pins[0].note).toBe('found the bus');
    const what = [...ed.target.querySelectorAll<HTMLInputElement>('input')].at(-1)!;
    what.value = 'cold';
    what.dispatchEvent(new Event('input', { bubbles: true }));
    expect(ed.current()?.note).toBe('cold');
    ed.destroy();
  });
});

describe('DiveRouteEditor on a stick map', () => {
  it('follows the line on station taps and drops a pin where a station was tapped', () => {
    const ed = editor([stick]);
    expect(hint(ed.target)).toContain('Click the first station');
    tap(ed.target.querySelector('.node[data-id="c"]')!, 60, 0, 6);
    expect(ed.current()?.route).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    ed.tool('Note pin');
    tap(ed.target.querySelector('.node[data-id="b"]')!, 32, 3);
    expect(ed.current()?.pins).toEqual([{ id: 'p1', x: 32, y: 3, note: '' }]);
    expect(ed.current()?.route).toHaveLength(2);
    ed.destroy();
  });

  it('takes the turn back with the legs that reached it', () => {
    const ed = editor([stick]);
    tap(ed.target.querySelector('.node[data-id="c"]')!, 60, 0);
    ed.button('Turned here').click();
    flushSync();
    expect(ed.current()?.turn).toBe('c');
    ed.button('Back: undo the last step').click();
    ed.button('Back: undo the last step').click();
    flushSync();
    expect(ed.current()?.route).toEqual([]);
    expect(ed.current()?.turn).toBeNull();
    ed.destroy();
  });
});

describe('DiveRouteEditor map choice', () => {
  it('stays without a map after Remove, even with a single map', () => {
    const ed = editor([lake]);
    tap(svgOf(ed.target), 0, 0);
    ed.button('Remove').click();
    flushSync();
    expect(ed.onChange).toHaveBeenLastCalledWith(null);
    expect(ed.target.querySelector('select')!.value).toBe('');
    expect(svgOf(ed.target)).toBeNull();
    const select = ed.target.querySelector('select')!;
    select.value = 'lake-1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(ed.current()?.map_id).toBe('lake-1');
    expect(svgOf(ed.target)).not.toBeNull();
    ed.destroy();
  });
});

describe('DiveRouteEditor full screen', () => {
  it('opens the map full screen, draws with the same value and keeps it on Done', () => {
    const ed = editor([lake]);
    ed.button('Expand').click();
    flushSync();
    const dialog = ed.target.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-label')).toBe('Route on the map');
    const strip = dialog.querySelector('.strip')!;
    const labels = [...strip.querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent?.trim(),
    );
    expect(labels).toEqual([
      'Route',
      'Turn point',
      'Note pin',
      'Back: undo the last step',
      'Turned here',
      'Clear route',
      'Zoom out',
      'Zoom in',
      'Done',
    ]);
    const big = svgOf(dialog);
    expect(big.closest('.frame')!.classList.contains('fill')).toBe(true);
    expect(dialog.querySelector('.view-controls button[aria-label="Zoom in"]')).toBeNull();
    expect(svgOf(ed.target.querySelector('.route-editor')!)).toBeNull();

    tap(big, 10, 10);
    tap(big, 20, 10);
    expect(ed.current()?.path).toHaveLength(2);
    expect(dialog.querySelector('.hint')!.compareDocumentPosition(strip)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const before = dialog.querySelector('g.view')!.getAttribute('transform');
    (strip.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click();
    flushSync();
    expect(dialog.querySelector('g.view')!.getAttribute('transform')).not.toBe(before);

    (strip.querySelector('.done') as HTMLButtonElement).click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(ed.current()?.path).toHaveLength(2);
    expect(ed.target.querySelectorAll('.route-editor .track-leg')).toHaveLength(1);
    ed.destroy();
  });

  it('on a phone shows a preview and opens full screen when a map is chosen', () => {
    stubMedia({ narrow: true, coarse: true });
    const ed = editor([lake, stick]);
    expect(ed.target.querySelector('[role="radio"]')).toBeNull();
    const select = ed.target.querySelector('select')!;
    select.value = 'lake-1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    const dialog = ed.target.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    tap(svgOf(dialog), 5, 5);
    expect(ed.current()?.path).toEqual([{ x: 5, y: 5 }]);
    (dialog.querySelector('.done') as HTMLButtonElement).click();
    flushSync();
    const preview = svgOf(ed.target.querySelector('.route-editor')!);
    expect(preview.getAttribute('role')).toBe('img');
    expect(ed.button('Draw on the map')).toBeTruthy();
    ed.destroy();
  });
});
