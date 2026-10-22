// The API's types, by the names the components import. Almost every name is an alias onto
// ./api.d.ts, which `pnpm types` generates from the backend's OpenAPI document; the few
// hand-written ones say why. Map shapes with behaviour stay hand-written in ./sitemap.ts.

import type { components } from './api';

type Schemas = components['schemas'];

/** `T` with the fields of `U` swapped in: narrows a backend `str` to the literals it holds. */
type Narrow<T, U extends Partial<Record<keyof T, unknown>>> = Omit<T, keyof U> & U;

/** The water a site lies in; the Out schema types it as `str`, the In schema has the literals. */
type Water = Required<Schemas['SiteIn']>['water'];

/** Whether a site's exact position is shown; literals from the In schema, as for `Water`. */
type LocationVisibility = Required<Schemas['SiteIn']>['location_visibility'];

export type SiteSummary = Narrow<Schemas['SiteSummary'], { water: Water }>;

export type MapCollection = Schemas['MapRef']['collection'];

/** One map a site page can show, from any of the three collections. */
export type MapRef = Schemas['MapRef'];

export type Price = Schemas['Price-Output'];

export type AccessPoint = Schemas['AccessPoint-Output'];

export type SitePrivate = Schemas['SitePrivate'];

/** Where a site record comes from: the owner's log, a shared commons, or a fork of one. */
export type SiteOrigin = Schemas['SiteOut']['origin'];

/** Licence and source of a site record taken from a shared commons. */
export type Attribution = Schemas['Attribution'];

/** One line of a site's or drawn map's changelog, newest first. */
export type { ChangeEntry } from './sitemap.js';

/** How an overlay or fork stands against the current commons revision of its site. */
export type PinState = Schemas['PinState'];

export type Site = Narrow<
  Schemas['SiteOut'],
  { water: Water; location_visibility: LocationVisibility; attachments: Attachment[] }
>;

/** A site in a region's list, with the dives the viewer may see there (0: not dived). */
export type RegionSite = Narrow<Schemas['RegionSite'], { water: Water }>;

export type Region = Narrow<Schemas['RegionOut'], { sites: RegionSite[] }>;

export type RegionStats = Schemas['RegionStats'];

/** One logged dive's route on one of the site's drawn maps. */
export type SiteDiveRoute = Schemas['SiteDiveRoute'];

/** Another exactly-placed site near the one on the page; never offered for region-only sites. */
export type NearbySite = Schemas['NearbySite'];

/** A trip; on a dive page `day_index` and `days` place the dive within it. */
export type Trip = Schemas['TripOut'];

/** The trip a row of the log belongs to. */
export type TripRef = Schemas['TripRef'];

export type TripStats = Schemas['TripStats'];

/** A trip card, and the head of a trip page; counts are over the dives the viewer may see. */
export type TripSummary = Schemas['TripSummary'];

export type TripDetail = Narrow<Schemas['TripDetail'], { dives: DiveListItem[] }>;

/** A trip a buddy was on, with the dives we made together on it. */
export type TripTogether = Schemas['TripTogether'];

/**
 * A trip as the editor sees it: the override file's fields when there is one
 * (`custom: true`), else the derived trip built from the logged dives.
 */
export type TripAdmin = Schemas['TripOut'];

/** Body of `POST /admin/trips` and `PUT /admin/trips/{slug}`. */
export type TripIn = Schemas['TripIn'];

export type AttachmentKind = NonNullable<Schemas['AttachmentPatch']['kind']>;

export type Attachment = Narrow<Schemas['AttachmentOut'], { kind: AttachmentKind }>;

/**
 * One profile sample. The In shape, whose readings past `t` and `d` are optional: the API
 * always sends them (null when absent), and that Output shape is assignable to this one.
 */
export type ProfileSample = Schemas['ProfileSample-Input'];

export type ProfileMeta = Schemas['ProfileMeta'];

export type PersonPublic = Schemas['PersonPublic'];

/** A buddy on the dive page, with what we logged together. */
export type Buddy = Schemas['BuddyOut'];

export type SameDayDive = Schemas['SameDayDive'];

export type PersonPrivate = Schemas['PersonPrivate'];

export type PersonStats = Schemas['PersonStats'];

export type Person = Schemas['PersonOut'];

export type DiveListItem = Narrow<Schemas['DiveListItem'], { site: SiteSummary | null }>;

export type TankGas = Schemas['TankOut']['gas'];
export type TankRole = Schemas['TankOut']['role'];

export type Tank = Schemas['TankOut'];

export type DivePrivate = Schemas['DivePrivate'];

/** A signature's strokes: polylines of integer `[x, y]` points in the 1000 × 400 box. */
type Strokes = number[][][];

/**
 * A buddy's note on a dive, signed through a mailed link: a comment, a drawn signature or
 * both. The API types a point as a pair; the kit reads and draws plain number arrays.
 */
export type BuddyNote = Narrow<Schemas['BuddyNoteOut'], { strokes: Strokes | null }>;

/** What the dive form sends per note: only `public` is the owner's to change. */
export type BuddyNoteInput = Schemas['BuddyNoteIn'];

/** Where the request to sign stands for one buddy; `signed` wins once a note exists. */
export type SignRequestState = Schemas['SignRequestOut']['state'];

/** One buddy's sign request as the editor sees it, in the order of the dive's people. */
export type SignRequest = Schemas['SignRequestOut'];

/** Why `POST /admin/dives/{n}/sign-requests` mailed a buddy nothing. */
export type SignSkipReason = Schemas['SignSkip']['reason'];

/** Body of `POST /admin/dives/{n}/sign-requests`; `resend` needs explicit `people`. */
export type SignRequestsIn = Required<Schemas['SignRequestsIn']>;

/** `POST /admin/dives/{n}/sign-requests`: who was mailed, who not and why, the new states. */
export type SignRequestsOut = Schemas['SignRequestsOut'];

/** The buddy a sign link belongs to. */
export type Signer = Schemas['Signer'];

/** `GET /dive/sign/{token}`: the dive as its public page shows it, for the buddy signing. */
export type SignPage = Narrow<Schemas['SignPageOut'], { note: BuddyNote | null; dive: Dive }>;

/**
 * Body of `POST /dive/sign/{token}`: at least one of comment and strokes. Hand-narrowed: the
 * pad records plain number arrays, which the API reads as its point pairs.
 */
export type SignIn = { comment: string | null; strokes: Strokes | null; public: boolean };

/** Overrides shared by `Dive` and `DiveAdmin`: narrowed literals and narrowed nested records. */
type DiveNarrowing = {
  site: Site | null;
  attachments: Attachment[];
  visibility: Required<Schemas['DiveIn']>['visibility'];
  /** The public notes on `Dive`; every note on `DiveAdmin`. */
  buddy_notes?: BuddyNote[];
};

export type Dive = Narrow<Schemas['DiveOut'], DiveNarrowing>;

export type DiveAdmin = Narrow<
  Schemas['DiveAdminOut'],
  DiveNarrowing & { sign_requests?: SignRequest[] }
>;

/** A row of `GET /admin/dives`: what the editor's list shows; the full record is `DiveAdmin`. */
export type AdminDiveListItem = Narrow<
  Schemas['AdminDiveListItem'],
  { visibility: DiveNarrowing['visibility'] }
>;

/** A row of `GET /admin/dives/page`: the list row plus its start time, site id and trip. */
export type AdminDiveRow = Narrow<
  Schemas['AdminDiveRow'],
  { visibility: DiveNarrowing['visibility'] }
>;

/** `GET /admin/dives/page`: one page of the editor's list; `total` counts every match. */
export type AdminDivePage = Narrow<Schemas['AdminDivePage'], { items: AdminDiveRow[] }>;

/** `GET /admin/dives/template`: what a new dive starts from, in one request. */
export type DiveTemplateOut = Schemas['DiveTemplateOut'];

/** The template's previous dive, in the shape `POST /admin/dives` takes. */
export type DiveTemplateDive = Schemas['DiveTemplateDive'];

/** The last dive at a site, for the values a new dive there starts from. */
export type SiteLastDive = Schemas['SiteLastDive'];

/** A recently dived site, for the top of the site picker. */
export type TemplateSite = Schemas['TemplateSite'];

/** Someone often dived with, for the top of the buddy picker. */
export type TemplatePerson = Schemas['TemplatePerson'];

/** `POST /admin/preview/markdown`: the Markdown as sanitised HTML. */
export type MarkdownPreviewOut = Schemas['MarkdownPreviewOut'];

/** `POST /admin/dives/publish`: drafts made public, and the numbers left as they were. */
export type DivesPublishOut = Schemas['DivesPublishOut'];

export type CountryStat = Schemas['CountryStat'];

export type DiveEnvelope = Narrow<Schemas['DiveEnvelope'], { dives: DiveListItem[] }>;

export type MapSite = Schemas['MapSite'];

/** `GET /dive/sites/{slug}`: a site, the dives the viewer may see there and its surroundings. */
export type SiteDetail = Narrow<Schemas['SiteDetail'], { site: Site; dives: DiveListItem[] }>;

/** `GET /dive/people/{slug}`: a buddy and the dives, places, years and trips shared. */
export type PersonDetail = Narrow<Schemas['PersonDetail'], { dives: DiveListItem[] }>;

/** `GET /dive/timeline`: dives per year, gaps included, and the latest public dive. */
export type DiveTimeline = Schemas['DiveTimeline'];

export type YearCount = Schemas['TimelineYear'];

export type RecordDive = Schemas['RecordDive'];

export type DiveStats = Schemas['DiveStats'];

export type DiveSummary = Schemas['DiveSummary'];

export type GearItem = Schemas['GearItemOut'];

export type GearSetup = Schemas['GearSetupOut'];

export type GearPage = Schemas['GearPage'];

export type RepoStatus = Schemas['RepoStatus'];

/** What an import did (or, as a dry run, would do): dives created or updated, sites resolved. */
export type ImportResult = Schemas['ImportResult'];

/** One dive of a Shearwater Cloud export: new, attaching a profile, already logged, or unreadable. */
export type ImportDive = Schemas['ImportDiveOut'];

/** A log dive a new computer dive may belong to: same day, no profile from this computer yet. */
export type ImportCandidate = Schemas['ImportCandidateOut'];

/** A surface break inside a computer dive, where the owner may split it into several log dives. */
export type ImportBreak = Schemas['ImportBreakOut'];

/** One part of a computer dive split at its surface breaks, logged as its own dive. */
export type ImportPart = Schemas['ImportPartOut'];

/** One imported site: matched to a site in the log or the commons, or created as personal. */
export type ImportSite = Schemas['ImportSiteOut'];

/** A commons site offered for adoption by `GET /admin/commons/sites`. */
export type CommonsSiteHit = Schemas['CommonsSiteHit'];

/** `POST /admin/commons/pull`: the heads before and after, the manifest pin, stale sites. */
export type CommonsPullOut = Schemas['CommonsPullOut'];

/** An overlay or fork the commons moved past; `new` when the pull made it stale. */
export type CommonsStaleSite = Schemas['CommonsStaleSite'];

/** One past import, newest first in `GET /admin/imports`. */
export type ImportRecord = Schemas['ImportRecordOut'];

/** Body of `POST /admin/regions` and `PUT /admin/regions/{id}`. */
export type RegionIn = Schemas['RegionIn'];

/** The body of `POST /admin/sites` and `PUT /admin/sites/{id}`; `note` says what changed. */
export type SiteIn = Schemas['SiteIn'];

/** `GET /admin/sites/nearby`: possible duplicates of a site being created, nearest first. */
export type NearbySitesOut = Schemas['NearbySitesOut'];

/** A site of this log that may be the one being created. */
export type NearbyLogSite = Schemas['NearbyLogSite'];

/** A commons site this log does not use yet that may be the one being created. */
export type NearbyCommonsSite = Schemas['NearbyCommonsSite'];

/** `GET /meta/countries`: a country by ISO codes and English name. */
export type CountryOut = Schemas['CountryOut'];

/** `GET /meta/licences`: a licence a photo by someone else may carry. */
export type LicenceOut = Schemas['LicenceOut'];

/** `GET /admin/meta/site-fields`: how a commons site's fields behave under an overlay. */
export type SiteFieldsOut = Schemas['SiteFieldsOut'];

/** The editable fields of an attachment (`PATCH /admin/attachments/{id}`). */
export type AttachmentPatch = Schemas['AttachmentPatch'];
