import { beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SiteMapView from './SiteMapView.svelte';
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
