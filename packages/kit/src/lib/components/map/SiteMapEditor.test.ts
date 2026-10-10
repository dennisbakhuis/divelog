import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import SiteMapEditor, { SHORTCUTS_KEY } from './SiteMapEditor.svelte';
import { LocatorImageError } from './locator-image.js';
import { key, render, settle } from '../ui/__fixtures__/test-utils.js';
import { addNode, emptySiteMap, type SiteMap } from '$lib/core/dive/sitemap.js';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

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

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const ORIGIN = { lat: 52.09, lon: 5.12 };

function twoStations(): SiteMap {
  let map = emptySiteMap('stickmap', ORIGIN);
  const a = addNode(map, 0, 0);
  map = addNode(a.map, 20, 0, a.id).map;
  return map;
}

function mountEditor(props: Partial<Parameters<typeof SiteMapEditor>[1]> = {}) {
  const onChange = vi.fn();
  const view = render(SiteMapEditor, { value: twoStations(), onChange, ...props });
  const canvas = view.target.querySelector<HTMLElement>('[aria-label="Drawing canvas"]')!;
  const tool = () =>
    view.target.querySelector('[role="radio"][aria-checked="true"]')?.textContent?.trim();
  const button = (name: string) =>
    [...view.target.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
    );
  return { ...view, onChange, canvas, tool, button };
}

describe('SiteMapEditor shortcuts', () => {
  it('ignores single keys pressed outside the canvas', () => {
    const { tool, destroy } = mountEditor();
    expect(tool()).toContain('Station');
    key(document.body, 'c');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    flushSync();
    expect(tool()).toContain('Station');
    destroy();
  });

  it('switches tools from the canvas and says so', () => {
    const { canvas, tool, target, destroy } = mountEditor();
    canvas.focus();
    flushSync();
    expect(target.querySelector('.focus-note')?.textContent).toContain('Shortcuts active');
    key(canvas, 'c');
    expect(tool()).toContain('Connect');
    key(canvas, 'M');
    expect(tool()).toContain('Move');
    key(canvas, 's');
    expect(tool()).toContain('Survey');
    destroy();
  });

  it('turns single-key shortcuts off with the switch and remembers it', async () => {
    const { canvas, tool, button, target, destroy } = mountEditor();
    button('Keyboard shortcuts')!.click();
    await settle();
    const toggle = target.querySelector<HTMLInputElement>('input[role="switch"]')!;
    expect(toggle.checked).toBe(true);
    expect(target.querySelector('[role="radio"] kbd')?.textContent).toBe('A');
    toggle.click();
    flushSync();
    expect(storage.getItem(SHORTCUTS_KEY)).toBe('off');
    expect(target.querySelector('[role="radio"] kbd')).toBeNull();
    expect(target.querySelector('[role="radio"]')?.hasAttribute('aria-keyshortcuts')).toBe(false);
    canvas.focus();
    key(canvas, 'c');
    expect(tool()).toContain('Station');
    destroy();

    const again = mountEditor();
    again.canvas.focus();
    key(again.canvas, 'c');
    expect(again.tool()).toContain('Station');
    again.destroy();
  });

  it('deletes with Delete or Backspace only while the canvas has focus', () => {
    const { canvas, onChange, destroy } = mountEditor();
    key(document.body, 'Delete');
    key(document.body, 'Backspace');
    expect(onChange).not.toHaveBeenCalled();
    canvas.focus();
    key(canvas, 'Delete');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall![0].nodes).toHaveLength(1);
    destroy();
  });

  it('undoes with Ctrl-Z, but leaves text fields their own undo', () => {
    const { canvas, onChange, target, destroy } = mountEditor();
    canvas.focus();
    key(canvas, 'Delete');
    const title = target.querySelector<HTMLInputElement>('input[type="text"]')!;
    key(title, 'z', { ctrlKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);
    key(canvas, 'z', { metaKey: true });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.lastCall![0].nodes).toHaveLength(2);
    destroy();
  });

  it('focuses the canvas on a press so shortcuts follow a click', () => {
    const { canvas, destroy } = mountEditor();
    canvas
      .querySelector('svg')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.activeElement).toBe(canvas);
    destroy();
  });
});

describe('SiteMapEditor toolbar', () => {
  it('is a radio group moved with the arrow keys, shortcuts exposed', async () => {
    const { target, tool, destroy } = mountEditor();
    const group = target.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Drawing tool');
    const station = target.querySelector<HTMLButtonElement>('[role="radio"]')!;
    expect(station.getAttribute('aria-keyshortcuts')).toBe('A');
    station.focus();
    key(station, 'ArrowRight');
    await settle();
    expect(tool()).toContain('Survey');
    expect(document.activeElement?.textContent).toContain('Survey');
    key(document.activeElement!, 'End');
    await settle();
    expect(tool()).toContain('Object');
    destroy();
  });

  it('offers no survey tool on a site map', () => {
    const { target, destroy } = mountEditor({ value: emptySiteMap('sitemap', ORIGIN) });
    const names = [...target.querySelectorAll('[role="radio"]')].map((b) => b.textContent);
    expect(names.some((n) => n?.includes('Survey'))).toBe(false);
    destroy();
  });
});

describe('SiteMapEditor underlays', () => {
  const underlays = [{ ref: 'scan:a', label: 'Scan', href: '/a.png' }];
  const withUnderlay = (): SiteMap => ({
    ...twoStations(),
    underlay: { ref: 'scan:a', scale: 0.2, dx: 0, dy: 0, rotation: 0, opacity: 0.5 },
  });

  it('scales the underlay from two clicked points and a typed distance', () => {
    const { target, button, onChange, destroy } = mountEditor({
      value: withUnderlay(),
      underlays,
    });
    button('Scale by two points')!.click();
    flushSync();
    expect(target.textContent).toContain('Click 2 more points');
    const svg = target.querySelector('svg.sitemap')!;
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 0 }));
    flushSync();
    expect(onChange).not.toHaveBeenCalled();
    const distance = target.querySelector<HTMLInputElement>('.measure input')!;
    distance.value = '50';
    distance.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    button('Apply scale')!.click();
    flushSync();
    const underlay = onChange.mock.lastCall![0].underlay;
    expect(underlay.scale).toBeCloseTo(0.1, 6);
    expect(underlay).toMatchObject({ dx: 0, dy: 0, rotation: 0 });
    destroy();
  });

  it('switches drags to the underlay in align mode', () => {
    const { button, target, destroy } = mountEditor({ value: withUnderlay(), underlays });
    const align = button('Drag to align')!;
    expect(align.getAttribute('aria-pressed')).toBe('false');
    align.click();
    flushSync();
    expect(align.getAttribute('aria-pressed')).toBe('true');
    expect(target.querySelector('svg.sitemap')?.classList.contains('aligning')).toBe(true);
    expect(target.textContent).toContain('Drag to move the underlay');
    destroy();
  });

  it('renders the locator map at the origin, not stored', async () => {
    const renderLocator = vi.fn(async () => ({
      href: 'data:image/png;base64,QQ==',
      attribution: '<a href="https://openstreetmap.org">© OpenStreetMap</a>',
    }));
    const { button, target, onChange, destroy } = mountEditor({ renderLocator });
    button('Trace over the locator map')!.click();
    await settle();
    expect(renderLocator).toHaveBeenCalledTimes(1);
    const [frame] = renderLocator.mock.calls[0] as unknown as [{ center: { lat: number } }];
    expect(frame.center.lat).toBeCloseTo(ORIGIN.lat, 4);
    const image = target.querySelector('.underlay.locator image')!;
    expect(image.getAttribute('href')).toBe('data:image/png;base64,QQ==');
    expect(image.getAttribute('transform')).toMatch(/scale\(0\.\d+\)/);
    expect(target.textContent).toContain('Basemap © OpenStreetMap');
    expect(button('Re-render the locator map')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    destroy();
  });

  it('explains when the locator map cannot be drawn', async () => {
    const renderLocator = vi.fn(async () => {
      throw new LocatorImageError('No locator tiles cover this site');
    });
    const { button, target, destroy } = mountEditor({ renderLocator });
    button('Trace over the locator map')!.click();
    await settle();
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      'No locator tiles cover this site',
    );
    destroy();
  });

  it('offers no locator without an origin', () => {
    const { button, destroy } = mountEditor({ value: emptySiteMap('stickmap') });
    expect(button('Trace over the locator map')).toBeUndefined();
    destroy();
  });
});

describe('SiteMapEditor areas', () => {
  it('shows draggable corners for the selected area', () => {
    let map = emptySiteMap('sitemap', ORIGIN);
    map = {
      ...map,
      areas: [
        {
          id: 'a1',
          kind: 'outline',
          label: 'Pit',
          depth: null,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 8 },
          ],
        },
      ],
    };
    const { target, destroy } = mountEditor({ value: map });
    target
      .querySelector<SVGGElement>('.area')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(target.querySelectorAll('.area .vertex')).toHaveLength(3);
    expect(target.textContent).toContain('Drag the corners to reshape');
    destroy();
  });
});

describe('SiteMapEditor touch', () => {
  it('opens the actions menu on a long press and deletes from it', async () => {
    vi.useFakeTimers();
    try {
      const { target, onChange, destroy } = mountEditor();
      const station = target.querySelector<SVGGElement>('.node[data-id]')!;
      station.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', button: 0 }),
      );
      vi.advanceTimersByTime(600);
      flushSync();
      const menu = target.querySelector('[role="menu"]')!;
      expect(menu).toBeTruthy();
      const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      expect(items.map((b) => b.textContent?.trim())).toEqual(['Edit details', 'Delete', 'Cancel']);
      key(items[0], 'Escape');
      expect(target.querySelector('[role="menu"]')).toBeNull();
      station.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', button: 0 }),
      );
      vi.advanceTimersByTime(600);
      flushSync();
      const again = [...target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      again[1].click();
      flushSync();
      expect(onChange.mock.lastCall![0].nodes).toHaveLength(1);
      expect(target.querySelector('[role="menu"]')).toBeNull();
      destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('long-presses only with touch or pen held still', () => {
    vi.useFakeTimers();
    try {
      const { target, destroy } = mountEditor();
      const svg = target.querySelector('svg.sitemap')!;
      svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      vi.advanceTimersByTime(600);
      flushSync();
      expect(target.querySelector('[role="menu"]')).toBeNull();
      svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
      svg.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 2 }),
      );
      svg.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerType: 'touch',
          pointerId: 2,
          clientX: 30,
          clientY: 0,
        }),
      );
      vi.advanceTimersByTime(600);
      flushSync();
      expect(target.querySelector('[role="menu"]')).toBeNull();
      svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }));
      svg.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'pen', pointerId: 3 }),
      );
      vi.advanceTimersByTime(600);
      flushSync();
      expect(target.querySelector('[role="menu"]')).not.toBeNull();
      destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
