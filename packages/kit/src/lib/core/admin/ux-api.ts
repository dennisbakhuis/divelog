/**
 * TEMPORARY: hand-written shapes of the editor endpoints added for the logging flow
 * (`/admin/dives/template`, `/admin/dives/page`, `/admin/dives/publish`,
 * `/admin/preview/markdown`, import `dry_run`, gear setup templates). They mirror the
 * server models and go away once `api.d.ts` is regenerated with those endpoints; the
 * names below then become aliases in `core/dive/types.ts`.
 */
import type {
  AdminDiveListItem,
  GearSetup,
  ImportResult,
  Tank,
  Trip,
  TripRef,
} from '$lib/core/dive/types.js';
import type { DiveMapAnnotation } from '$lib/core/dive/sitemap.js';

/** `previous` of the template: the stored dive as the input `POST /admin/dives` takes. */
export type DiveInShape = {
  number: number;
  title?: string;
  date: string;
  time_in?: string | null;
  time_out?: string | null;
  duration_min: number;
  max_depth_m: number;
  avg_depth_m?: number | null;
  water_temp_c?: number | null;
  surface_temp_c?: number | null;
  air_temp_c?: number | null;
  thermocline_m?: number | null;
  visibility_m?: number | null;
  visibility_raw?: string | null;
  site_id?: string | null;
  section?: string | null;
  trip_id?: string | null;
  tags?: string[];
  types_raw?: string | null;
  gas?: string | null;
  o2_pct?: number | null;
  o2_measured_pct?: number | null;
  he_pct?: number | null;
  gas_raw?: string | null;
  mode?: string;
  suit?: string | null;
  weights_kg?: number | null;
  cylinder?: string | null;
  pressure_in_bar?: number | null;
  pressure_out_bar?: number | null;
  tanks?: Partial<Tank>[];
  safety_stop_min?: number | null;
  surface_interval?: string | null;
  conditions?: string | null;
  difficulty?: string | null;
  course?: string | null;
  rating?: number | null;
  gear_setup_id?: string | null;
  guide?: string | null;
  operator?: string | null;
  buddy_raw?: string | null;
  buddy_role?: string | null;
  body_md?: string;
  notes_nl?: string | null;
  visibility?: 'public' | 'private' | 'draft';
  people_ids?: string[];
  cover_attachment_id?: string | null;
  computer?: number[];
  flags?: string[];
  sketch?: string | null;
  map_annotation?: DiveMapAnnotation | null;
};

/** A site dived recently, for the top of the site picker. */
export type TemplateSite = {
  site_id: string;
  name: string;
  country: string | null;
  region: string | null;
  last_dive: string;
  dives: number;
};

/** Someone often dived with; `dives` counts the dives together in the last 24 months. */
export type TemplatePerson = { id: string; slug: string; name: string; dives: number };

/** The last dive at a site, for the values a new dive there starts from. */
export type SiteLastDive = {
  number: number;
  date: string;
  section: string | null;
  map_id: string | null;
  water_temp_c: number | null;
  surface_temp_c: number | null;
  air_temp_c: number | null;
  visibility_m: number | null;
};

/** `GET /admin/dives/template?site=&date=`: everything the new-dive form starts from. */
export type DiveTemplateOut = {
  date: string;
  next_number: number;
  previous?: DiveInShape | null;
  at_site?: SiteLastDive | null;
  recent_sites?: TemplateSite[];
  frequent_people?: TemplatePerson[];
  trip_for_date?: Trip | null;
};

/** A row of `GET /admin/dives/page`: the list row plus what its secondary links need. */
export type AdminDiveRow = AdminDiveListItem & {
  time_in: string | null;
  site_id: string | null;
  trip: TripRef | null;
};

/** `GET /admin/dives/page`: one page of the list; `total` counts every matching row. */
export type AdminDivePage = { items: AdminDiveRow[]; total: number; offset: number; limit: number };

/** `POST /admin/preview/markdown`. */
export type MarkdownPreviewOut = { html: string };

/** `POST /admin/dives/publish`: drafts made public, and the numbers left as they were. */
export type DivesPublishOut = { published: number[]; unchanged: number[] };

/** An import's result, also as a dry run: what would be created, matched or skipped. */
export type ImportReport = ImportResult & {
  dry_run?: boolean;
  dives_in_file?: number;
  first_date?: string | null;
  last_date?: string | null;
};

/** A gear setup with its template fields: the tanks, suit and weights it is dived with. */
export type GearSetupTemplate = GearSetup & {
  tanks?: Tank[];
  suit?: string | null;
  weights_kg?: number | null;
};
