import { describe, expect, it, beforeAll } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MapPanel from './MapPanel.svelte';
import type { MapRef, SiteDiveRoute } from '$lib/core/dive/types.js';
import type { SiteMapOut } from '$lib/core/dive/sitemap.js';
import { COMMONS_ATTRIBUTION, commonsSite } from '$lib/testing/sharing.js';

const drawn: SiteMapOut = {
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
    {
      id: 'a',
      x: 0,
      y: 0,
      type: 'entrance',
      label: '',
      depth: null,
      object_kind: null,
      left: null,
      right: null,
      color: null,
    },
    {
      id: 'b',
      x: 30,
      y: 0,
      type: 't',
      label: '',
      depth: null,
      object_kind: null,
      left: null,
      right: null,
      color: null,
    },
    {
      id: 'c',
      x: 60,
      y: 0,
      type: 'end',
      label: '',
      depth: null,
      object_kind: null,
      left: null,
      right: null,
      color: null,
    },
    {
      id: 'd',
      x: 30,
      y: 30,
      type: 'end',
      label: '',
      depth: null,
      object_kind: null,
      left: null,
      right: null,
      color: null,
    },
  ],
  edges: [
    { from: 'a', to: 'b', distance: null, azimuth: null, note: '', style: 'line' },
    { from: 'b', to: 'c', distance: null, azimuth: null, note: '', style: 'line' },
    { from: 'b', to: 'd', distance: null, azimuth: null, note: '', style: 'line' },
  ],
  areas: [],
  lines: [],
  notes: '',
  origin: null,
  underlay: null,
  to_scale: true,
};

const maps: MapRef[] = [
  {
    ref: 'drawn:m1',
    collection: 'drawn',
    title: 'Lines',
    url: null,
    public: true,
    credit: null,
    warning: null,
    drawn,
  },
];

const routes: SiteDiveRoute[] = [
  {
    number: 5,
    date: '2026-02-11',
    title: 'First',
    annotation: {
      map_id: 'm1',
      revision: 1,
      route: [{ from: 'a', to: 'b' }],
      turn: 'b',
      pins: [],
      path: [],
      turn_at: null,
      note: 'short one',
    },
  },
  {
    number: 6,
    date: '2026-02-12',
    title: 'Second',
    annotation: {
      map_id: 'm1',
      revision: 1,
      route: [{ from: 'b', to: 'c' }],
      turn: 'c',
      pins: [],
      path: [],
      turn_at: null,
      note: '',
    },
  },
  {
    number: 7,
    date: '2026-02-13',
    title: 'Elsewhere',
    annotation: {
      map_id: 'other',
      revision: 1,
      route: [{ from: 'b', to: 'd' }],
      turn: null,
      pins: [],
      path: [],
      turn_at: null,
      note: '',
    },
  },
];

describe('MapPanel dive overlays', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver, which bind:clientWidth needs.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it('shows every dived leg by default, one dive on request, and none on demand', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(MapPanel, { target, props: { maps, siteName: 'Site', routes } });
    flushSync();

    const chips = [...target.querySelectorAll('.dives button')].map((b) => b.textContent?.trim());
    expect(chips).toEqual(['All dived lines', '11 Feb 2026 · #5', '12 Feb 2026 · #6', 'Map only']);
    expect(target.querySelectorAll('.edge.on-route').length).toBe(2);
    expect(target.querySelector('.turn-ring')).toBeNull();

    (target.querySelectorAll('.dives button')[1] as HTMLButtonElement).click();
    flushSync();
    expect(target.querySelectorAll('.edge.on-route').length).toBe(1);
    expect(target.querySelector('.turn-ring')).not.toBeNull();
    expect(target.textContent).toContain('short one');
    expect(target.querySelector('a.open')?.getAttribute('href')).toBe('/dive/5');

    (target.querySelectorAll('.dives button')[3] as HTMLButtonElement).click();
    flushSync();
    expect(target.querySelector('svg.sitemap.routed')).toBeNull();

    unmount(app);
    target.remove();
  });

  it('offers no dive chips when no logged dive touches the shown map', () => {
    const target = document.createElement('div');
    const app = mount(MapPanel, { target, props: { maps, siteName: 'Site', routes: [routes[2]] } });
    flushSync();
    expect(target.querySelector('.dives')).toBeNull();
    expect(target.querySelector('svg.sitemap.routed')).toBeNull();
    unmount(app);
  });

  it('credits a commons map and not a personal -p map or a personal site', () => {
    const site = commonsSite();
    const target = document.createElement('div');
    const app = mount(MapPanel, {
      target,
      props: {
        maps: site.maps,
        siteName: site.name,
        origin: site.origin,
        attribution: COMMONS_ATTRIBUTION,
      },
    });
    flushSync();
    expect(target.querySelector('.dl-attribution')?.textContent).toContain(
      'Map © divelog-sites contributors, CC BY-SA 4.0',
    );
    (target.querySelectorAll('.tabs button')[1] as HTMLButtonElement).click();
    flushSync();
    expect(target.querySelector('.dl-attribution')).toBeNull();
    unmount(app);

    const personal = document.createElement('div');
    const own = mount(MapPanel, { target: personal, props: { maps, siteName: 'Site' } });
    flushSync();
    expect(personal.querySelector('.dl-attribution')).toBeNull();
    unmount(own);
  });
});
