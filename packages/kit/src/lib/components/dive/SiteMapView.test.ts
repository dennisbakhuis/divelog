import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SiteMapView from './SiteMapView.svelte';
import { render } from '../ui/__fixtures__/test-utils.js';
import { edgeKey, type MapNode, type SiteMap } from '$lib/core/dive/sitemap.js';

function node(id: string, x: number): MapNode {
  return {
    id,
    x,
    y: 0,
    type: 'station',
    label: '',
    depth: null,
    object_kind: null,
    left: null,
    right: null,
    color: null,
  };
}

const map: SiteMap = {
  version: 3,
  kind: 'stickmap',
  title: 'Line',
  north: 0,
  nodes: [node('a', 0), node('b', 30), node('c', 60)],
  edges: [
    { from: 'a', to: 'b', distance: 30, azimuth: null, note: '', style: 'line' },
    { from: 'b', to: 'c', distance: 30, azimuth: null, note: '', style: 'line' },
  ],
  areas: [],
  lines: [],
  notes: '',
  origin: null,
  underlay: null,
  to_scale: true,
};

describe('SiteMapView on a dive', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it('labels only the route until the reader asks for every length', () => {
    const target = document.createElement('div');
    const route = new Set([edgeKey('a', 'b')]);
    const app = mount(SiteMapView, {
      target,
      props: { map, route, legs: [{ from: 'a', to: 'b' }] },
    });
    flushSync();
    expect(target.querySelectorAll('.edge.on-route .distance')).toHaveLength(1);
    expect(target.querySelectorAll('.distance')).toHaveLength(1);
    (target.querySelector('button[aria-label="Line lengths"]') as HTMLButtonElement).click();
    flushSync();
    expect(target.querySelectorAll('.distance')).toHaveLength(2);
    unmount(app);
  });

  it('keeps every length on without a route, and in the editor', () => {
    for (const props of [{ map }, { map, editable: true, route: new Set([edgeKey('a', 'b')]) }]) {
      const target = document.createElement('div');
      const app = mount(SiteMapView, { target, props });
      flushSync();
      expect(target.querySelectorAll('.distance')).toHaveLength(2);
      unmount(app);
    }
  });

  it('offers full screen only where the browser supports it', () => {
    const target = document.createElement('div');
    const original = HTMLElement.prototype.requestFullscreen;
    const app = mount(SiteMapView, { target, props: { map } });
    flushSync();
    const present = !!target.querySelector('button[aria-label="Full screen"]');
    expect(present).toBe(typeof original === 'function');
    unmount(app);

    const requested: Element[] = [];
    HTMLElement.prototype.requestFullscreen = function (this: HTMLElement) {
      requested.push(this);
      return Promise.resolve();
    };
    try {
      const again = mount(SiteMapView, { target, props: { map } });
      flushSync();
      (target.querySelector('button[aria-label="Full screen"]') as HTMLButtonElement).click();
      expect(requested).toEqual([target.querySelector('.frame')]);
      unmount(again);
    } finally {
      HTMLElement.prototype.requestFullscreen = original;
    }
  });
});

function pointer(el: Element, type: string, init: PointerEventInit = {}) {
  el.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...init }),
  );
  flushSync();
}

function touchTap(el: Element, from: { x: number; y: number }, to = from, pointerId = 1) {
  const init = { pointerType: 'touch', pointerId };
  pointer(el, 'pointerdown', { ...init, clientX: from.x, clientY: from.y });
  pointer(el, 'pointermove', { ...init, clientX: to.x, clientY: to.y });
  pointer(el, 'pointerup', { ...init, clientX: to.x, clientY: to.y });
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: to.x, clientY: to.y }));
  flushSync();
}

describe('SiteMapView with fingers', () => {
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

  it('counts a touch tap that wanders a few pixels as a tap on the station', () => {
    const onNodeClick = vi.fn();
    const onNodeMove = vi.fn();
    const onCanvasClick = vi.fn();
    const { target, destroy } = render(SiteMapView, {
      map,
      editable: true,
      onNodeClick,
      onCanvasClick,
    });
    const b = target.querySelector('.node[data-id="b"]')!;
    touchTap(b, { x: 30, y: 0 }, { x: 36, y: 3 });
    expect(onNodeClick).toHaveBeenCalledWith('b', false);
    expect(onCanvasClick).not.toHaveBeenCalled();
    destroy();

    const drawing = render(SiteMapView, { map, editable: true, onNodeClick, onNodeMove });
    touchTap(drawing.target.querySelector('.node[data-id="c"]')!, { x: 60, y: 0 }, { x: 66, y: 0 });
    expect(onNodeMove).not.toHaveBeenCalled();
    expect(onNodeClick).toHaveBeenLastCalledWith('c', false);
    drawing.destroy();
  });

  it('pans instead of dragging a station that cannot move', () => {
    const onNodeClick = vi.fn();
    const { target, destroy } = render(SiteMapView, { map, editable: true, onNodeClick });
    const b = target.querySelector('.node[data-id="b"]')!;
    const before = target.querySelector('g.view')!.getAttribute('transform');
    touchTap(b, { x: 30, y: 0 }, { x: 70, y: 0 });
    expect(onNodeClick).not.toHaveBeenCalled();
    expect(target.querySelector('g.view')!.getAttribute('transform')).not.toBe(before);
    destroy();
  });

  it('lets a station tap fall through to the canvas when stations take no clicks', () => {
    const onCanvasClick = vi.fn();
    const { target, destroy } = render(SiteMapView, { map, editable: true, onCanvasClick });
    touchTap(target.querySelector('.node[data-id="b"]')!, { x: 31, y: 2 });
    expect(onCanvasClick).toHaveBeenCalledWith(31, 2);
    destroy();
  });

  it('pans on a slow drag made of tiny steps', () => {
    const { target, destroy } = render(SiteMapView, { map });
    const svg = target.querySelector('svg')!;
    const before = target.querySelector('g.view')!.getAttribute('transform');
    pointer(svg, 'pointerdown', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    for (let x = 1; x <= 12; x++) pointer(svg, 'pointermove', { clientX: x, clientY: 0 });
    pointer(svg, 'pointerup', { clientX: 12, clientY: 0 });
    expect(target.querySelector('g.view')!.getAttribute('transform')).not.toBe(before);
    destroy();
  });

  it('leaves a Safari pinch to the pointers while two fingers are down', () => {
    const { target, destroy } = render(SiteMapView, { map });
    const svg = target.querySelector('svg')!;
    const gesture = (type: string, scale: number) => {
      svg.dispatchEvent(
        Object.assign(new Event(type, { cancelable: true }), {
          scale,
          rotation: 0,
          clientX: 0,
          clientY: 0,
        }),
      );
      flushSync();
    };
    const transform = () => target.querySelector('g.view')!.getAttribute('transform');
    const before = transform();
    pointer(svg, 'pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0 });
    pointer(svg, 'pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 20, clientY: 0 });
    gesture('gesturestart', 1);
    gesture('gesturechange', 2);
    expect(transform()).toBe(before);
    pointer(svg, 'pointerup', { pointerId: 1 });
    pointer(svg, 'pointerup', { pointerId: 2 });
    gesture('gesturestart', 1);
    gesture('gesturechange', 2);
    expect(transform()).not.toBe(before);
    destroy();
  });

  it('takes over touch gestures only after a tap, not on the first touch', () => {
    const { target, destroy } = render(SiteMapView, { map });
    const svg = target.querySelector('svg')!;
    pointer(svg, 'pointerdown', { pointerType: 'touch', clientX: 0, clientY: 0 });
    expect(svg.classList.contains('active')).toBe(false);
    pointer(svg, 'pointermove', { pointerType: 'touch', clientX: 40, clientY: 0 });
    pointer(svg, 'pointerup', { pointerType: 'touch', clientX: 40, clientY: 0 });
    expect(svg.classList.contains('active')).toBe(false);
    pointer(svg, 'pointerdown', { pointerType: 'touch', pointerId: 2 });
    pointer(svg, 'pointercancel', { pointerType: 'touch', pointerId: 2 });
    expect(svg.classList.contains('active')).toBe(false);
    touchTap(svg, { x: 5, y: 5 }, { x: 5, y: 5 }, 3);
    expect(svg.classList.contains('active')).toBe(true);
    destroy();
  });
});
