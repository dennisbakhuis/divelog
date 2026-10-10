import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SiteMapThumb from './SiteMapThumb.svelte';
import type { DiveMapAnnotation, MapNode, SiteMapOut } from '$lib/core/dive/sitemap';

function node(id: string, x: number, y: number, type: MapNode['type']): MapNode {
  return {
    id,
    x,
    y,
    type,
    label: '',
    depth: null,
    object_kind: null,
    left: null,
    right: null,
    color: null,
  };
}

const map: SiteMapOut = {
  id: 'm1',
  site_id: 's',
  sort: 0,
  revision: 1,
  changelog: [],
  updated_at: null,
  version: 3,
  kind: 'stickmap',
  title: 'Lines',
  north: 0,
  nodes: [
    node('a', 0, 0, 'entrance'),
    node('b', 30, 0, 't'),
    node('c', 60, 0, 'end'),
    node('d', 30, 30, 'end'),
  ],
  edges: [
    { from: 'a', to: 'b', distance: null, azimuth: null, note: '', style: 'line' },
    { from: 'b', to: 'c', distance: null, azimuth: null, note: '', style: 'line' },
    { from: 'b', to: 'd', distance: null, azimuth: null, note: '', style: 'jump' },
  ],
  areas: [],
  lines: [],
  notes: '',
  origin: null,
  underlay: null,
  to_scale: true,
};

const annotation: DiveMapAnnotation = {
  map_id: 'm1',
  revision: 1,
  route: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'b' },
  ],
  turn: 'c',
  pins: [],
  path: [],
  turn_at: null,
  note: '',
};

describe('SiteMapThumb', () => {
  it('draws the map statically, fitted to its bounds', () => {
    const target = document.createElement('div');
    const app = mount(SiteMapThumb, { target, props: { map } });
    flushSync();
    const svg = target.querySelector('svg.thumb')!;
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect([x, y, w, h].map((v) => Math.round(v * 10) / 10)).toEqual([-4.8, -4.8, 69.6, 39.6]);
    expect(target.querySelectorAll('line.edge')).toHaveLength(map.edges.length);
    expect(target.querySelectorAll('line.edge.jump')).toHaveLength(1);
    expect(target.querySelectorAll('circle.entrance')).toHaveLength(1);
    expect(target.querySelector('text')).toBeNull();
    expect(target.querySelector('.dive-route')).toBeNull();
    unmount(app);
  });

  it('draws a routed dive once per leg, with its turn', () => {
    const target = document.createElement('div');
    const app = mount(SiteMapThumb, { target, props: { map, annotation } });
    flushSync();
    expect(target.querySelectorAll('line.edge')).toHaveLength(map.edges.length);
    expect(target.querySelectorAll('line.dive-route')).toHaveLength(2);
    expect(target.querySelector('circle.turn')?.getAttribute('cx')).toBe('60');
    unmount(app);
  });

  it('draws a free track as one polyline', () => {
    const target = document.createElement('div');
    const track = {
      ...annotation,
      route: [],
      turn: null,
      path: [
        { x: 0, y: 0 },
        { x: 20, y: 10 },
        { x: 40, y: 0 },
      ],
      turn_at: 1,
    };
    const app = mount(SiteMapThumb, { target, props: { map, annotation: track } });
    flushSync();
    expect(target.querySelector('polyline.dive-route.track')?.getAttribute('points')).toBe(
      '0,0 20,10 40,0',
    );
    expect(target.querySelector('circle.turn')?.getAttribute('cx')).toBe('20');
    unmount(app);
  });
});
