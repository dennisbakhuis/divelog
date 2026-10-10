/**
 * The site-sharing features as the pages show them: the commons attribution a licence asks
 * for, where a site or map comes from, the admin's origin filter, repo-status notices and the
 * pin of a dive's route against the current revision of its map.
 */
import { fitAnnotation, type DiveMapAnnotation, type MapEdgeRef, type SiteMap } from './sitemap';
import type { Attribution, ImportSite, MapRef, SiteOrigin } from './types';

/** The commons' name when the API gives none: the shared repository of dive sites. */
export const COMMONS_NAME = 'divelog-sites';

/** What the attribution line says after the contributors; the licences of the commons. */
export const COMMONS_LICENCES = '(ODbL), descriptions and maps CC BY-SA 4.0';

/** A commit as people read it: the first seven characters of the hash. */
export function shortRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return /^[0-9a-f]{8,}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

/** Whether `value` is an http(s) URL worth linking. */
export function isUrl(value: string | null | undefined): value is string {
  return !!value && /^https?:\/\/\S+$/i.test(value);
}

/** The name to credit for a commons source: its last path segment when it is a URL. */
export function sourceName(source: string | null | undefined): string {
  if (!source) return COMMONS_NAME;
  if (!isUrl(source)) return source;
  const segment = new URL(source).pathname
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.git$/, '');
  return segment || COMMONS_NAME;
}

/** Whether a map id is one of the log's own maps: personal drawn maps end in `-p<n>`. */
export function isPersonalMapId(id: string): boolean {
  return /-p\d+$/.test(id);
}

/**
 * Whether the map a page shows comes from the commons: a drawn map or sketch (not a reference
 * scan) of a commons site or fork whose id is not a personal `-p<n>` one.
 */
export function mapFromCommons(
  map: Pick<MapRef, 'ref' | 'collection'>,
  origin: SiteOrigin,
): boolean {
  if (origin === 'log' || map.collection === 'reference') return false;
  const name = map.ref.includes(':') ? map.ref.slice(map.ref.indexOf(':') + 1) : map.ref;
  return !isPersonalMapId(name);
}

/** The admin's origin filter over the site list. */
export type OriginFilter = 'all' | 'personal' | 'commons' | 'stale';

export const ORIGIN_FILTERS: { value: OriginFilter; label: string }[] = [
  { value: 'all', label: 'All origins' },
  { value: 'personal', label: 'Personal (own sites and forks)' },
  { value: 'commons', label: 'From the commons' },
  { value: 'stale', label: 'Stale against the commons' },
];

type FilterableSite = { origin: SiteOrigin; private?: { pin?: { stale: boolean } | null } | null };

/** Whether a site passes the origin filter: forks count as personal, they live in the log. */
export function matchesOrigin(site: FilterableSite, filter: OriginFilter): boolean {
  if (filter === 'personal') return site.origin !== 'commons';
  if (filter === 'commons') return site.origin === 'commons';
  if (filter === 'stale') return !!site.private?.pin?.stale;
  return true;
}

/** The badge an origin gets in the admin: what a reader calls it. */
export const ORIGIN_LABEL: Record<SiteOrigin, string> = {
  log: 'personal',
  commons: 'commons',
  fork: 'fork',
};

/** The site id a repo-status notice is about (`site <id> …`), for a link to its editor. */
export function noticeSiteId(notice: string): string | null {
  const m = /^site ([a-z]{3}-[a-z0-9-]+)\b/.exec(notice);
  return m ? m[1] : null;
}

/** How a dive's route stands against the current revision of the map it was drawn on. */
export type AnnotationHealth = {
  /** The route was drawn on an older revision of the map, or legs no longer resolve. */
  stale: boolean;
  /** The map revision the route was drawn on. */
  from: number;
  /** The map's current revision. */
  to: number;
  /** Legs whose line is not on the map any more, in swim order. */
  dropped: MapEdgeRef[];
};

const legKey = (leg: MapEdgeRef) => [leg.from, leg.to].sort().join('|');

/** Compare an annotation with the map it points at. */
export function annotationHealth(
  annotation: DiveMapAnnotation,
  map: SiteMap & { revision: number },
): AnnotationHealth {
  const edges = new Set(map.edges.map((e) => legKey(e)));
  const dropped = annotation.route.filter((leg) => !edges.has(legKey(leg)));
  return {
    stale: annotation.revision < map.revision || dropped.length > 0,
    from: annotation.revision,
    to: map.revision,
    dropped,
  };
}

/** The editor's notice for a stale route. */
export function staleMessage(health: AnnotationHealth): string {
  const legs = health.dropped.length;
  const what =
    health.from !== health.to
      ? `The map changed since this route was drawn (map revision ${health.from} → ${health.to})`
      : 'Part of this route is no longer on the map';
  if (!legs) return `${what}; every leg still resolves.`;
  return `${what}; ${legs} ${legs === 1 ? 'leg no longer resolves' : 'legs no longer resolve'}.`;
}

/**
 * The annotation pinned to the map's current revision, without the legs, turn point and track
 * points that no longer resolve; `dropped` lists the legs taken out.
 */
export function repinAnnotation(
  annotation: DiveMapAnnotation,
  map: SiteMap & { revision: number },
): { annotation: DiveMapAnnotation; dropped: MapEdgeRef[] } {
  const { dropped } = annotationHealth(annotation, map);
  return { annotation: { ...fitAnnotation(map, annotation), revision: map.revision }, dropped };
}

/** A leg as the editor lists it: `a → b`. */
export function legLabel(leg: MapEdgeRef, map?: SiteMap): string {
  const name = (id: string) => map?.nodes.find((n) => n.id === id)?.label || id;
  return `${name(leg.from)} → ${name(leg.to)}`;
}

const MATCHED_BY: Record<NonNullable<ImportSite['matched_by']>, string> = {
  uuid: 'Subsurface id',
  name: 'name',
  alias: 'alias',
  distance: 'distance',
};

/** How an imported site resolved: "matched by name · 120 m", or "created". */
export function importMatchLabel(site: ImportSite): string {
  const metres = site.distance_m !== null ? ` · ${Math.round(site.distance_m)} m` : '';
  if (site.outcome === 'created') return `created as a personal site${metres}`;
  return `matched by ${site.matched_by ? MATCHED_BY[site.matched_by] : 'id'}${metres}`;
}

/** The licence text for a commons site, without the source link. */
export function attributionText(attribution: Attribution | null): string {
  return `Site data © ${sourceName(attribution?.source)} contributors ${COMMONS_LICENCES}`;
}
