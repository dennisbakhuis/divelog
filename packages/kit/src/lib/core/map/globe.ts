/**
 * Helpers for the interactive globe on the dive overview: the sites as a
 * GeoJSON layer with their dot size and colour baked into the properties,
 * and the country "jump" targets that fly the globe to a region.
 */
import type { CountryStat, DiveListItem, MapSite } from '$lib/core/dive/types';
import {
  colourScale,
  dotColour,
  dotMeasureMax,
  dotRadiusBy,
  type ColourMode,
  type SizeMode,
} from '$lib/core/dive/stats-view';
import { flagEmoji } from '$lib/core/dive/format';

/** [minlon, minlat, maxlon, maxlat] */
export type BBox = [number, number, number, number];

/** The globe's camera, as a page snapshot can store and restore it. */
export type GlobeView = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

/** Europe and the Red Sea in view; the Caribbean comes round with the intro spin. */
export const HOME_VIEW: GlobeView = { center: [15, 25], zoom: 1.6, bearing: 0, pitch: 0 };

/**
 * Whether two cameras point the same way, to within what a user would notice.
 * A page snapshot or a `$state` proxy hands the same view back as a new object,
 * so identity cannot tell "moved" from "echoed".
 */
export function sameView(a: GlobeView | null, b: GlobeView | null, tolerance = 1e-6): boolean {
  if (!a || !b) return a === b;
  const close = (x: number, y: number) => Math.abs(x - y) <= tolerance;
  return (
    close(a.center[0], b.center[0]) &&
    close(a.center[1], b.center[1]) &&
    close(a.zoom, b.zoom) &&
    close(a.bearing, b.bearing) &&
    close(a.pitch, b.pitch)
  );
}

/** What the current selection logged at one site. */
export type SiteTally = Pick<
  MapSite,
  'dives' | 'minutes' | 'max_depth_m' | 'first_year' | 'last_year'
>;

export type DotOptions = {
  size: SizeMode;
  colour: ColourMode;
  activeSite: string;
  /**
   * Per-site numbers for the dives the filters keep; a site missing from it is
   * dimmed and keeps its full numbers. Null means nothing is filtered.
   */
  tally?: Map<string, SiteTally> | null;
  /** Turns a `var(--token)` colour into a literal the GPU can paint; identity by default. */
  resolve?: (colour: string) => string;
};

export type SiteProperties = Omit<MapSite, 'lat' | 'lon'> & {
  r: number;
  fill: string;
  /** 1 when the selection or another selected site pushes the dot into the background. */
  dim: 0 | 1;
  active: 0 | 1;
  /** The site's dives in the whole log, for a dimmed dot's popup. */
  total: number;
  /** The site's dives in the selection, which the clusters add up; 0 for a faded site. */
  sel: number;
};

export type SiteFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SiteProperties;
};

export type SiteCollection = { type: 'FeatureCollection'; features: SiteFeature[] };

/** Sum the dives of a list per site, for sizing the dots by what the filters keep. */
export function tallySites(dives: DiveListItem[]): Map<string, SiteTally> {
  const tally = new Map<string, SiteTally>();
  for (const dive of dives) {
    const slug = dive.site?.slug;
    if (!slug) continue;
    const year = Number(dive.date.slice(0, 4));
    const entry = tally.get(slug);
    if (!entry) {
      tally.set(slug, {
        dives: 1,
        minutes: dive.duration_min,
        max_depth_m: dive.max_depth_m,
        first_year: year,
        last_year: year,
      });
      continue;
    }
    entry.dives += 1;
    entry.minutes += dive.duration_min;
    entry.max_depth_m = Math.max(entry.max_depth_m, dive.max_depth_m);
    entry.first_year = Math.min(entry.first_year, year);
    entry.last_year = Math.max(entry.last_year, year);
  }
  return tally;
}

export function sitesToGeoJSON(sites: MapSite[], options: DotOptions): SiteCollection {
  const { size, colour, activeSite, tally = null, resolve = (c) => c } = options;
  const shown = sites.map((site) => {
    const counted = tally?.get(site.slug);
    return counted ? { ...site, ...counted } : site;
  });
  const kept = tally ? shown.filter((site) => tally.has(site.slug)) : shown;
  const max = dotMeasureMax(kept.length ? kept : shown, size);
  const scale = colourScale(kept.length ? kept : shown, colour);
  return {
    type: 'FeatureCollection',
    features: shown.map((site, i) => {
      const { lat, lon, ...rest } = site;
      const active = activeSite === site.slug;
      const dim = (activeSite && !active) || (tally !== null && !tally.has(site.slug));
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          ...rest,
          r: Math.round(dotRadiusBy(site, size, max) * 10) / 10,
          fill: resolve(dotColour(site, colour, scale)),
          dim: dim ? 1 : 0,
          active: active ? 1 : 0,
          total: sites[i].dives,
          sel: tally ? (tally.get(site.slug)?.dives ?? 0) : site.dives,
        },
      };
    }),
  };
}

/** The box around the sites, padded by a share of the span and never thinner than `minPad`. */
export function boundsOf(
  sites: Pick<MapSite, 'lat' | 'lon'>[],
  { pad = 0.2, minPad = 0.4 }: { pad?: number; minPad?: number } = {},
): BBox | null {
  if (!sites.length) return null;
  const lons = sites.map((s) => s.lon);
  const lats = sites.map((s) => s.lat);
  const [w, e] = [Math.min(...lons), Math.max(...lons)];
  const [s, n] = [Math.min(...lats), Math.max(...lats)];
  const padX = Math.max((e - w) * pad, minPad);
  const padY = Math.max((n - s) * pad, minPad);
  return [w - padX, Math.max(-85, s - padY), e + padX, Math.min(85, n + padY)];
}

export type JumpTarget = { code: string; label: string; dives: number; bounds: BBox };

/** The countries with the most dives, each with the box that frames its sites. */
export function jumpTargets(
  sites: MapSite[],
  countries: CountryStat[] = [],
  max = 6,
): JumpTarget[] {
  const names = new Map(countries.map((c) => [c.country_code, c.country_name]));
  const groups = new Map<string, MapSite[]>();
  for (const site of sites) {
    const list = groups.get(site.country_code) ?? [];
    list.push(site);
    groups.set(site.country_code, list);
  }
  return [...groups]
    .map(([code, group]) => ({
      code,
      label: `${flagEmoji(code)} ${names.get(code) ?? code.toUpperCase()}`.trim(),
      dives: group.reduce((n, s) => n + s.dives, 0),
      bounds: boundsOf(group) as BBox,
    }))
    .sort((a, b) => b.dives - a.dives || a.label.localeCompare(b.label))
    .slice(0, max);
}
