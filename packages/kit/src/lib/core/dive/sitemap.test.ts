import { drawingToWorld } from '$lib/core/map/trace.js';
import { describe, expect, it } from 'vitest';
import {
  addArea,
  addLine,
  addNode,
  addPin,
  addSurveyShot,
  legendKey,
  lineLength,
  moveLinePoint,
  moveAreaPoint,
  seedDraft,
  siteOrigin,
  placeByBearing,
  removeLine,
  toLatLon,
  updateLine,
  annotationSummary,
  depthFill,
  depthLabel,
  edgeKey,
  edgeLength,
  edgeStylesFor,
  emptyAnnotation,
  emptySiteMap,
  fitAnnotation,
  legendFor,
  mapBounds,
  mapSummary,
  maxDepth,
  moveNode,
  nodeTypesFor,
  normalizeSiteMap,
  orderedAreas,
  removeArea,
  removeNode,
  removePin,
  routeHighlights,
  routeLength,
  routeEnd,
  pathBetween,
  extendRoute,
  extendRouteAlong,
  trimRoute,
  legPhases,
  pathLength,
  snap,
  toggleEdge,
  toggleRouteLeg,
  totalLine,
  updateArea,
  updateEdge,
  updateNode,
  updatePin,
} from './sitemap.js';

describe('site map editing', () => {
  it('starts a stick map with an entrance and a site map with an entry', () => {
    const cave = addNode(emptySiteMap('stickmap'), 0, 0);
    expect(cave.map.nodes[0].type).toBe('entrance');
    const lake = addNode(emptySiteMap('sitemap'), 0, 0);
    expect(lake.map.nodes[0].type).toBe('entry');
    const second = addNode(cave.map, 30, 10, cave.id);
    expect(second.map.edges).toEqual([
      { from: cave.id, to: second.id, distance: null, azimuth: null, note: '', style: 'line' },
    ]);
    expect(second.map.nodes[1].type).toBe('station');
  });

  it('offers markers and line styles per kind', () => {
    const cave = nodeTypesFor('stickmap').map((t) => t.type);
    const lake = nodeTypesFor('sitemap').map((t) => t.type);
    expect(cave).toContain('t');
    expect(cave).not.toContain('wreck');
    expect(lake).toContain('wreck');
    expect(lake).not.toContain('restriction');
    expect(lake).toContain('station');
    expect(edgeStylesFor('sitemap').map((s) => s.style)).toEqual(['line', 'unsurveyed', 'route']);
  });

  it('removes a node together with its lines', () => {
    const a = addNode(emptySiteMap(), 0, 0);
    const b = addNode(a.map, 10, 0, a.id);
    const c = addNode(b.map, 20, 0, b.id);
    const without = removeNode(c.map, b.id);
    expect(without.nodes.map((n) => n.id)).toEqual([a.id, c.id]);
    expect(without.edges).toEqual([]);
  });

  it('toggles a connection in either direction', () => {
    const a = addNode(emptySiteMap(), 0, 0);
    const b = addNode(a.map, 10, 0);
    const linked = toggleEdge(b.map, a.id, b.id);
    expect(linked.edges).toHaveLength(1);
    expect(toggleEdge(linked, b.id, a.id).edges).toHaveLength(0);
    expect(toggleEdge(b.map, a.id, a.id)).toBe(b.map);
    expect(toggleEdge(b.map, a.id, 'missing')).toBe(b.map);
  });

  it('uses the measured distance when present and the drawn length otherwise', () => {
    const a = addNode(emptySiteMap(), 0, 0);
    const b = addNode(a.map, 30, 40, a.id);
    expect(edgeLength(b.map, b.map.edges[0])).toBe(50);
    const measured = updateEdge(b.map, a.id, b.id, { distance: 62 });
    expect(edgeLength(measured, measured.edges[0])).toBe(62);
    expect(totalLine(measured)).toBe(62);
    expect(totalLine(updateEdge(measured, b.id, a.id, { style: 'route' }))).toBe(0);
  });

  it('updates and moves nodes without changing ids', () => {
    const a = addNode(emptySiteMap(), 0, 0);
    const renamed = updateNode(a.map, a.id, { label: 'In', id: 'hacked', depth: 3.5 });
    expect(renamed.nodes[0].id).toBe(a.id);
    expect(maxDepth(renamed)).toBe(3.5);
    expect(moveNode(renamed, a.id, 5, -5).nodes[0]).toMatchObject({ x: 5, y: -5 });
    expect(maxDepth(emptySiteMap())).toBeNull();
  });

  it('manages areas and includes them in the bounds', () => {
    const base = emptySiteMap('sitemap');
    expect(addArea(base, 'outline', [{ x: 0, y: 0 }]).map).toBe(base);
    const { map, id } = addArea(base, 'outline', [
      { x: -50, y: 0 },
      { x: 0, y: -20 },
      { x: 10, y: 10 },
    ]);
    expect(map.areas[0]).toMatchObject({ id, kind: 'outline', label: '' });
    expect(mapBounds(map, 0)).toEqual({ minX: -50, minY: -20, maxX: 10, maxY: 10 });
    const labelled = updateArea(map, id, { label: 'Shore', kind: 'shallows' });
    expect(labelled.areas[0].kind).toBe('shallows');
    expect(removeArea(labelled, id).areas).toEqual([]);
  });

  it('summarises by kind and builds a legend from what is used', () => {
    const cave = addNode(emptySiteMap('stickmap'), 0, 0);
    const cave2 = addNode(cave.map, 40, 0, cave.id);
    const withDepth = updateNode(cave2.map, cave2.id, { depth: 20, type: 'end' });
    expect(mapSummary(withDepth)).toBe('2 stations · 40 m of line · max 20 m');
    expect(legendFor(withDepth).map((l) => l.label)).toEqual([
      'Entrance',
      'End of line',
      'Depth',
      'Along the line',
    ]);

    const lake = addNode(emptySiteMap('sitemap'), 0, 0);
    const wreck = updateNode(addNode(lake.map, 30, 0).map, 'n2', { type: 'wreck', depth: 18 });
    const routed = toggleEdge(wreck, 'n1', 'n2');
    const summary = mapSummary(updateEdge(routed, 'n1', 'n2', { style: 'route' }));
    expect(summary).toBe('1 object · max 18 m');
    expect(legendFor(routed).map((l) => l.label)).toEqual([
      'Entry / exit',
      'Wreck',
      'Depth',
      'Along the line',
    ]);
  });

  it('computes bounds with padding and snaps to the grid', () => {
    expect(mapBounds(emptySiteMap(), 10)).toEqual({ minX: -10, minY: -10, maxX: 10, maxY: 10 });
    expect(snap(13.4, 5)).toBe(15);
    expect(snap(-2.6, 1)).toBe(-3);
    expect(depthLabel(null)).toBe('');
    expect(depthLabel(12)).toBe('↓12 m');
    expect(depthLabel(12.25)).toBe('↓12.3 m');
  });
});

describe('normalizeSiteMap', () => {
  it('drops broken nodes, dangling edges, tiny areas and duplicates', () => {
    const map = normalizeSiteMap({
      kind: 'sitemap',
      title: 'Lake',
      nodes: [
        { id: 'a', x: 0, y: 0, type: 'entry' },
        { id: 'a', x: 1, y: 1 },
        { id: 'b', x: '10', y: 5, type: 'bogus', depth: '' },
        { id: '', x: 1, y: 1 },
        { id: 'c', x: 'nope', y: 1 },
      ],
      edges: [
        { from: 'a', to: 'b', distance: '12', style: 'weird' },
        { from: 'b', to: 'a' },
        { from: 'a', to: 'zzz' },
        { from: 'a', to: 'a' },
      ],
      areas: [
        {
          id: 's',
          kind: 'shallows',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 'x', y: 1 },
          ],
        },
        {
          id: 't',
          kind: 'nope',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      notes: 42,
    });
    expect(map.kind).toBe('sitemap');
    expect(map.title).toBe('Lake');
    const bare = {
      label: '',
      depth: null,
      object_kind: null,
      left: null,
      right: null,
      color: null,
    };
    expect(map.nodes).toEqual([
      { id: 'a', x: 0, y: 0, type: 'entry', ...bare },
      { id: 'b', x: 10, y: 5, type: 'station', ...bare },
    ]);
    expect(map.edges).toEqual([
      { from: 'a', to: 'b', distance: 12, azimuth: null, note: '', style: 'line' },
    ]);
    expect(map.areas).toEqual([
      {
        id: 't',
        kind: 'outline',
        label: '',
        depth: null,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ]);
    expect(map.notes).toBe('');
    expect(normalizeSiteMap(null)).toEqual(emptySiteMap('stickmap'));
    expect(normalizeSiteMap({ kind: 'treasure' }).kind).toBe('stickmap');
  });
});

describe('version 3: lines, objects and survey shots', () => {
  it('normalises lines, object kinds, origin and underlay', () => {
    const map = normalizeSiteMap({
      kind: 'sitemap',
      nodes: [{ id: 'o', x: 0, y: 0, type: 'object', object_kind: 'wipkip', left: '2' }],
      lines: [
        {
          id: 'l1',
          kind: 'depth',
          depth: '5',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        },
        { id: 'l2', kind: 'nope', points: [{ x: 0, y: 0 }] },
        {
          id: 'l3',
          kind: 'shoreline',
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      origin: { lat: '51.6', lon: 3.9 },
      underlay: { ref: 'generated:x', scale: '0.2', opacity: 3 },
    });
    expect(map.nodes[0].object_kind).toBe('wipkip');
    expect(map.nodes[0].left).toBe(2);
    expect(map.lines.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(map.lines[0].depth).toBe(5);
    expect(map.lines[1].closed).toBe(true);
    expect(map.origin).toEqual({ lat: 51.6, lon: 3.9 });
    expect(map.underlay).toMatchObject({ ref: 'generated:x', scale: 0.2, opacity: 1 });
    expect(mapBounds(map, 0).maxX).toBe(10);
    expect(legendFor(map).map(legendKey)).toEqual([
      'object:wipkip',
      'line:shoreline',
      'line:depth',
      'text:↓12 m',
    ]);
  });

  it('adds, edits and measures lines', () => {
    const start = emptySiteMap('sitemap');
    const { map, id } = addLine(start, 'path', [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
    ]);
    expect(id).toBe('l1');
    expect(lineLength(map.lines[0])).toBe(50);
    const moved = moveLinePoint(map, id, 1, 0, 40);
    expect(lineLength(moved.lines[0])).toBe(40);
    const labelled = updateLine(moved, id, { label: 'loop', id: 'ignored' });
    expect(labelled.lines[0]).toMatchObject({ id, label: 'loop' });
    expect(removeLine(labelled, id).lines).toEqual([]);
    expect(addLine(start, 'path', [{ x: 0, y: 0 }]).id).toBe('');
    expect(mapSummary(labelled)).toContain('1 path');
  });

  it('places survey shots by distance and bearing, relative to the drawing north', () => {
    expect(placeByBearing(0, 0, 10, 90, 0)).toEqual({ x: 10, y: 0 });
    expect(placeByBearing(0, 0, 10, 0, 0)).toEqual({ x: 0, y: -10 });
    expect(placeByBearing(0, 0, 10, 90, 90)).toEqual({ x: 0, y: -10 });
    const cave = addNode(emptySiteMap('stickmap'), 0, 0);
    const shot = addSurveyShot(cave.map, cave.id, 20, 180, 12);
    expect(shot.map.nodes[1]).toMatchObject({ x: 0, y: 20, depth: 12 });
    expect(shot.map.edges[0]).toMatchObject({ distance: 20, azimuth: 180 });
    expect(addSurveyShot(cave.map, 'nope', 5, 0, null).id).toBe('');
    expect(
      toLatLon({ ...shot.map, origin: { lat: 50, lon: 5 } }, { x: 0, y: -1113.2 })?.lat,
    ).toBeCloseTo(50.01, 5);
    expect(toLatLon(shot.map, { x: 0, y: 0 })).toBeNull();
  });

  it('turns a drawing point into a position the same way survey shots and the locator do', () => {
    const origin = { lat: 0, lon: 0 };
    for (const north of [0, 13, 90, 270, 357.6]) {
      const map = { ...emptySiteMap('stickmap'), north, origin };
      const shot = placeByBearing(0, 0, 1000, 90, north);
      const east = toLatLon(map, shot)!;
      expect(east.lat).toBeCloseTo(0, 5);
      expect(east.lon * 111320).toBeCloseTo(1000, 0);
      const world = drawingToWorld(shot, north);
      expect(world.x).toBeCloseTo(1000, 1);
      expect(world.y).toBeCloseTo(0, 1);
    }
    const up = toLatLon({ ...emptySiteMap('stickmap'), north: 90, origin }, { x: 0, y: -1000 })!;
    expect(up.lon * 111320).toBeCloseTo(1000, 0);
    expect(up.lat).toBeCloseTo(0, 5);
  });
});

describe('dive annotations', () => {
  const stored = (map: ReturnType<typeof emptySiteMap>) => ({
    ...map,
    id: 'm1',
    revision: 2,
    changelog: [],
    site_id: 'ressel',
    sort: 0,
    updated_at: '2026-09-12T10:00:00Z',
  });

  it('toggles route legs regardless of direction and measures them', () => {
    const a = addNode(emptySiteMap(), 0, 0);
    const b = addNode(a.map, 30, 40, a.id);
    const c = addNode(b.map, 60, 40, b.id);
    const map = stored(updateNode(c.map, c.id, { label: 'Far end', depth: 21 }));
    let ann = emptyAnnotation(map);
    expect(ann).toMatchObject({ map_id: 'm1', revision: 2, route: [], turn: null });
    ann = toggleRouteLeg(ann, b.id, a.id);
    ann = toggleRouteLeg(ann, b.id, c.id);
    expect(routeLength(map, ann)).toBe(80);
    ann = toggleRouteLeg(ann, a.id, b.id);
    expect(ann.route).toEqual([{ from: b.id, to: c.id }]);
    expect(edgeKey('z', 'a')).toBe('a|z');
    const withTurn = { ...ann, turn: c.id };
    expect(annotationSummary(map, withTurn)).toBe('30 m swum · turned at Far end (↓21 m)');
  });

  it('manages pins and drops legs the map no longer has', () => {
    const a = addNode(emptySiteMap(), 0, 0);
    const b = addNode(a.map, 10, 0, a.id);
    const map = stored(b.map);
    const { annotation, id } = addPin(emptyAnnotation(map), 5, 5, 'silty');
    expect(annotation.pins).toEqual([{ id, x: 5, y: 5, note: 'silty' }]);
    const renamed = updatePin(annotation, id, { note: 'very silty', id: 'nope' });
    expect(renamed.pins[0]).toMatchObject({ id, note: 'very silty' });
    expect(removePin(renamed, id).pins).toEqual([]);
    const routed = { ...toggleRouteLeg(renamed, a.id, b.id), turn: b.id };
    const shrunk = fitAnnotation(removeNode(map, b.id), routed);
    expect(shrunk.route).toEqual([]);
    expect(shrunk.turn).toBeNull();
    expect(shrunk.pins).toHaveLength(1);
    expect(annotationSummary(map, renamed)).toBe('1 note');
  });
});

describe('depth bands', () => {
  it('paints bands shallow to deep, ahead of every other area', () => {
    const map = normalizeSiteMap({
      kind: 'sitemap',
      areas: [
        { id: 'coral', kind: 'coral', points: square(), depth: 8 },
        { id: 'deep', kind: 'depth', points: square(), depth: 25 },
        { id: 'shallow', kind: 'depth', points: square(), depth: 5 },
        { id: 'shore', kind: 'outline', points: square() },
      ],
    });
    expect(orderedAreas(map).map((a) => a.id)).toEqual(['shallow', 'deep', 'coral', 'shore']);
  });

  it('counts area depths towards the deepest point', () => {
    const map = normalizeSiteMap({
      kind: 'sitemap',
      areas: [{ id: 'a1', kind: 'depth', points: square(), depth: 24 }],
    });
    expect(maxDepth(map)).toBe(24);
  });

  it('darkens the water with depth and keeps the ramp in range', () => {
    const surface = depthFill(0, 30);
    const bottom = depthFill(30, 30);
    expect(surface).not.toBe(bottom);
    expect(depthFill(60, 30)).toBe(bottom);
    expect(depthFill(null, 0)).toBe(depthFill(0, 0));
  });
});

function square() {
  return [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
}

describe('north bearing', () => {
  it('defaults to a north-up plan', () => {
    expect(emptySiteMap('sitemap').north).toBe(0);
    expect(normalizeSiteMap({}).north).toBe(0);
  });

  it('wraps a stored bearing into a single turn and ignores nonsense', () => {
    expect(normalizeSiteMap({ north: 400 }).north).toBe(40);
    expect(normalizeSiteMap({ north: -45 }).north).toBe(315);
    expect(normalizeSiteMap({ north: 'east' }).north).toBe(0);
  });
});

describe('directed routes', () => {
  // entrance a - b - c in a line, with a side branch b - d and a jump c - e.
  const map = normalizeSiteMap({
    nodes: [
      { id: 'a', x: 0, y: 0, type: 'entrance' },
      { id: 'b', x: 30, y: 0, type: 't' },
      { id: 'c', x: 60, y: 0 },
      { id: 'd', x: 30, y: 40 },
      { id: 'e', x: 70, y: 0, type: 'jump' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'e', style: 'jump' },
    ],
  });
  const empty = {
    map_id: 'm',
    revision: 1,
    route: [],
    turn: null,
    pins: [],
    path: [],
    turn_at: null,
    note: '',
  };

  it('starts at the entrance and fills the way to a clicked station', () => {
    expect(routeEnd(map, empty)).toBe('a');
    const out = extendRoute(map, empty, 'e');
    expect(out.route).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'e' },
    ]);
    expect(routeEnd(map, out)).toBe('e');
  });

  it('comes back the same way when the entrance is clicked again, counting the metres twice', () => {
    const out = extendRoute(map, empty, 'd');
    const back = extendRoute(map, out, 'a');
    expect(back.route).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'd' },
      { from: 'd', to: 'b' },
      { from: 'b', to: 'a' },
    ]);
    expect(routeLength(map, back)).toBe(140);
  });

  it('extends across a clicked leg from its nearer end', () => {
    const viaLeg = extendRouteAlong(map, empty, { from: 'd', to: 'b' });
    expect(viaLeg.route).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'd' },
    ]);
  });

  it('leaves the route alone for unreachable or same-place clicks and trims steps', () => {
    expect(pathBetween(map, 'a', 'a')).toEqual([]);
    expect(pathBetween({ ...map, edges: [] }, 'a', 'b')).toBeNull();
    expect(extendRoute(map, empty, 'a')).toBe(empty);
    const out = extendRoute(map, empty, 'c');
    expect(trimRoute(out, 1).route).toEqual([{ from: 'a', to: 'b' }]);
    expect(trimRoute(out, 5).route).toEqual([]);
  });

  it('drops the turn point with the legs that reached it, and keeps one set elsewhere', () => {
    const out = { ...extendRoute(map, empty, 'c'), turn: 'c' };
    expect(trimRoute(out, 1).turn).toBeNull();
    const atB = { ...out, turn: 'b' };
    expect(trimRoute(atB, 1).turn).toBe('b');
    expect(trimRoute(atB, 2).turn).toBeNull();
    const offRoute = { ...out, turn: 'd' };
    expect(trimRoute(offRoute, 2).turn).toBe('d');
  });
});

describe('way in and way out', () => {
  const ab = { from: 'a', to: 'b' };
  const bc = { from: 'b', to: 'c' };
  const cb = { from: 'c', to: 'b' };
  const ba = { from: 'b', to: 'a' };

  it('splits the route at the turn point', () => {
    expect(legPhases([ab, bc, cb, ba], 'c')).toEqual(['in', 'in', 'out', 'out']);
    expect(legPhases([ab, bc], 'c')).toEqual(['in', 'in']);
  });

  it('treats a leg swum a second time as the way out when no turn is marked', () => {
    expect(legPhases([ab, bc, cb, ba], null)).toEqual(['in', 'in', 'out', 'out']);
    expect(legPhases([ab, bc, { from: 'c', to: 'd' }], null)).toEqual(['in', 'in', 'in']);
  });

  it('measures a free track', () => {
    expect(pathLength([])).toBe(0);
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 40 },
      ]),
    ).toBe(70);
  });
});

describe('route highlights', () => {
  function cave() {
    const a = addNode(emptySiteMap(), 0, 0);
    const b = addNode(a.map, 10, 0, a.id);
    const c = addNode(b.map, 20, 0, b.id);
    const d = addNode(c.map, 70, 0, c.id);
    let map = updateNode(d.map, a.id, { label: 'Entrance', depth: 3 });
    map = updateNode(map, b.id, { label: '', depth: 12 });
    map = updateNode(map, c.id, { label: 'Pit', depth: 18 });
    map = updateNode(map, d.id, { label: 'Sump', depth: 9 });
    const out = {
      ...map,
      id: 'm1',
      revision: 1,
      changelog: [],
      site_id: 's',
      sort: 0,
      updated_at: null,
    };
    return { map: out, ids: [a.id, b.id, c.id, d.id] };
  }

  it('names the turn and the deepest station on the route', () => {
    const { map, ids } = cave();
    const [a, b, c, d] = ids;
    const ann = {
      ...emptyAnnotation(map),
      route: [
        { from: a, to: b },
        { from: b, to: c },
        { from: c, to: d },
      ],
      turn: d,
    };
    expect(routeHighlights(map, ann)).toEqual({
      turnedAt: 'Sump',
      deepest: { label: 'Pit', depth: 18 },
    });
  });

  it('only looks at stations the dive reached', () => {
    const { map, ids } = cave();
    const [a, b] = ids;
    const ann = { ...emptyAnnotation(map), route: [{ from: a, to: b }], turn: b };
    expect(routeHighlights(map, ann)).toEqual({
      turnedAt: null,
      deepest: { label: 'Entrance', depth: 12 },
    });
  });

  it('borrows the nearest label along the route for an unlabelled deepest station', () => {
    const { map, ids } = cave();
    const [a, b, c] = ids;
    const deeper = updateNode(map, b, { depth: 30 });
    const stored = { ...map, ...deeper };
    const ann = {
      ...emptyAnnotation(stored),
      route: [
        { from: a, to: b },
        { from: b, to: c },
      ],
    };
    expect(routeHighlights(stored, ann).deepest).toEqual({ label: 'Entrance', depth: 30 });
    const moved = { ...stored, ...moveNode(stored, a, -30, 0) };
    expect(routeHighlights(moved, ann).deepest).toEqual({ label: 'Pit', depth: 30 });
  });

  it('gives nothing without depths, without a route, or for a free track', () => {
    const { map, ids } = cave();
    const [a, b] = ids;
    const flat = { ...map, nodes: map.nodes.map((n) => ({ ...n, depth: null })) };
    const leg = { ...emptyAnnotation(map), route: [{ from: a, to: b }], turn: a };
    expect(routeHighlights(flat, leg)).toEqual({ turnedAt: 'Entrance', deepest: null });
    expect(routeHighlights(map, emptyAnnotation(map))).toEqual({ turnedAt: null, deepest: null });
    const track = {
      ...emptyAnnotation(map),
      path: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      turn_at: 1,
    };
    expect(routeHighlights(map, track)).toEqual({ turnedAt: null, deepest: null });
  });
});

describe('new maps and starter maps', () => {
  it('starts a new map at the site, north-up, or nowhere without coordinates', () => {
    const site = { lat: 52.09, lon: 5.12 };
    const map = emptySiteMap('sitemap', siteOrigin(site));
    expect(map.origin).toEqual({ lat: 52.09, lon: 5.12 });
    expect(map.north).toBe(0);
    expect(map.kind).toBe('sitemap');
    expect(emptySiteMap('stickmap').origin).toBeNull();
    expect(siteOrigin({ lat: null, lon: 5 })).toBeNull();
    expect(emptySiteMap('stickmap', siteOrigin({ lat: 1, lon: null })).origin).toBeNull();
  });

  it('does not share the origin object with the caller', () => {
    const origin = { lat: 1, lon: 2 };
    const map = emptySiteMap('sitemap', origin);
    origin.lat = 9;
    expect(map.origin).toEqual({ lat: 1, lon: 2 });
  });

  it('normalises a seed: a north-up site map at the site, junk dropped', () => {
    const seed = {
      version: 3,
      kind: 'stickmap',
      title: 'Example Quarry',
      north: 40,
      to_scale: true,
      nodes: [
        { id: 'entry', x: 0, y: 0, type: 'entry' },
        { id: 'bad', x: 'nope', y: 1 },
      ],
      edges: [],
      areas: [
        {
          id: 'water',
          kind: 'outline',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 9 },
          ],
        },
      ],
      lines: [
        {
          id: 'shore',
          kind: 'shoreline',
          points: [
            { x: 0, y: 0 },
            { x: 40, y: 3 },
          ],
        },
      ],
      notes: '',
      origin: null,
      underlay: { ref: 'scan:x', scale: 1, dx: 0, dy: 0, rotation: 0, opacity: 0.5 },
    };
    const draft = seedDraft(seed, { lat: 52, lon: 5 });
    expect(draft.kind).toBe('sitemap');
    expect(draft.north).toBe(0);
    expect(draft.origin).toEqual({ lat: 52, lon: 5 });
    expect(draft.underlay).toBeNull();
    expect(draft.nodes.map((n) => n.id)).toEqual(['entry']);
    expect(draft.areas).toHaveLength(1);
    expect(draft.lines[0].kind).toBe('shoreline');
  });

  it('keeps the origin the seed carries', () => {
    const draft = seedDraft({ kind: 'sitemap', origin: { lat: 10, lon: 20 } }, { lat: 1, lon: 2 });
    expect(draft.origin).toEqual({ lat: 10, lon: 20 });
    expect(seedDraft(null, null).origin).toBeNull();
  });

  it('moves one corner of an area and leaves the rest', () => {
    const { map, id } = addArea(emptySiteMap('sitemap'), 'outline', [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ]);
    const moved = moveAreaPoint(map, id, 1, 12, 2);
    expect(moved.areas[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 2 },
      { x: 5, y: 8 },
    ]);
    expect(map.areas[0].points[1]).toEqual({ x: 10, y: 0 });
    expect(moveAreaPoint(map, 'nope', 0, 1, 1).areas).toEqual(map.areas);
  });
});
