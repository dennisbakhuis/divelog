/**
 * Site maps: hand-drawn plans stored with a dive site. A map is stations and
 * objects (nodes), the lines between them (edges), free polylines such as a
 * shoreline, a depth contour or a dive path (lines), and closed areas such as
 * a wreck footprint (areas). Coordinates are metres in plan view (x east,
 * y south), so an edge without a measured distance falls back to its drawn
 * length.
 *
 * Two kinds share the format: a cave "stickmap" (line survey) and a lake or
 * wreck "sitemap". The kind only changes which markers are offered and how
 * the map is summarised. Version 3 added lines, object pictograms, survey
 * azimuths, a geographic origin and a tracing underlay.
 */

import type { components } from './api';

/** One line of a drawn map's changelog: the revision it produced, when, by whom and why. */
export type ChangeEntry = components['schemas']['ChangeEntry'];

export type MapKind = 'stickmap' | 'sitemap';

export type NodeType =
  | 'entrance'
  | 'station'
  | 't'
  | 'jump'
  | 'restriction'
  | 'end'
  | 'air'
  | 'marker'
  | 'entry'
  | 'platform'
  | 'wreck'
  | 'object'
  | 'buoy'
  | 'hazard'
  | 'poi';

export type EdgeStyle = 'line' | 'jump' | 'unsurveyed' | 'route';

export type AreaKind =
  'outline' | 'depth' | 'shallows' | 'coral' | 'sand' | 'wall' | 'wreck' | 'reeds' | 'other';

export type ObjectKind =
  | 'bus'
  | 'car'
  | 'plane'
  | 'boat'
  | 'wreck'
  | 'platform'
  | 'wipkip'
  | 'statue'
  | 'container'
  | 'pipe'
  | 'tree'
  | 'ladder'
  | 'cage'
  | 'net'
  | 'anchor'
  | 'pinnacle'
  | 'house'
  | 'caravan'
  | 'lighthouse'
  | 'machine'
  | 'ruin'
  | 'gate'
  | 'reel'
  | 'postbox'
  | 'bridge'
  | 'shark'
  | 'hopper'
  | 'truck'
  | 'turtle'
  | 'other';

export type LineKind = 'shoreline' | 'depth' | 'path' | 'wall' | 'pipe' | 'line';

export type MapNode = {
  id: string;
  x: number;
  y: number;
  type: NodeType;
  label: string;
  depth: number | null;
  /** Which pictogram an `object` node draws. */
  object_kind: ObjectKind | null;
  /** Passage width to the left and right of a survey station, in metres. */
  left: number | null;
  right: number | null;
  /** Overrides the pictogram's default colour; a CSS hex colour. */
  color: string | null;
};

export type MapEdge = {
  from: string;
  to: string;
  distance: number | null;
  /** Compass bearing of the shot from `from` to `to`, when surveyed. */
  azimuth: number | null;
  note: string;
  style: EdgeStyle;
};

export type MapLine = {
  id: string;
  kind: LineKind;
  label: string;
  depth: number | null;
  closed: boolean;
  points: MapPoint[];
};

export type MapOrigin = { lat: number; lon: number };

/** A map shown under the canvas while drawing; never part of the published drawing. */
export type MapUnderlay = {
  ref: string;
  scale: number;
  dx: number;
  dy: number;
  rotation: number;
  opacity: number;
};

export type MapPoint = { x: number; y: number };

export type MapArea = {
  id: string;
  kind: AreaKind;
  label: string;
  /** Depth of the feature, or of the shallow edge of a depth band. */
  depth: number | null;
  points: MapPoint[];
};

export type SiteMap = {
  version: number;
  kind: MapKind;
  title: string;
  /**
   * Compass bearing that "up" on the drawing points to, in degrees. 0 is a
   * north-up plan; a shore or a cave passage is usually easier to read drawn
   * along the page, and the compass needle swings to match.
   */
  north: number;
  /**
   * False for a drawing whose geometry was never measured (a hand sketch):
   * no line lengths or scale bar are shown, since they would be invented.
   */
  to_scale: boolean;
  nodes: MapNode[];
  edges: MapEdge[];
  areas: MapArea[];
  lines: MapLine[];
  notes: string;
  origin: MapOrigin | null;
  underlay: MapUnderlay | null;
};

/** A stored map as the API returns it; `revision` counts saves, git holds the history. */
export type SiteMapOut = SiteMap & {
  id: string;
  site_id: string;
  sort: number;
  revision: number;
  changelog: ChangeEntry[];
  updated_at: string | null;
};

export type MapEdgeRef = { from: string; to: string };

export type DiveMapPin = { id: string; x: number; y: number; note: string };

/** What one dive did on a site map. */
export type DiveMapAnnotation = {
  map_id: string;
  revision: number;
  /** Legs of the drawn line in swim order (stick maps); a leg swum back appears again. */
  route: MapEdgeRef[];
  turn: string | null;
  pins: DiveMapPin[];
  /** A free-drawn track in map metres (site maps). */
  path: MapPoint[];
  /** Index of the path point where the dive turned. */
  turn_at: number | null;
  note: string;
};

export type LegPhase = 'in' | 'out';

/**
 * Which legs were swum on the way in and which on the way out. The turn point
 * splits the route; without one, a leg swum a second time counts as the way out.
 */
export function legPhases(route: MapEdgeRef[], turn: string | null): LegPhase[] {
  const turnAt = turn ? route.findIndex((l) => l.to === turn) : -1;
  if (turnAt >= 0) return route.map((_, i) => (i <= turnAt ? 'in' : 'out'));
  const seen = new Set<string>();
  return route.map((l) => {
    const key = edgeKey(l.from, l.to);
    const again = seen.has(key);
    seen.add(key);
    return again ? 'out' : 'in';
  });
}

export function pathLength(points: MapPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return sum;
}

export const MAP_KINDS: { kind: MapKind; label: string; hint: string }[] = [
  {
    kind: 'stickmap',
    label: 'Stick map',
    hint: 'Cave line survey: stations, T’s, jumps and where the line ends',
  },
  {
    kind: 'sitemap',
    label: 'Site map',
    hint: 'Lake, quarry or wreck: entry, platforms, objects, routes and the shore',
  },
];

export const NODE_TYPES: { type: NodeType; label: string; hint: string; kinds: MapKind[] }[] = [
  { type: 'entrance', label: 'Entrance', hint: 'Where the cave starts', kinds: ['stickmap'] },
  { type: 'entry', label: 'Entry / exit', hint: 'Where you get in the water', kinds: ['sitemap'] },
  {
    type: 'station',
    label: 'Station',
    hint: 'Survey station, tie-off or waypoint',
    kinds: ['stickmap', 'sitemap'],
  },
  { type: 't', label: 'T', hint: 'Permanent T in the line', kinds: ['stickmap'] },
  {
    type: 'jump',
    label: 'Jump',
    hint: 'Gap to another line, needs a jump reel',
    kinds: ['stickmap'],
  },
  { type: 'restriction', label: 'Restriction', hint: 'Tight spot', kinds: ['stickmap'] },
  { type: 'end', label: 'End of line', hint: 'Line ends here', kinds: ['stickmap'] },
  { type: 'air', label: 'Air', hint: 'Air bell or sump surface', kinds: ['stickmap'] },
  { type: 'platform', label: 'Platform', hint: 'Training platform', kinds: ['sitemap'] },
  { type: 'wreck', label: 'Wreck', hint: 'Boat, plane or other wreck', kinds: ['sitemap'] },
  {
    type: 'object',
    label: 'Object',
    hint: 'Car, statue, cage, anything sunk on purpose',
    kinds: ['sitemap'],
  },
  { type: 'buoy', label: 'Buoy', hint: 'Surface marker or descent line', kinds: ['sitemap'] },
  { type: 'hazard', label: 'Hazard', hint: 'Drop-off, current, entanglement', kinds: ['sitemap'] },
  { type: 'poi', label: 'Point of interest', hint: 'Worth a look', kinds: ['sitemap'] },
  {
    type: 'marker',
    label: 'Marker',
    hint: 'Cookie, arrow or other reference',
    kinds: ['stickmap', 'sitemap'],
  },
];

export const EDGE_STYLES: { style: EdgeStyle; label: string; kinds: MapKind[] }[] = [
  { style: 'line', label: 'Line', kinds: ['stickmap', 'sitemap'] },
  { style: 'jump', label: 'Jump (no line)', kinds: ['stickmap'] },
  { style: 'unsurveyed', label: 'Unsurveyed', kinds: ['stickmap', 'sitemap'] },
  { style: 'route', label: 'Swim route', kinds: ['sitemap'] },
];

export const AREA_KINDS: { kind: AreaKind; label: string }[] = [
  { kind: 'outline', label: 'Shore / outline' },
  { kind: 'depth', label: 'Depth band' },
  { kind: 'shallows', label: 'Shallows' },
  { kind: 'coral', label: 'Coral / reef' },
  { kind: 'sand', label: 'Sand' },
  { kind: 'wall', label: 'Wall / drop-off' },
  { kind: 'wreck', label: 'Wreck footprint' },
  { kind: 'reeds', label: 'Reeds / weed' },
  { kind: 'other', label: 'Other area' },
];

export const OBJECT_KINDS: { kind: ObjectKind; label: string }[] = [
  { kind: 'bus', label: 'Bus' },
  { kind: 'car', label: 'Car' },
  { kind: 'plane', label: 'Aeroplane' },
  { kind: 'boat', label: 'Boat' },
  { kind: 'wreck', label: 'Wreck' },
  { kind: 'platform', label: 'Platform' },
  { kind: 'wipkip', label: 'Wipkip' },
  { kind: 'statue', label: 'Statue' },
  { kind: 'container', label: 'Container' },
  { kind: 'pipe', label: 'Pipe / tube' },
  { kind: 'tree', label: 'Tree' },
  { kind: 'ladder', label: 'Ladder / stairs' },
  { kind: 'cage', label: 'Cage' },
  { kind: 'net', label: 'Net' },
  { kind: 'anchor', label: 'Anchor' },
  { kind: 'pinnacle', label: 'Pinnacle / rock' },
  { kind: 'house', label: 'House / hut' },
  { kind: 'caravan', label: 'Caravan' },
  { kind: 'lighthouse', label: 'Lighthouse / tower' },
  { kind: 'machine', label: 'Machinery' },
  { kind: 'ruin', label: 'Ruin / rubble' },
  { kind: 'gate', label: 'Gate' },
  { kind: 'reel', label: 'Cable reel' },
  { kind: 'postbox', label: 'Postbox' },
  { kind: 'bridge', label: 'Bridge' },
  { kind: 'shark', label: 'Shark' },
  { kind: 'hopper', label: 'Hopper / silo' },
  { kind: 'truck', label: 'Truck' },
  { kind: 'turtle', label: 'Turtle' },
  { kind: 'other', label: 'Other object' },
];

export const LINE_KINDS: { kind: LineKind; label: string; hint: string }[] = [
  { kind: 'shoreline', label: 'Shoreline', hint: 'Where the water starts' },
  { kind: 'depth', label: 'Depth contour', hint: 'A line of equal depth, labelled in metres' },
  { kind: 'path', label: 'Dive path', hint: 'A route worth swimming, with direction arrows' },
  { kind: 'wall', label: 'Wall / drop-off', hint: 'A steep edge' },
  { kind: 'pipe', label: 'Pipe / cable', hint: 'Something long lying on the bottom' },
  { kind: 'line', label: 'Guide line', hint: 'A fixed line or rope between points' },
];

export function nodeTypesFor(kind: MapKind): typeof NODE_TYPES {
  return NODE_TYPES.filter((t) => t.kinds.includes(kind));
}

export function edgeStylesFor(kind: MapKind): typeof EDGE_STYLES {
  return EDGE_STYLES.filter((s) => s.kinds.includes(kind));
}

export function defaultTitle(kind: MapKind): string {
  return MAP_KINDS.find((k) => k.kind === kind)?.label ?? 'Map';
}

/**
 * A blank map. `origin` is where the drawing's (0, 0) sits, normally the site's position, so a
 * new map is placed on the globe from the start; the drawing starts north-up.
 */
export function emptySiteMap(kind: MapKind = 'stickmap', origin?: MapOrigin | null): SiteMap {
  return {
    version: 3,
    kind,
    title: '',
    north: 0,
    to_scale: true,
    nodes: [],
    edges: [],
    areas: [],
    lines: [],
    notes: '',
    origin: origin ? { lat: origin.lat, lon: origin.lon } : null,
    underlay: null,
  };
}

/** The origin a site gives a new map: its position, or null when it has none. */
export function siteOrigin(site: { lat: number | null; lon: number | null }): MapOrigin | null {
  return site.lat === null || site.lon === null ? null : { lat: site.lat, lon: site.lon };
}

/**
 * A starter map from the server's seed endpoint as an editor draft: normalised, a site map,
 * north-up, and placed at the site when the payload carries no origin of its own.
 */
export function seedDraft(input: unknown, origin: MapOrigin | null): SiteMap {
  const map = normalizeSiteMap(input);
  return { ...map, kind: 'sitemap', north: 0, origin: map.origin ?? origin, underlay: null };
}

/** Bearings wrap, so keep whatever was stored inside a single turn. */
function bearing(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Fill in defaults so partially stored maps (or hand-written JSON) render. */
export function normalizeSiteMap(input: unknown): SiteMap {
  const raw = (input ?? {}) as Record<string, unknown>;
  const kind: MapKind = raw.kind === 'sitemap' ? 'sitemap' : 'stickmap';
  const nodes = Array.isArray(raw.nodes) ? (raw.nodes as Record<string, unknown>[]) : [];
  const edges = Array.isArray(raw.edges) ? (raw.edges as Record<string, unknown>[]) : [];
  const areas = Array.isArray(raw.areas) ? (raw.areas as Record<string, unknown>[]) : [];
  const lines = Array.isArray(raw.lines) ? (raw.lines as Record<string, unknown>[]) : [];
  const ids = new Set<string>();
  const cleanNodes: MapNode[] = [];
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id)) continue;
    if (!Number.isFinite(Number(n.x)) || !Number.isFinite(Number(n.y))) continue;
    ids.add(n.id);
    cleanNodes.push({
      id: n.id,
      x: Number(n.x),
      y: Number(n.y),
      type: NODE_TYPES.find((t) => t.type === n.type)?.type ?? 'station',
      label: text(n.label, 80),
      depth: numberOrNull(n.depth),
      object_kind: OBJECT_KINDS.find((k) => k.kind === n.object_kind)?.kind ?? null,
      left: numberOrNull(n.left),
      right: numberOrNull(n.right),
      color: typeof n.color === 'string' && /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : null,
    });
  }
  const cleanEdges: MapEdge[] = [];
  for (const e of edges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    const candidate = { from: e.from, to: e.to };
    if (cleanEdges.some((x) => sameEdge(x, candidate))) continue;
    cleanEdges.push({
      ...candidate,
      distance: numberOrNull(e.distance),
      azimuth: e.azimuth === null || e.azimuth === undefined ? null : bearing(e.azimuth),
      note: text(e.note, 120),
      style: EDGE_STYLES.find((s) => s.style === e.style)?.style ?? 'line',
    });
  }
  const areaIds = new Set<string>();
  const cleanAreas: MapArea[] = [];
  for (const a of areas) {
    if (!a || typeof a.id !== 'string' || !a.id || areaIds.has(a.id)) continue;
    const points = (Array.isArray(a.points) ? (a.points as Record<string, unknown>[]) : [])
      .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
    if (points.length < 3) continue;
    areaIds.add(a.id);
    cleanAreas.push({
      id: a.id,
      kind: AREA_KINDS.find((k) => k.kind === a.kind)?.kind ?? 'outline',
      label: text(a.label, 80),
      depth: numberOrNull(a.depth),
      points,
    });
  }
  const lineIds = new Set<string>();
  const cleanLines: MapLine[] = [];
  for (const l of lines) {
    if (!l || typeof l.id !== 'string' || !l.id || lineIds.has(l.id)) continue;
    const points = (Array.isArray(l.points) ? (l.points as Record<string, unknown>[]) : [])
      .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
    if (points.length < 2) continue;
    lineIds.add(l.id);
    cleanLines.push({
      id: l.id,
      kind: LINE_KINDS.find((k) => k.kind === l.kind)?.kind ?? 'path',
      label: text(l.label, 80),
      depth: numberOrNull(l.depth),
      closed: l.closed === true,
      points,
    });
  }
  const origin = raw.origin as Record<string, unknown> | null | undefined;
  const lat = numberOrNull(origin?.lat);
  const lon = numberOrNull(origin?.lon);
  const under = raw.underlay as Record<string, unknown> | null | undefined;
  return {
    version: 3,
    kind,
    title: text(raw.title, 120),
    north: bearing(raw.north),
    to_scale: raw.to_scale !== false,
    nodes: cleanNodes,
    edges: cleanEdges,
    areas: cleanAreas,
    lines: cleanLines,
    notes: text(raw.notes, 2000),
    origin: lat !== null && lon !== null ? { lat, lon } : null,
    underlay:
      under && typeof under.ref === 'string' && under.ref
        ? {
            ref: under.ref,
            scale: numberOrNull(under.scale) ?? 1,
            dx: numberOrNull(under.dx) ?? 0,
            dy: numberOrNull(under.dy) ?? 0,
            rotation: numberOrNull(under.rotation) ?? 0,
            opacity: Math.min(1, Math.max(0, numberOrNull(under.opacity) ?? 0.5)),
          }
        : null,
  };
}

function sameEdge(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
}

export function nextId(existing: { id: string }[], prefix: string): string {
  let n = existing.length + 1;
  while (existing.some((item) => item.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function findNode(map: SiteMap, id: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === id);
}

export function addNode(
  map: SiteMap,
  x: number,
  y: number,
  connectTo: string | null = null,
): { map: SiteMap; id: string } {
  const id = nextId(map.nodes, 'n');
  const first: NodeType = map.kind === 'sitemap' ? 'entry' : 'entrance';
  const type: NodeType = map.nodes.length === 0 ? first : 'station';
  const node: MapNode = {
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
  const edges = [...map.edges];
  if (connectTo && findNode(map, connectTo)) {
    edges.push({
      from: connectTo,
      to: id,
      distance: null,
      azimuth: null,
      note: '',
      style: 'line',
    });
  }
  return { map: { ...map, nodes: [...map.nodes, node], edges }, id };
}

export function removeNode(map: SiteMap, id: string): SiteMap {
  return {
    ...map,
    nodes: map.nodes.filter((n) => n.id !== id),
    edges: map.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function updateNode(map: SiteMap, id: string, patch: Partial<MapNode>): SiteMap {
  return { ...map, nodes: map.nodes.map((n) => (n.id === id ? { ...n, ...patch, id } : n)) };
}

export function moveNode(map: SiteMap, id: string, x: number, y: number): SiteMap {
  return updateNode(map, id, { x, y });
}

/** Connect two stations, or remove the line between them if it already exists. */
export function toggleEdge(map: SiteMap, a: string, b: string): SiteMap {
  if (a === b || !findNode(map, a) || !findNode(map, b)) return map;
  const existing = map.edges.find((e) => sameEdge(e, { from: a, to: b }));
  if (existing) return { ...map, edges: map.edges.filter((e) => e !== existing) };
  return {
    ...map,
    edges: [
      ...map.edges,
      { from: a, to: b, distance: null, azimuth: null, note: '', style: 'line' },
    ],
  };
}

/**
 * Where a survey shot lands: `distance` metres from (x, y) on compass bearing
 * `azimuth`, on a drawing whose top points to `north`. y grows southward.
 */
export function placeByBearing(
  x: number,
  y: number,
  distance: number,
  azimuth: number,
  north: number,
): MapPoint {
  const rad = ((azimuth - north) * Math.PI) / 180;
  return {
    x: Math.round((x + distance * Math.sin(rad)) * 100) / 100 + 0,
    y: Math.round((y - distance * Math.cos(rad)) * 100) / 100 + 0,
  };
}

/** Add a surveyed station: a shot of `distance` metres on `azimuth` from `fromId`. */
export function addSurveyShot(
  map: SiteMap,
  fromId: string,
  distance: number,
  azimuth: number,
  depth: number | null,
): { map: SiteMap; id: string } {
  const from = findNode(map, fromId);
  if (!from || !(distance > 0)) return { map, id: '' };
  const at = placeByBearing(from.x, from.y, distance, azimuth, map.north);
  const added = addNode(map, at.x, at.y, fromId);
  const withDepth = updateNode(added.map, added.id, { depth });
  return {
    map: updateEdge(withDepth, fromId, added.id, { distance, azimuth: bearing(azimuth) }),
    id: added.id,
  };
}

export function updateEdge(
  map: SiteMap,
  from: string,
  to: string,
  patch: Partial<MapEdge>,
): SiteMap {
  return {
    ...map,
    edges: map.edges.map((e) => (sameEdge(e, { from, to }) ? { ...e, ...patch } : e)),
  };
}

export function addArea(
  map: SiteMap,
  kind: AreaKind,
  points: MapPoint[],
): { map: SiteMap; id: string } {
  const id = nextId(map.areas, 'a');
  if (points.length < 3) return { map, id: '' };
  const area: MapArea = {
    id,
    kind,
    label: '',
    depth: null,
    points: points.map((p) => ({ ...p })),
  };
  return { map: { ...map, areas: [...map.areas, area] }, id };
}

export function updateArea(map: SiteMap, id: string, patch: Partial<MapArea>): SiteMap {
  return { ...map, areas: map.areas.map((a) => (a.id === id ? { ...a, ...patch, id } : a)) };
}

export function removeArea(map: SiteMap, id: string): SiteMap {
  return { ...map, areas: map.areas.filter((a) => a.id !== id) };
}

export function addLine(
  map: SiteMap,
  kind: LineKind,
  points: MapPoint[],
  closed = false,
): { map: SiteMap; id: string } {
  const id = nextId(map.lines, 'l');
  if (points.length < 2) return { map, id: '' };
  const line: MapLine = {
    id,
    kind,
    label: '',
    depth: null,
    closed: closed && points.length >= 3,
    points: points.map((p) => ({ ...p })),
  };
  return { map: { ...map, lines: [...map.lines, line] }, id };
}

export function updateLine(map: SiteMap, id: string, patch: Partial<MapLine>): SiteMap {
  return { ...map, lines: map.lines.map((l) => (l.id === id ? { ...l, ...patch, id } : l)) };
}

export function removeLine(map: SiteMap, id: string): SiteMap {
  return { ...map, lines: map.lines.filter((l) => l.id !== id) };
}

export function moveLinePoint(
  map: SiteMap,
  id: string,
  index: number,
  x: number,
  y: number,
): SiteMap {
  return {
    ...map,
    lines: map.lines.map((l) =>
      l.id === id ? { ...l, points: l.points.map((p, i) => (i === index ? { x, y } : p)) } : l,
    ),
  };
}

/** Move one corner of an area. */
export function moveAreaPoint(
  map: SiteMap,
  id: string,
  index: number,
  x: number,
  y: number,
): SiteMap {
  return {
    ...map,
    areas: map.areas.map((a) =>
      a.id === id ? { ...a, points: a.points.map((p, i) => (i === index ? { x, y } : p)) } : a,
    ),
  };
}

export function lineLength(line: MapLine): number {
  let total = 0;
  for (let i = 1; i < line.points.length; i++) {
    total += Math.hypot(
      line.points[i].x - line.points[i - 1].x,
      line.points[i].y - line.points[i - 1].y,
    );
  }
  if (line.closed && line.points.length > 2) {
    const first = line.points[0];
    const last = line.points[line.points.length - 1];
    total += Math.hypot(first.x - last.x, first.y - last.y);
  }
  return total;
}

export function edgeEndpoints(map: SiteMap, edge: MapEdge): { a: MapNode; b: MapNode } | null {
  const a = findNode(map, edge.from);
  const b = findNode(map, edge.to);
  return a && b ? { a, b } : null;
}

export function drawnLength(map: SiteMap, edge: MapEdge): number {
  const ends = edgeEndpoints(map, edge);
  if (!ends) return 0;
  return Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y);
}

/** Measured distance when given, otherwise the drawn length rounded to a metre. */
export function edgeLength(map: SiteMap, edge: MapEdge): number {
  return edge.distance ?? Math.round(drawnLength(map, edge));
}

/** Metres of actual line (jumps and swim routes are not line). */
export function totalLine(map: SiteMap): number {
  return map.edges
    .filter((e) => e.style === 'line' || e.style === 'unsurveyed')
    .reduce((sum, e) => sum + edgeLength(map, e), 0);
}

export function maxDepth(map: SiteMap): number | null {
  const depths = [...map.nodes, ...map.areas, ...map.lines]
    .map((item) => item.depth)
    .filter((d): d is number => d !== null);
  return depths.length ? Math.max(...depths) : null;
}

/**
 * Areas in paint order: depth bands first, shallow to deep, so nested bands
 * stack correctly; everything else keeps the order it was drawn in.
 */
export function orderedAreas(map: SiteMap): MapArea[] {
  const bands = map.areas
    .filter((a) => a.kind === 'depth')
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  return [...bands, ...map.areas.filter((a) => a.kind !== 'depth')];
}

/** Water colour for a depth band, from the surface down to `deepest`. */
export function depthFill(depth: number | null, deepest: number): string {
  const t = deepest > 0 ? Math.min(1, Math.max(0, (depth ?? 0) / deepest)) : 0;
  const lightness = 62 - 42 * t;
  const saturation = 58 - 20 * t;
  const alpha = 0.3 + 0.32 * t;
  return `hsl(203 ${saturation.toFixed(0)}% ${lightness.toFixed(0)}% / ${alpha.toFixed(2)})`;
}

/** One-line description shown under a map's title. */
export function mapSummary(map: SiteMap): string {
  const parts: string[] = [];
  const depth = maxDepth(map);
  if (map.kind === 'stickmap') {
    parts.push(`${map.nodes.length} stations`);
    parts.push(map.to_scale ? `${Math.round(totalLine(map))} m of line` : 'not to scale');
  } else {
    const objects = map.nodes.filter((n) =>
      ['platform', 'wreck', 'object', 'poi'].includes(n.type),
    ).length;
    parts.push(`${objects} ${objects === 1 ? 'object' : 'objects'}`);
    const paths = map.lines.filter((l) => l.kind === 'path').length;
    if (paths) parts.push(`${paths} ${paths === 1 ? 'path' : 'paths'}`);
    const line = Math.round(totalLine(map));
    if (line) parts.push(`${line} m of line`);
  }
  if (depth !== null) parts.push(`max ${depth} m`);
  return parts.join(' · ');
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export function mapBounds(map: SiteMap, pad = 12): Box {
  const points: MapPoint[] = [
    ...map.nodes,
    ...map.areas.flatMap((a) => a.points),
    ...map.lines.flatMap((l) => l.points),
  ];
  if (points.length === 0) return { minX: -pad, minY: -pad, maxX: pad, maxY: pad };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad,
    maxY: Math.max(...ys) + pad,
  };
}

export function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

/** Depth text as shown next to a station. */
/** A depth reads "↓12 m", so it is never mistaken for a distance along the line. */
export function depthLabel(depth: number | null): string {
  return depth === null ? '' : `↓${Number.isInteger(depth) ? depth : depth.toFixed(1)} m`;
}

export type LegendEntry =
  | { kind: 'node'; type: NodeType; label: string }
  | { kind: 'object'; object: ObjectKind; label: string }
  | { kind: 'edge'; style: EdgeStyle; label: string }
  | { kind: 'line'; line: LineKind; label: string }
  | { kind: 'area'; area: AreaKind; label: string }
  | { kind: 'text'; text: string; label: string };

export function legendKey(entry: LegendEntry): string {
  switch (entry.kind) {
    case 'node':
      return `node:${entry.type}`;
    case 'object':
      return `object:${entry.object}`;
    case 'edge':
      return `edge:${entry.style}`;
    case 'line':
      return `line:${entry.line}`;
    case 'text':
      return `text:${entry.text}`;
    default:
      return `area:${entry.area}`;
  }
}

/** Only the symbols this map actually uses, in a stable order. */
export function legendFor(map: SiteMap): LegendEntry[] {
  const nodeTypes = new Set(map.nodes.map((n) => n.type));
  const objectKinds = new Set(
    map.nodes.filter((n) => n.type === 'object' && n.object_kind).map((n) => n.object_kind),
  );
  const edgeStyles = new Set(map.edges.map((e) => e.style));
  const lineKinds = new Set(map.lines.map((l) => l.kind));
  const areaKinds = new Set(map.areas.map((a) => a.kind));
  const hasDepth = [...map.nodes, ...map.lines, ...map.areas].some((x) => x.depth !== null);
  return [
    ...NODE_TYPES.filter(
      (t) => nodeTypes.has(t.type) && t.type !== 'station' && t.type !== 'object',
    ).map((t): LegendEntry => ({ kind: 'node', type: t.type, label: t.label })),
    ...(nodeTypes.has('object') && objectKinds.size === 0
      ? [{ kind: 'node', type: 'object', label: 'Object' } as LegendEntry]
      : []),
    ...OBJECT_KINDS.filter((o) => objectKinds.has(o.kind)).map((o): LegendEntry => ({
      kind: 'object',
      object: o.kind,
      label: o.label,
    })),
    ...LINE_KINDS.filter((l) => lineKinds.has(l.kind)).map((l): LegendEntry => ({
      kind: 'line',
      line: l.kind,
      label: l.label,
    })),
    ...EDGE_STYLES.filter((s) => edgeStyles.has(s.style) && s.style !== 'line').map(
      (s): LegendEntry => ({ kind: 'edge', style: s.style, label: s.label }),
    ),
    ...AREA_KINDS.filter((a) => areaKinds.has(a.kind)).map((a): LegendEntry => ({
      kind: 'area',
      area: a.kind,
      label: a.label,
    })),
    ...(hasDepth ? [{ kind: 'text', text: '↓12 m', label: 'Depth' } as LegendEntry] : []),
    ...(map.edges.length
      ? [{ kind: 'text', text: '12 m', label: 'Along the line' } as LegendEntry]
      : []),
  ];
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function emptyAnnotation(map: SiteMapOut): DiveMapAnnotation {
  return {
    map_id: map.id,
    revision: map.revision,
    route: [],
    turn: null,
    pins: [],
    path: [],
    turn_at: null,
    note: '',
  };
}

/** A geographic position for a drawing point, when the map knows where it sits. */
export function toLatLon(map: SiteMap, point: MapPoint): MapOrigin | null {
  if (!map.origin) return null;
  const rad = (map.north * Math.PI) / 180;
  const east = point.x * Math.cos(rad) - -point.y * Math.sin(rad);
  const northM = point.x * Math.sin(rad) + -point.y * Math.cos(rad);
  const lat = map.origin.lat + northM / 111320;
  const lon = map.origin.lon + east / (111320 * Math.cos((map.origin.lat * Math.PI) / 180));
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

export function routeKeys(annotation: DiveMapAnnotation): Set<string> {
  return new Set(annotation.route.map((leg) => edgeKey(leg.from, leg.to)));
}

/** Add or remove a leg of the route. */
export function toggleRouteLeg(
  annotation: DiveMapAnnotation,
  from: string,
  to: string,
): DiveMapAnnotation {
  const key = edgeKey(from, to);
  const exists = annotation.route.some((leg) => edgeKey(leg.from, leg.to) === key);
  return {
    ...annotation,
    route: exists
      ? annotation.route.filter((leg) => edgeKey(leg.from, leg.to) !== key)
      : [...annotation.route, { from, to }],
  };
}

export function addPin(
  annotation: DiveMapAnnotation,
  x: number,
  y: number,
  note = '',
): { annotation: DiveMapAnnotation; id: string } {
  const id = nextId(annotation.pins, 'p');
  return { annotation: { ...annotation, pins: [...annotation.pins, { id, x, y, note }] }, id };
}

export function updatePin(
  annotation: DiveMapAnnotation,
  id: string,
  patch: Partial<DiveMapPin>,
): DiveMapAnnotation {
  return {
    ...annotation,
    pins: annotation.pins.map((p) => (p.id === id ? { ...p, ...patch, id } : p)),
  };
}

export function removePin(annotation: DiveMapAnnotation, id: string): DiveMapAnnotation {
  return { ...annotation, pins: annotation.pins.filter((p) => p.id !== id) };
}

/** Metres of line covered by the route, counting each leg once. */
/** Metres swum: every leg in order, so an out-and-back counts twice. */
export function routeLength(map: SiteMap, annotation: DiveMapAnnotation): number {
  const byKey = new Map(map.edges.map((e) => [edgeKey(e.from, e.to), e]));
  const onLine = annotation.route.reduce((sum, leg) => {
    const edge = byKey.get(edgeKey(leg.from, leg.to));
    return sum + (edge ? edgeLength(map, edge) : 0);
  }, 0);
  return onLine + pathLength(annotation.path ?? []);
}

/** Where the route stands: the end of its last leg, else the entrance, else the first station. */
export function routeEnd(map: SiteMap, annotation: DiveMapAnnotation): string | null {
  const last = annotation.route.at(-1);
  if (last) return last.to;
  const start = map.nodes.find((n) => n.type === 'entrance' || n.type === 'entry') ?? map.nodes[0];
  return start?.id ?? null;
}

/** The shortest way along the line from one station to another, as directed legs; null when apart. */
export function pathBetween(map: SiteMap, from: string, to: string): MapEdgeRef[] | null {
  if (from === to) return [];
  const next = new Map<string, { to: string; cost: number }[]>();
  for (const edge of map.edges) {
    const cost = Math.max(0.1, edgeLength(map, edge));
    next.set(edge.from, [...(next.get(edge.from) ?? []), { to: edge.to, cost }]);
    next.set(edge.to, [...(next.get(edge.to) ?? []), { to: edge.from, cost }]);
  }
  const dist = new Map<string, number>([[from, 0]]);
  const via = new Map<string, string>();
  const open = new Set<string>([from]);
  while (open.size) {
    let current = '';
    let best = Infinity;
    for (const id of open) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        current = id;
      }
    }
    open.delete(current);
    if (current === to) break;
    for (const hop of next.get(current) ?? []) {
      const d = best + hop.cost;
      if (d < (dist.get(hop.to) ?? Infinity)) {
        dist.set(hop.to, d);
        via.set(hop.to, current);
        open.add(hop.to);
      }
    }
  }
  if (!dist.has(to)) return null;
  const legs: MapEdgeRef[] = [];
  for (let at = to; at !== from;) {
    const before = via.get(at)!;
    legs.unshift({ from: before, to: at });
    at = before;
  }
  return legs;
}

/** Extend the route from where it stands to a station, along the line. */
export function extendRoute(
  map: SiteMap,
  annotation: DiveMapAnnotation,
  to: string,
): DiveMapAnnotation {
  const from = routeEnd(map, annotation);
  const legs = from ? pathBetween(map, from, to) : null;
  return legs?.length ? { ...annotation, route: [...annotation.route, ...legs] } : annotation;
}

/** Extend the route across a leg: to its nearer end first, then along it. */
export function extendRouteAlong(
  map: SiteMap,
  annotation: DiveMapAnnotation,
  edge: MapEdgeRef,
): DiveMapAnnotation {
  const from = routeEnd(map, annotation);
  if (!from) return annotation;
  const toFrom = pathBetween(map, from, edge.from);
  const toTo = pathBetween(map, from, edge.to);
  if (!toFrom && !toTo) return annotation;
  const nearFrom = toFrom && (!toTo || toFrom.length <= toTo.length);
  const legs = nearFrom
    ? [...toFrom, { from: edge.from, to: edge.to }]
    : [...toTo!, { from: edge.to, to: edge.from }];
  return { ...annotation, route: [...annotation.route, ...legs] };
}

/** Drop the last `count` legs. */
export function trimRoute(annotation: DiveMapAnnotation, count: number): DiveMapAnnotation {
  return {
    ...annotation,
    route: annotation.route.slice(0, Math.max(0, annotation.route.length - count)),
  };
}

/** Drop route legs, the turn and nothing else that the given map no longer has. */
export function fitAnnotation(map: SiteMap, annotation: DiveMapAnnotation): DiveMapAnnotation {
  const keys = new Set(map.edges.map((e) => edgeKey(e.from, e.to)));
  const nodes = new Set(map.nodes.map((n) => n.id));
  const path = (annotation.path ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const turnAt = annotation.turn_at ?? null;
  return {
    ...annotation,
    route: annotation.route.filter((leg) => keys.has(edgeKey(leg.from, leg.to))),
    turn: annotation.turn && nodes.has(annotation.turn) ? annotation.turn : null,
    path,
    turn_at: turnAt !== null && turnAt < path.length ? turnAt : null,
  };
}

export function annotationSummary(map: SiteMap, annotation: DiveMapAnnotation): string {
  const parts: string[] = [];
  const metres = Math.round(routeLength(map, annotation));
  if (metres) parts.push(`${metres} m swum`);
  const turn = annotation.turn ? findNode(map, annotation.turn) : undefined;
  if (turn) {
    parts.push(
      `turned at ${turn.label || turn.id}${turn.depth !== null ? ` (${depthLabel(turn.depth)})` : ''}`,
    );
  }
  if (annotation.pins.length) {
    parts.push(`${annotation.pins.length} ${annotation.pins.length === 1 ? 'note' : 'notes'}`);
  }
  return parts.join(' · ');
}

/** What a route summary line says besides its length. */
export type RouteHighlights = {
  /** Label of the turn point, when the annotation has one. */
  turnedAt: string | null;
  /**
   * Deepest station along the route, when any station on it has a depth. An
   * unlabelled station borrows the label of the nearest labelled one along the
   * route; the label is empty when nothing on the route has one.
   */
  deepest: { label: string; depth: number } | null;
};

/** Stations a routed dive passed, in swim order, with metres swum to reach each. */
function routeStations(map: SiteMap, route: MapEdgeRef[]): { node: MapNode; at: number }[] {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const lengths = new Map(map.edges.map((e) => [edgeKey(e.from, e.to), edgeLength(map, e)]));
  const stations: { node: MapNode; at: number }[] = [];
  let at = 0;
  for (const leg of route) {
    const from = nodes.get(leg.from);
    const to = nodes.get(leg.to);
    if (from && stations.at(-1)?.node.id !== from.id) stations.push({ node: from, at });
    at += lengths.get(edgeKey(leg.from, leg.to)) ?? 0;
    if (to) stations.push({ node: to, at });
  }
  return stations;
}

export function routeHighlights(map: SiteMapOut, annotation: DiveMapAnnotation): RouteHighlights {
  if (!annotation.route.length) return { turnedAt: null, deepest: null };
  const turn = annotation.turn ? findNode(map, annotation.turn) : undefined;
  const turnedAt = turn?.label || null;
  const stations = routeStations(map, annotation.route);
  let deepest: { node: MapNode; at: number } | null = null;
  for (const s of stations) {
    if (s.node.depth !== null && (deepest === null || s.node.depth > deepest.node.depth!)) {
      deepest = s;
    }
  }
  if (!deepest) return { turnedAt, deepest: null };
  let label = deepest.node.label;
  if (!label) {
    let best = Infinity;
    for (const s of stations) {
      const gap = Math.abs(s.at - deepest.at);
      if (s.node.label && gap < best) {
        best = gap;
        label = s.node.label;
      }
    }
  }
  return { turnedAt, deepest: { label, depth: deepest.node.depth! } };
}
