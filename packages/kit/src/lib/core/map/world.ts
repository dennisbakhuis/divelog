import { geoBounds, geoMercator, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json' with { type: 'json' };

// Server-side only: the world outline is projected once at module load and
// sent to the browser as SVG path strings, so the map needs no client JS and
// no third-party tiles. ~110m Natural Earth is plenty for dots on a globe.

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 480;

const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topology, topology.objects.countries);

export const projection: GeoProjection = geoNaturalEarth1().fitSize(
  [MAP_WIDTH, MAP_HEIGHT],
  countries,
);

const pathGenerator = geoPath(projection);

export const landPath: string = pathGenerator(countries) ?? '';
export const spherePath: string = pathGenerator({ type: 'Sphere' }) ?? '';

export type Projected = { x: number; y: number };

export function project(lon: number, lat: number): Projected | null {
  const point = projection([lon, lat]);
  if (!point) return null;
  return { x: Math.round(point[0] * 10) / 10, y: Math.round(point[1] * 10) / 10 };
}

export type InsetDef = { id: string; label: string; bbox: [number, number, number, number] };

export type Inset = {
  id: string;
  label: string;
  width: number;
  height: number;
  landPath: string;
  project: (lon: number, lat: number) => Projected | null;
  contains: (lon: number, lat: number) => boolean;
};

type Countries = typeof countries;
export type BBox = [number, number, number, number];

/** Only the countries whose bounds touch the box; the rest would be clipped to nothing anyway. */
function countriesNear(bbox: BBox, source: Countries = countries) {
  const [w, s, e, n] = bbox;
  return {
    type: 'FeatureCollection' as const,
    features: source.features.filter((feature) => {
      const [[fw, fs], [fe, fn]] = geoBounds(feature);
      return fe >= w && fw <= e && fn >= s && fs <= n;
    }),
  };
}

/** A Mercator panel fitted to the definition's bounding box, land clipped to the panel. */
function fitPanel(def: InsetDef, width: number, height: number, source: Countries): Inset {
  const [w, s, e, n] = def.bbox;
  // d3-geo wants exterior rings wound clockwise; the other way round means
  // "everything but this box" and the panel collapses to a dot.
  const box = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [w, s],
        [w, n],
        [e, n],
        [e, s],
        [w, s],
      ],
    ],
  };
  const local = geoMercator()
    .fitExtent(
      [
        [8, 8],
        [width - 8, height - 8],
      ],
      box,
    )
    .clipExtent([
      [0, 0],
      [width, height],
    ]);
  const path = geoPath(local);
  return {
    id: def.id,
    label: def.label,
    width,
    height,
    landPath: path(countriesNear(def.bbox, source)) ?? '',
    project: (lon, lat) => {
      const point = local([lon, lat]);
      if (!point) return null;
      return { x: Math.round(point[0] * 10) / 10, y: Math.round(point[1] * 10) / 10 };
    },
    contains: (lon, lat) => lon >= w && lon <= e && lat >= s && lat <= n,
  };
}

export const REGION_MAP_WIDTH = 640;
export const REGION_MAP_HEIGHT = 360;

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const inverseMercatorY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

/**
 * The box around ``points`` a Mercator panel of the given aspect ratio shows:
 * padded by ``pad`` of the span on each side, at least ``minSpan`` degrees of
 * longitude wide, and widened in one direction to the panel's shape so no land
 * outside the box is left undrawn.
 */
export function fitBBox(
  points: { lon: number; lat: number }[],
  aspect: number,
  { minSpan = 0.2, pad = 0.15 }: { minSpan?: number; pad?: number } = {},
): BBox | null {
  if (!points.length) return null;
  const xs = points.map((p) => p.lon);
  const ys = points.map((p) => mercatorY(p.lat));
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const rad = Math.PI / 180;
  const padX = Math.max((x1 - x0) * pad, (minSpan - (x1 - x0)) / 2, 0);
  const padY = Math.max((y1 - y0) * pad, (minSpan * rad - (y1 - y0)) / 2, 0);
  [x0, x1, y0, y1] = [x0 - padX, x1 + padX, y0 - padY, y1 + padY];
  const width = (x1 - x0) * rad;
  const height = y1 - y0;
  if (width / height < aspect) {
    const grow = (height * aspect - width) / rad / 2;
    [x0, x1] = [x0 - grow, x1 + grow];
  } else {
    const grow = (width / aspect - height) / 2;
    [y0, y1] = [y0 - grow, y1 + grow];
  }
  return [x0, inverseMercatorY(y0), x1, inverseMercatorY(y1)];
}

let detailed: Countries | null = null;

/** The 1:50m outlines; small islands (Bonaire, Gozo) are missing from the 1:110m set. */
async function detailedCountries(): Promise<Countries> {
  if (!detailed) {
    const atlas = (await import('world-atlas/countries-50m.json', { with: { type: 'json' } })).default;
    const topo = atlas as unknown as Topology<{ countries: GeometryCollection }>;
    detailed = feature(topo, topo.objects.countries);
  }
  return detailed;
}

/** A region-sized Mercator panel fitted around ``points``, with the detailed coastline. */
export async function makeRegionMap(
  id: string,
  label: string,
  points: { lon: number; lat: number }[],
): Promise<Inset | null> {
  const bbox = fitBBox(points, REGION_MAP_WIDTH / REGION_MAP_HEIGHT);
  if (!bbox) return null;
  return fitPanel(
    { id, label, bbox },
    REGION_MAP_WIDTH,
    REGION_MAP_HEIGHT,
    await detailedCountries(),
  );
}
