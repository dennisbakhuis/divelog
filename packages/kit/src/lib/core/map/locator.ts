/**
 * Helpers for the per-site locator map: which self-hosted tile archive covers a
 * point, how far in to start for a given kind of site, and the map colours.
 */
import { DARK, type Flavor } from '@protomaps/basemaps';

export type TileArchive = {
  file: string;
  /** [minlon, minlat, maxlon, maxlat] */
  bbox: [number, number, number, number];
  maxzoom: number;
};

export type TileIndex = {
  attribution: string;
  /** The low-zoom planet archive behind the globe; absent until `make tiles` has cut it. */
  world?: { file: string; maxzoom: number };
  archives: TileArchive[];
};

/** The tile base as an absolute URL, which MapLibre needs for glyphs, sprites and pmtiles. */
export function absoluteTilesBase(tilesBase: string, origin: string): string {
  return /^[a-z]+:\/\//i.test(tilesBase) ? tilesBase : `${origin}${tilesBase}`;
}

/** The smallest archive whose bounds contain the point, or null when none does. */
export function archiveFor(index: TileIndex, lat: number, lon: number): TileArchive | null {
  const covering = index.archives.filter(
    ({ bbox: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n,
  );
  covering.sort((a, b) => area(a.bbox) - area(b.bbox));
  return covering[0] ?? null;
}

function area([w, s, e, n]: TileArchive['bbox']): number {
  return (e - w) * (n - s);
}

/** The globe switches from the world archive to the regional ones from this zoom. */
export const DETAIL_MIN_ZOOM = 8;

/** The zoom every regional archive reaches; beyond it the tiles overzoom. */
export function detailMaxZoom(index: TileIndex): number {
  return index.archives.length ? Math.min(...index.archives.map((a) => a.maxzoom)) : 0;
}

/** [minlon, minlat, maxlon, maxlat] of a Web Mercator tile. */
export function tileBounds(z: number, x: number, y: number): TileArchive['bbox'] {
  const n = 2 ** z;
  const lon = (i: number) => (i / n) * 360 - 180;
  const lat = (i: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * i) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

/** The smallest archive that overlaps a tile and reaches its zoom, or null when none does. */
export function archiveForTile(
  index: TileIndex,
  z: number,
  x: number,
  y: number,
): TileArchive | null {
  const [w, s, e, n] = tileBounds(z, x, y);
  const covering = index.archives.filter(
    (a) => a.maxzoom >= z && a.bbox[0] < e && a.bbox[2] > w && a.bbox[1] < n && a.bbox[3] > s,
  );
  covering.sort((a, b) => area(a.bbox) - area(b.bbox));
  return covering[0] ?? null;
}

/** Initial zoom: a pool fills the frame, an offshore wreck needs the coastline for context. */
export function startZoom(siteType: string): number {
  switch (siteType) {
    case 'pool':
    case 'indoor dive tower':
      return 16;
    case 'cave':
    case 'cavern':
    case 'mine':
      return 15;
    case 'sea':
    case 'wreck':
    case 'reef with wrecks':
      return 13;
    default:
      return 14;
  }
}

/** The zoom at which an archive's bounds roughly fill a viewport; zooming out further shows nothing. */
export function minZoomFor([w, , e]: TileArchive['bbox']): number {
  const zoom = Math.floor(Math.log2(360 / Math.max(e - w, 1e-6)));
  return Math.min(12, Math.max(3, zoom));
}

/** The Protomaps dark flavor recoloured to the site's deep-water palette. */
export function siteFlavor(): Flavor {
  return {
    ...DARK,
    background: '#0a1a30',
    earth: '#132a47',
    water: '#0a1a30',
    park_a: '#153351',
    park_b: '#173856',
    wood_a: '#12304a',
    wood_b: '#14344f',
    scrub_a: '#142f4b',
    scrub_b: '#163350',
    glacier: '#1d3a5a',
    sand: '#1c3350',
    beach: '#1e3552',
    buildings: '#1d3a5a',
    pedestrian: '#17324e',
    pier: '#243f5c',
    minor_service_casing: '#0a1a30',
    minor_casing: '#0a1a30',
    link_casing: '#0a1a30',
    major_casing_early: '#0a1a30',
    major_casing_late: '#0a1a30',
    highway_casing_early: '#0a1a30',
    highway_casing_late: '#0a1a30',
    other: '#2a4665',
    minor_service: '#2a4665',
    minor_a: '#2c4a6a',
    minor_b: '#2f4e6f',
    link: '#385a7d',
    major: '#3f6488',
    highway: '#4a7297',
    railway: '#1d3a5a',
    bridges_other: '#2a4665',
    bridges_minor: '#2f4e6f',
    bridges_link: '#385a7d',
    bridges_major: '#3f6488',
    bridges_highway: '#4a7297',
    boundaries: '#3d5a7a',
    ocean_label: '#5f8fb5',
    city_label: '#d6e2f0',
    city_label_halo: '#0a1a30',
    subplace_label: '#a9bbd0',
    subplace_label_halo: '#0a1a30',
    roads_label_minor: '#8a9db5',
    roads_label_minor_halo: '#0a1a30',
    roads_label_major: '#a9bbd0',
    roads_label_major_halo: '#0a1a30',
    state_label: '#6f86a3',
    state_label_halo: '#0a1a30',
    country_label: '#8a9db5',
    address_label: '#6f86a3',
    address_label_halo: '#0a1a30',
    landcover: {
      grassland: 'rgba(21, 51, 81, 1)',
      barren: 'rgba(28, 51, 80, 1)',
      urban_area: 'rgba(29, 58, 90, 1)',
      farmland: 'rgba(20, 47, 75, 1)',
      glacier: 'rgba(29, 58, 90, 1)',
      scrub: 'rgba(22, 51, 80, 1)',
      forest: 'rgba(18, 48, 74, 1)',
    },
  };
}

/** Tile requests of the location picker's detail source; routed to the archive covering each tile. */
export const PICKER_DETAIL_PROTOCOL = 'dlpick';

/** The parts of `@protomaps/basemaps` the picker style needs, passed in so it loads lazily. */
type LayersFn = (source: string, flavor: Flavor, options: { lang: string }) => LayerLike[];
type LayerLike = { id: string; minzoom?: number } & Record<string, unknown>;

/**
 * The basemap style for the location picker, in Web Mercator. The planet archive
 * draws the world and the regional archives take over past `DETAIL_MIN_ZOOM`;
 * without a planet archive the country outlines (`outline`, GeoJSON) are the map
 * and the regional archives draw on top where they exist; with neither, the
 * outlines alone still let a pin be placed anywhere.
 */
export function pickerStyle({
  base,
  index,
  layers,
  outline,
  colours,
}: {
  base: string;
  index: TileIndex | null;
  layers: LayersFn | null;
  outline: unknown;
  colours: { water: string; land: string; border: string };
}) {
  const flavor = siteFlavor();
  const world = index?.world && layers ? index.world : null;
  const detailZoom = index ? detailMaxZoom(index) : 0;
  const hasDetail = !!layers && !!index?.archives.length;
  const detailMin = world ? DETAIL_MIN_ZOOM : 0;
  const detailLayers =
    hasDetail && layers
      ? layers('detail', flavor, { lang: 'en' }).map((layer) => ({
          ...layer,
          id: `detail-${layer.id}`,
          minzoom: Math.max(layer.minzoom ?? 0, detailMin),
        }))
      : [];
  const outlineLayers = world
    ? []
    : [
        {
          id: 'outline-land',
          type: 'fill',
          source: 'outline',
          paint: { 'fill-color': colours.land },
        },
        {
          id: 'outline-border',
          type: 'line',
          source: 'outline',
          paint: { 'line-color': colours.border, 'line-width': 0.6 },
        },
      ];
  return {
    version: 8 as const,
    glyphs: `${base}/assets/fonts/{fontstack}/{range}.pbf`,
    ...(layers ? { sprite: `${base}/assets/sprites/v4/dark` } : {}),
    sources: {
      ...(world
        ? {
            protomaps: {
              type: 'vector' as const,
              url: `pmtiles://${base}/${world.file}`,
              attribution: index?.attribution ?? '',
            },
          }
        : { outline: { type: 'geojson' as const, data: outline } }),
      ...(hasDetail
        ? {
            detail: {
              type: 'vector' as const,
              tiles: [`${PICKER_DETAIL_PROTOCOL}://{z}/{x}/{y}`],
              minzoom: detailMin,
              maxzoom: detailZoom || 14,
              attribution: index?.attribution ?? '',
            },
          }
        : {}),
    },
    layers: [
      { id: 'picker-bg', type: 'background', paint: { 'background-color': colours.water } },
      ...outlineLayers,
      ...(world && layers ? layers('protomaps', flavor, { lang: 'en' }) : []),
      ...detailLayers,
    ],
  };
}
