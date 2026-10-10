/**
 * Generated from the backend's OpenAPI document by scripts/api-types.mjs. Do not edit.
 * Regenerate with `pnpm types` (or `make types`); CI runs `pnpm types:check`.
 * Hand-written names that components import live in ./types.ts.
 */

export interface paths {
  '/api/v1/version': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Version */
    get: operations['version_api_v1_version_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Dive Stats */
    get: operations['dive_stats_api_v1_dive_stats_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/summary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Dive Summary */
    get: operations['dive_summary_api_v1_dive_summary_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/timeline': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Dive Timeline
     * @description Front-page timeline: dives per year and the latest public dive to link to.
     */
    get: operations['dive_timeline_api_v1_dive_timeline_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/dives': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Dives */
    get: operations['list_dives_api_v1_dive_dives_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/dives/{number}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Dive */
    get: operations['get_dive_api_v1_dive_dives__number__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/sites': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Sites */
    get: operations['list_sites_api_v1_dive_sites_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/sites/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Site */
    get: operations['get_site_api_v1_dive_sites__slug__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/regions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Regions */
    get: operations['list_regions_api_v1_dive_regions_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/regions/{region_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Region */
    get: operations['get_region_api_v1_dive_regions__region_id__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/trips': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Trips */
    get: operations['list_trips_api_v1_dive_trips_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/trips/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Trip */
    get: operations['get_trip_api_v1_dive_trips__slug__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/people': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List People */
    get: operations['list_people_api_v1_dive_people_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/people/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Person */
    get: operations['get_person_api_v1_dive_people__slug__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dive/gear': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Gear */
    get: operations['gear_api_v1_dive_gear_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/magic-link': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Magic Link */
    post: operations['magic_link_api_v1_auth_magic_link_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Verify */
    get: operations['verify_api_v1_auth_verify_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Me */
    get: operations['me_api_v1_auth_me_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Logout */
    post: operations['logout_api_v1_auth_logout_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/dives': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Admin List Dives
     * @description Every dive, newest first, as list rows; ``GET /dives/{number}`` has the full record.
     */
    get: operations['admin_list_dives_api_v1_admin_dives_get'];
    put?: never;
    /** Admin Create Dive */
    post: operations['admin_create_dive_api_v1_admin_dives_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/dives/next-number': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Next Number */
    get: operations['admin_next_number_api_v1_admin_dives_next_number_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/dives/{number}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Get Dive */
    get: operations['admin_get_dive_api_v1_admin_dives__number__get'];
    /** Admin Update Dive */
    put: operations['admin_update_dive_api_v1_admin_dives__number__put'];
    post?: never;
    /** Admin Delete Dive */
    delete: operations['admin_delete_dive_api_v1_admin_dives__number__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/dives/{number}/attachments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Upload Attachment */
    post: operations['admin_upload_attachment_api_v1_admin_dives__number__attachments_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/sites/{site_id}/attachments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Upload Site Attachment */
    post: operations['admin_upload_site_attachment_api_v1_admin_sites__site_id__attachments_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/people/{person_id}/avatar': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Upload Avatar */
    post: operations['admin_upload_avatar_api_v1_admin_people__person_id__avatar_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/gear/items/{item_id}/photo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Upload Gear Photo */
    post: operations['admin_upload_gear_photo_api_v1_admin_gear_items__item_id__photo_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/attachments/{media_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Admin Delete Attachment */
    delete: operations['admin_delete_attachment_api_v1_admin_attachments__media_id__delete'];
    options?: never;
    head?: never;
    /** Admin Patch Attachment */
    patch: operations['admin_patch_attachment_api_v1_admin_attachments__media_id__patch'];
    trace?: never;
  };
  '/api/v1/admin/sites': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Sites */
    get: operations['admin_sites_api_v1_admin_sites_get'];
    put?: never;
    /** Admin Create Site */
    post: operations['admin_create_site_api_v1_admin_sites_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/sites/{site_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Get Site */
    get: operations['admin_get_site_api_v1_admin_sites__site_id__get'];
    /**
     * Admin Update Site
     * @description Replace a site.
     *
     *     On a commons site only overlay material is accepted (422 otherwise); ``fork=true`` writes
     *     a personal copy that shadows the commons record instead. ``revision`` and ``changelog`` in
     *     the body are ignored and the stored ones kept, so a stale editor form cannot rewind a
     *     revision; the server moves to the next revision when an objective field changes.
     */
    put: operations['admin_update_site_api_v1_admin_sites__site_id__put'];
    post?: never;
    /**
     * Admin Delete Site
     * @description Delete a personal site, a fork (back to the commons) or the overlay of a commons site.
     */
    delete: operations['admin_delete_site_api_v1_admin_sites__site_id__delete'];
    options?: never;
    head?: never;
    /**
     * Admin Patch Site
     * @description Change the default map, prices or location visibility; the latter is objective.
     */
    patch: operations['admin_patch_site_api_v1_admin_sites__site_id__patch'];
    trace?: never;
  };
  '/api/v1/admin/sites/{site_id}/pin': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Admin Pin Site
     * @description Mark an overlay or fork as reviewed against the current commons revision.
     *
     *     404 for a personal site, a site without a commons record, or a commons site without an
     *     overlay: there is nothing pinned.
     */
    post: operations['admin_pin_site_api_v1_admin_sites__site_id__pin_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/sites/{site_id}/maps': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Create Map */
    post: operations['admin_create_map_api_v1_admin_sites__site_id__maps_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/maps/{map_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Admin Update Map
     * @description Overwrite the drawing; an unchanged one is not saved again.
     */
    put: operations['admin_update_map_api_v1_admin_maps__map_id__put'];
    post?: never;
    /** Admin Delete Map */
    delete: operations['admin_delete_map_api_v1_admin_maps__map_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/sites/{site_id}/maps/order': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Admin Order Maps */
    put: operations['admin_order_maps_api_v1_admin_sites__site_id__maps_order_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/trips': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Admin Trips
     * @description Trips the owner sees on the site plus overrides that claim no dives, newest first.
     */
    get: operations['admin_trips_api_v1_admin_trips_get'];
    put?: never;
    /** Admin Create Trip */
    post: operations['admin_create_trip_api_v1_admin_trips_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/trips/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Get Trip */
    get: operations['admin_get_trip_api_v1_admin_trips__slug__get'];
    /** Admin Update Trip */
    put: operations['admin_update_trip_api_v1_admin_trips__slug__put'];
    post?: never;
    /**
     * Admin Delete Trip
     * @description Remove the override file; a derived trip it renamed or merged shows again.
     */
    delete: operations['admin_delete_trip_api_v1_admin_trips__slug__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/regions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Admin Regions
     * @description Every region with its sites and dive count, and its description for the editor.
     */
    get: operations['admin_regions_api_v1_admin_regions_get'];
    put?: never;
    /** Admin Create Region */
    post: operations['admin_create_region_api_v1_admin_regions_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/regions/{region_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Admin Update Region */
    put: operations['admin_update_region_api_v1_admin_regions__region_id__put'];
    post?: never;
    /** Admin Delete Region */
    delete: operations['admin_delete_region_api_v1_admin_regions__region_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/people': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin People */
    get: operations['admin_people_api_v1_admin_people_get'];
    put?: never;
    /** Admin Create Person */
    post: operations['admin_create_person_api_v1_admin_people_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/people/{person_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Get Person */
    get: operations['admin_get_person_api_v1_admin_people__person_id__get'];
    /** Admin Update Person */
    put: operations['admin_update_person_api_v1_admin_people__person_id__put'];
    post?: never;
    /**
     * Admin Delete Person
     * @description Remove the person file and their media; refused while any dive still names them.
     */
    delete: operations['admin_delete_person_api_v1_admin_people__person_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/gear/items': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Gear Items */
    get: operations['admin_gear_items_api_v1_admin_gear_items_get'];
    put?: never;
    /** Admin Create Gear Item */
    post: operations['admin_create_gear_item_api_v1_admin_gear_items_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/gear/items/{item_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Admin Update Gear Item */
    put: operations['admin_update_gear_item_api_v1_admin_gear_items__item_id__put'];
    post?: never;
    /** Admin Delete Gear Item */
    delete: operations['admin_delete_gear_item_api_v1_admin_gear_items__item_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/gear/setups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Gear Setups */
    get: operations['admin_gear_setups_api_v1_admin_gear_setups_get'];
    put?: never;
    /** Admin Create Gear Setup */
    post: operations['admin_create_gear_setup_api_v1_admin_gear_setups_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/gear/setups/{setup_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Admin Update Gear Setup */
    put: operations['admin_update_gear_setup_api_v1_admin_gear_setups__setup_id__put'];
    post?: never;
    /** Admin Delete Gear Setup */
    delete: operations['admin_delete_gear_setup_api_v1_admin_gear_setups__setup_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/repo/status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Admin Repo Status
     * @description State of the log repository, the commons checkout and the last load.
     */
    get: operations['admin_repo_status_api_v1_admin_repo_status_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/repo/push': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Repo Push */
    post: operations['admin_repo_push_api_v1_admin_repo_push_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/repo/pull': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Repo Pull */
    post: operations['admin_repo_pull_api_v1_admin_repo_pull_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/repo/reload': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Admin Repo Reload */
    post: operations['admin_repo_reload_api_v1_admin_repo_reload_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/import/subsurface': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Admin Import Subsurface
     * @description Create draft dives (or attach profiles to matching ones) from a Subsurface export.
     */
    post: operations['admin_import_subsurface_api_v1_admin_import_subsurface_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/import/shearwater': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Admin Import Shearwater
     * @description Attach Perdix profiles to the dives they belong to, or create drafts for new ones.
     *
     *     A dive matches when it starts within ten minutes of the computer's start time, or already
     *     lists the computer's dive number. Every file is kept as-is in storage.
     */
    post: operations['admin_import_shearwater_api_v1_admin_import_shearwater_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/imports': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Admin Imports */
    get: operations['admin_imports_api_v1_admin_imports_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Health */
    get: operations['health_health_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /** AccessPoint */
    'AccessPoint-Input': {
      /** Lat */
      lat?: number | null;
      /** Lon */
      lon?: number | null;
      /** Note */
      note?: string | null;
    } & {
      [key: string]: unknown;
    };
    /** AccessPoint */
    'AccessPoint-Output': {
      /** Lat */
      lat: number | null;
      /** Lon */
      lon: number | null;
      /** Note */
      note: string | null;
    } & {
      [key: string]: unknown;
    };
    /**
     * AdminDiveListItem
     * @description One row of the editor's dive list: what the table shows, filters and sorts on.
     */
    AdminDiveListItem: {
      /** Number */
      number: number;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Title */
      title: string;
      /** Site Name */
      site_name: string | null;
      /** Max Depth M */
      max_depth_m: number;
      /** Duration Min */
      duration_min: number;
      /** Tags */
      tags: string[];
      /** Attachments */
      attachments: number;
      /** Visibility */
      visibility: string;
    };
    /** AttachmentOut */
    AttachmentOut: {
      /** Id */
      id: string;
      /** Kind */
      kind: string;
      /** Mime */
      mime: string;
      /** Bytes */
      bytes: number;
      /** Width */
      width: number | null;
      /** Height */
      height: number | null;
      /** Caption */
      caption: string;
      /**
       * Credit
       * @default
       */
      credit: string;
      /** Sort */
      sort: number;
      /**
       * Public
       * @default true
       */
      public: boolean;
      /** Taken At */
      taken_at: string | null;
      /** Original Name */
      original_name: string;
      /** Url */
      url: string;
      /** Variants */
      variants: {
        [key: string]: string;
      };
    };
    /** AttachmentPatch */
    AttachmentPatch: {
      /** Kind */
      kind?: ('photo' | 'scan' | 'map' | 'avatar' | 'video' | 'export') | null;
      /** Caption */
      caption?: string | null;
      /** Credit */
      credit?: string | null;
      /** Sort */
      sort?: number | null;
      /** Public */
      public?: boolean | null;
    };
    /**
     * Attribution
     * @description Licence and source of a site record taken from a shared commons.
     */
    Attribution: {
      /** Licence */
      licence: string;
      /** Source */
      source: string;
      /** Ref */
      ref: string | null;
    };
    /** Body_admin_import_shearwater_api_v1_admin_import_shearwater_post */
    Body_admin_import_shearwater_api_v1_admin_import_shearwater_post: {
      /** Files */
      files: string[];
    };
    /** Body_admin_import_subsurface_api_v1_admin_import_subsurface_post */
    Body_admin_import_subsurface_api_v1_admin_import_subsurface_post: {
      /** File */
      file: string;
    };
    /** Body_admin_upload_attachment_api_v1_admin_dives__number__attachments_post */
    Body_admin_upload_attachment_api_v1_admin_dives__number__attachments_post: {
      /** File */
      file: string;
    };
    /** Body_admin_upload_avatar_api_v1_admin_people__person_id__avatar_post */
    Body_admin_upload_avatar_api_v1_admin_people__person_id__avatar_post: {
      /** File */
      file: string;
    };
    /** Body_admin_upload_gear_photo_api_v1_admin_gear_items__item_id__photo_post */
    Body_admin_upload_gear_photo_api_v1_admin_gear_items__item_id__photo_post: {
      /** File */
      file: string;
    };
    /** Body_admin_upload_site_attachment_api_v1_admin_sites__site_id__attachments_post */
    Body_admin_upload_site_attachment_api_v1_admin_sites__site_id__attachments_post: {
      /** File */
      file: string;
    };
    /**
     * BuddyOut
     * @description A buddy on a dive page, with what the two of us have logged together.
     */
    BuddyOut: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Avatar Url */
      avatar_url: string | null;
      /** Dives Together */
      dives_together: number;
      /** First Dive */
      first_dive: string | null;
      /** Last Dive */
      last_dive: string | null;
      /**
       * First Together
       * @default false
       */
      first_together: boolean;
    };
    /**
     * ChangeEntry
     * @description One line of a record's changelog: the revision it produced, when, by whom and why.
     */
    ChangeEntry: {
      /** Revision */
      revision: number;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Author */
      author: string | null;
      /** Note */
      note: string;
    } & {
      [key: string]: unknown;
    };
    /** CountryStat */
    CountryStat: {
      /** Country Code */
      country_code: string;
      /** Country Name */
      country_name: string;
      /** Dives */
      dives: number;
    };
    /** DepthBucket */
    DepthBucket: {
      /** From M */
      from_m: number;
      /** To M */
      to_m: number;
      /** Dives */
      dives: number;
    };
    /**
     * DiveAdminOut
     * @description Admin view: raw identifiers alongside the public shape.
     */
    DiveAdminOut: {
      /** Number */
      number: number;
      /** Title */
      title: string;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Time In */
      time_in: string | null;
      /** Time Out */
      time_out: string | null;
      /** Duration Min */
      duration_min: number;
      /** Max Depth M */
      max_depth_m: number;
      /** Avg Depth M */
      avg_depth_m: number | null;
      /** Water Temp C */
      water_temp_c: number | null;
      /** Surface Temp C */
      surface_temp_c: number | null;
      /** Air Temp C */
      air_temp_c: number | null;
      /** Thermocline M */
      thermocline_m: number | null;
      /** Visibility M */
      visibility_m: number | null;
      /** Visibility Raw */
      visibility_raw: string | null;
      site: components['schemas']['SiteOut'] | null;
      /** Section */
      section: string | null;
      trip: components['schemas']['TripOut'] | null;
      /** Tags */
      tags: string[];
      /** Types Raw */
      types_raw: string | null;
      /** Gas */
      gas: string;
      /** O2 Pct */
      o2_pct: number | null;
      /** O2 Measured Pct */
      o2_measured_pct: number | null;
      /** He Pct */
      he_pct: number | null;
      /** Gas Raw */
      gas_raw: string | null;
      /** Mode */
      mode: string;
      /** Suit */
      suit: string | null;
      /** Weights Kg */
      weights_kg: number | null;
      /** Cylinder */
      cylinder: string | null;
      /** Pressure In Bar */
      pressure_in_bar: number | null;
      /** Pressure Out Bar */
      pressure_out_bar: number | null;
      /** Tanks */
      tanks: components['schemas']['TankOut'][];
      /** Sac L Min */
      sac_l_min: number | null;
      /** Sac Basis */
      sac_basis: string | null;
      /** Safety Stop Min */
      safety_stop_min: number | null;
      /** Surface Interval */
      surface_interval: string | null;
      /** Conditions */
      conditions: string | null;
      /** Difficulty */
      difficulty: string | null;
      /** Course */
      course: string | null;
      /** Rating */
      rating: number | null;
      gear_setup: components['schemas']['GearSetupRef'] | null;
      /** Guide */
      guide: string | null;
      /** Body Md */
      body_md: string;
      /** Notes Nl */
      notes_nl: string | null;
      /** Visibility */
      visibility: string;
      /** Buddies */
      buddies: components['schemas']['BuddyOut'][];
      /** Attachments */
      attachments: components['schemas']['AttachmentOut'][];
      /** Cover Attachment Id */
      cover_attachment_id: string | null;
      /** Computer */
      computer: number[];
      /** Profile */
      profile: components['schemas']['ProfileSample-Output'][] | null;
      profile_meta: components['schemas']['ProfileMeta'] | null;
      map_annotation: components['schemas']['DiveMapAnnotation-Output'] | null;
      /**
       * Annotation Stale
       * @default false
       */
      annotation_stale: boolean;
      /**
       * Annotation Dropped Legs
       * @default 0
       */
      annotation_dropped_legs: number;
      map: components['schemas']['SiteMapOut'] | null;
      /** Prev Number */
      prev_number: number | null;
      /** Next Number */
      next_number: number | null;
      /** Prev Site Name */
      prev_site_name: string | null;
      /** Next Site Name */
      next_site_name: string | null;
      /** Site Dive Index */
      site_dive_index: number | null;
      /** Day Index */
      day_index: number | null;
      /** Same Day */
      same_day: components['schemas']['SameDayDive'][];
      /** Context Facts */
      context_facts: string[];
      private: components['schemas']['DivePrivate'] | null;
      /** Id */
      id: number;
      /** People Ids */
      people_ids: string[];
      /** Site Id */
      site_id: string | null;
      /** Trip Id */
      trip_id: string | null;
      /** Gear Setup Id */
      gear_setup_id: string | null;
      /** Country */
      country: string | null;
      /**
       * Body Html
       * @description The dive story as sanitised HTML.
       */
      readonly body_html: string;
    };
    /**
     * DiveEnvelope
     * @description Shape used by the public index endpoint.
     */
    DiveEnvelope: {
      /** Dives */
      dives: components['schemas']['DiveListItem'][];
      /** Total */
      total: number;
      /** Tags */
      tags: string[];
      /** Countries */
      countries: components['schemas']['CountryStat'][];
      /** Years */
      years: number[];
      /** Regions */
      regions: string[];
      /** Site Types */
      site_types: string[];
      /** Gear Setups */
      gear_setups: components['schemas']['GearSetupRef'][];
    };
    /** DiveIn */
    DiveIn: {
      /** Number */
      number: number;
      /**
       * Title
       * @default
       */
      title?: string;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Time In */
      time_in?: string | null;
      /** Time Out */
      time_out?: string | null;
      /** Duration Min */
      duration_min: number;
      /** Max Depth M */
      max_depth_m: number;
      /** Avg Depth M */
      avg_depth_m?: number | null;
      /** Water Temp C */
      water_temp_c?: number | null;
      /** Surface Temp C */
      surface_temp_c?: number | null;
      /** Air Temp C */
      air_temp_c?: number | null;
      /** Thermocline M */
      thermocline_m?: number | null;
      /** Visibility M */
      visibility_m?: number | null;
      /** Visibility Raw */
      visibility_raw?: string | null;
      /** Site Id */
      site_id?: string | null;
      /** Section */
      section?: string | null;
      /** Trip Id */
      trip_id?: string | null;
      /** Tags */
      tags?: string[];
      /** Types Raw */
      types_raw?: string | null;
      /**
       * Gas
       * @default air
       * @enum {string}
       */
      gas?: 'air' | 'nitrox' | 'trimix';
      /** O2 Pct */
      o2_pct?: number | null;
      /** O2 Measured Pct */
      o2_measured_pct?: number | null;
      /** He Pct */
      he_pct?: number | null;
      /** Gas Raw */
      gas_raw?: string | null;
      /**
       * Mode
       * @default OC
       * @enum {string}
       */
      mode?: 'OC' | 'CCR' | 'sidemount';
      /** Suit */
      suit?: string | null;
      /** Weights Kg */
      weights_kg?: number | null;
      /** Cylinder */
      cylinder?: string | null;
      /** Pressure In Bar */
      pressure_in_bar?: number | null;
      /** Pressure Out Bar */
      pressure_out_bar?: number | null;
      /** Tanks */
      tanks?: components['schemas']['TankIn'][];
      /** Safety Stop Min */
      safety_stop_min?: number | null;
      /** Surface Interval */
      surface_interval?: string | null;
      /** Conditions */
      conditions?: string | null;
      /** Difficulty */
      difficulty?: string | null;
      /** Course */
      course?: string | null;
      /** Rating */
      rating?: number | null;
      /** Gear Setup Id */
      gear_setup_id?: string | null;
      /** Guide */
      guide?: string | null;
      /** Operator */
      operator?: string | null;
      /** Buddy Raw */
      buddy_raw?: string | null;
      /** Buddy Role */
      buddy_role?: string | null;
      /**
       * Body Md
       * @default
       */
      body_md?: string;
      /** Notes Nl */
      notes_nl?: string | null;
      /**
       * Visibility
       * @default public
       * @enum {string}
       */
      visibility?: 'public' | 'private' | 'draft';
      /** People Ids */
      people_ids?: string[];
      /** Cover Attachment Id */
      cover_attachment_id?: string | null;
      /** Computer */
      computer?: number[];
      /** Flags */
      flags?: string[];
      /** Sketch */
      sketch?: string | null;
      /** Profile */
      profile?: components['schemas']['ProfileSample-Input'][] | null;
      map_annotation?: components['schemas']['DiveMapAnnotation-Input'] | null;
    };
    /**
     * DiveListItem
     * @description Compact row for the searchable index; a few hundred of these are one request.
     */
    DiveListItem: {
      /** Number */
      number: number;
      /** Title */
      title: string;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Time In */
      time_in: string | null;
      /** Duration Min */
      duration_min: number;
      /** Max Depth M */
      max_depth_m: number;
      /** Water Temp C */
      water_temp_c: number | null;
      /** Tags */
      tags: string[];
      /** Gas */
      gas: string;
      /** Gases */
      gases: string[];
      /** Mode */
      mode: string;
      site: components['schemas']['SiteSummary'] | null;
      /** Section */
      section: string | null;
      /** Buddies */
      buddies: components['schemas']['PersonPublic'][];
      /** Gear Setup */
      gear_setup: string | null;
      /** Rating */
      rating: number | null;
      /** Has Photos */
      has_photos: boolean;
      /** Has Profile */
      has_profile: boolean;
      /** Spark */
      spark: number[] | null;
      /** Cover Url */
      cover_url: string | null;
      /** Search Text */
      search_text: string;
      trip: components['schemas']['TripRef'] | null;
    };
    /**
     * DiveMapAnnotation
     * @description What one dive did on a site map.
     *
     *     ``route`` follows the drawn line of a stick map, leg by leg in swim order; ``path`` is a
     *     free-drawn track on a site map. ``turn`` names the station, ``turn_at`` the path point,
     *     where the dive turned.
     */
    'DiveMapAnnotation-Input': {
      /** Map Id */
      map_id: string;
      /**
       * Revision
       * @default 1
       */
      revision?: number;
      /** Route */
      route?: components['schemas']['MapEdgeRef'][];
      /** Turn */
      turn?: string | null;
      /** Pins */
      pins?: components['schemas']['DiveMapPin-Input'][];
      /** Path */
      path?: components['schemas']['MapPoint'][];
      /** Turn At */
      turn_at?: number | null;
      /**
       * Note
       * @default
       */
      note?: string;
    };
    /**
     * DiveMapAnnotation
     * @description What one dive did on a site map.
     *
     *     ``route`` follows the drawn line of a stick map, leg by leg in swim order; ``path`` is a
     *     free-drawn track on a site map. ``turn`` names the station, ``turn_at`` the path point,
     *     where the dive turned.
     */
    'DiveMapAnnotation-Output': {
      /** Map Id */
      map_id: string;
      /**
       * Revision
       * @default 1
       */
      revision: number;
      /** Route */
      route: components['schemas']['MapEdgeRef'][];
      /** Turn */
      turn: string | null;
      /** Pins */
      pins: components['schemas']['DiveMapPin-Output'][];
      /** Path */
      path: components['schemas']['MapPoint'][];
      /** Turn At */
      turn_at: number | null;
      /**
       * Note
       * @default
       */
      note: string;
    };
    /** DiveMapPin */
    'DiveMapPin-Input': {
      /** Id */
      id: string;
      /** X */
      x: number;
      /** Y */
      y: number;
      /**
       * Note
       * @default
       */
      note?: string;
    };
    /** DiveMapPin */
    'DiveMapPin-Output': {
      /** Id */
      id: string;
      /** X */
      x: number;
      /** Y */
      y: number;
      /**
       * Note
       * @default
       */
      note: string;
    };
    /** DiveOut */
    DiveOut: {
      /** Number */
      number: number;
      /** Title */
      title: string;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Time In */
      time_in: string | null;
      /** Time Out */
      time_out: string | null;
      /** Duration Min */
      duration_min: number;
      /** Max Depth M */
      max_depth_m: number;
      /** Avg Depth M */
      avg_depth_m: number | null;
      /** Water Temp C */
      water_temp_c: number | null;
      /** Surface Temp C */
      surface_temp_c: number | null;
      /** Air Temp C */
      air_temp_c: number | null;
      /** Thermocline M */
      thermocline_m: number | null;
      /** Visibility M */
      visibility_m: number | null;
      /** Visibility Raw */
      visibility_raw: string | null;
      site: components['schemas']['SiteOut'] | null;
      /** Section */
      section: string | null;
      trip: components['schemas']['TripOut'] | null;
      /** Tags */
      tags: string[];
      /** Types Raw */
      types_raw: string | null;
      /** Gas */
      gas: string;
      /** O2 Pct */
      o2_pct: number | null;
      /** O2 Measured Pct */
      o2_measured_pct: number | null;
      /** He Pct */
      he_pct: number | null;
      /** Gas Raw */
      gas_raw: string | null;
      /** Mode */
      mode: string;
      /** Suit */
      suit: string | null;
      /** Weights Kg */
      weights_kg: number | null;
      /** Cylinder */
      cylinder: string | null;
      /** Pressure In Bar */
      pressure_in_bar: number | null;
      /** Pressure Out Bar */
      pressure_out_bar: number | null;
      /** Tanks */
      tanks: components['schemas']['TankOut'][];
      /** Sac L Min */
      sac_l_min: number | null;
      /** Sac Basis */
      sac_basis: string | null;
      /** Safety Stop Min */
      safety_stop_min: number | null;
      /** Surface Interval */
      surface_interval: string | null;
      /** Conditions */
      conditions: string | null;
      /** Difficulty */
      difficulty: string | null;
      /** Course */
      course: string | null;
      /** Rating */
      rating: number | null;
      gear_setup: components['schemas']['GearSetupRef'] | null;
      /** Guide */
      guide: string | null;
      /** Body Md */
      body_md: string;
      /** Notes Nl */
      notes_nl: string | null;
      /** Visibility */
      visibility: string;
      /** Buddies */
      buddies: components['schemas']['BuddyOut'][];
      /** Attachments */
      attachments: components['schemas']['AttachmentOut'][];
      /** Cover Attachment Id */
      cover_attachment_id: string | null;
      /** Computer */
      computer: number[];
      /** Profile */
      profile: components['schemas']['ProfileSample-Output'][] | null;
      profile_meta: components['schemas']['ProfileMeta'] | null;
      map_annotation: components['schemas']['DiveMapAnnotation-Output'] | null;
      /**
       * Annotation Stale
       * @default false
       */
      annotation_stale: boolean;
      /**
       * Annotation Dropped Legs
       * @default 0
       */
      annotation_dropped_legs: number;
      map: components['schemas']['SiteMapOut'] | null;
      /** Prev Number */
      prev_number: number | null;
      /** Next Number */
      next_number: number | null;
      /** Prev Site Name */
      prev_site_name: string | null;
      /** Next Site Name */
      next_site_name: string | null;
      /** Site Dive Index */
      site_dive_index: number | null;
      /** Day Index */
      day_index: number | null;
      /** Same Day */
      same_day: components['schemas']['SameDayDive'][];
      /** Context Facts */
      context_facts: string[];
      private: components['schemas']['DivePrivate'] | null;
      /**
       * Body Html
       * @description The dive story as sanitised HTML.
       */
      readonly body_html: string;
    };
    /** DivePrivate */
    DivePrivate: {
      /** People */
      people: components['schemas']['PersonPrivate'][];
      /** Buddy Raw */
      buddy_raw: string | null;
      /** Buddy Role */
      buddy_role: string | null;
      /** Operator */
      operator: string | null;
      /** Flags */
      flags: string[];
      /** Sketch */
      sketch: string | null;
      /** Site Name Raw */
      site_name_raw: string | null;
      /** Area Raw */
      area_raw: string | null;
    };
    /** DiveStats */
    DiveStats: {
      /** Total Dives */
      total_dives: number;
      /** Private Dives */
      private_dives: number;
      /** Total Minutes */
      total_minutes: number;
      /** Max Depth M */
      max_depth_m: number;
      /** Avg Depth M */
      avg_depth_m: number | null;
      /** Avg Duration Min */
      avg_duration_min: number | null;
      /** Countries */
      countries: number;
      /** Sites */
      sites: number;
      /** First Dive */
      first_dive: string | null;
      /** Last Dive */
      last_dive: string | null;
      /** Tags */
      tags: components['schemas']['TagStat'][];
      /** Deep Dives */
      deep_dives: number;
      /** Years */
      years: components['schemas']['YearStat'][];
      /** Country Breakdown */
      country_breakdown: components['schemas']['CountryStat'][];
      /** Depth Buckets */
      depth_buckets: components['schemas']['DepthBucket'][];
      /** Map Sites */
      map_sites: components['schemas']['MapSite'][];
      deepest: components['schemas']['RecordDive'] | null;
      longest: components['schemas']['RecordDive'] | null;
      coldest: components['schemas']['RecordDive'] | null;
    };
    /**
     * DiveSummary
     * @description Tiny payload for the front-page tile.
     */
    DiveSummary: {
      /** Total Dives */
      total_dives: number;
      /** Total Hours */
      total_hours: number;
      /** Countries */
      countries: number;
      /** Max Depth M */
      max_depth_m: number;
      /** Last Dive */
      last_dive: string | null;
      /** Last Dive Site */
      last_dive_site: string | null;
      /** Cave Dives */
      cave_dives: number;
      /** Scooter Dives */
      scooter_dives: number;
    };
    /**
     * DiveTimeline
     * @description Front-page timeline: dives per year, gaps included, and the latest public dive.
     */
    DiveTimeline: {
      /** Years */
      years: components['schemas']['TimelineYear'][];
      latest: components['schemas']['TimelineDive'] | null;
    };
    /** GearItemIn */
    GearItemIn: {
      /** Name */
      name: string;
      /**
       * Category
       * @enum {string}
       */
      category:
        | 'regulator'
        | 'bcd'
        | 'wing'
        | 'computer'
        | 'dpv'
        | 'light'
        | 'suit'
        | 'cylinder'
        | 'mask'
        | 'fins'
        | 'reel'
        | 'camera'
        | 'other';
      /**
       * Brand
       * @default
       */
      brand?: string;
      /**
       * Model
       * @default
       */
      model?: string;
      /** Acquired */
      acquired?: string | null;
      /** Retired */
      retired?: string | null;
      /**
       * Notes Md
       * @default
       */
      notes_md?: string;
      /**
       * Sort
       * @default 0
       */
      sort?: number;
    };
    /** GearItemOut */
    GearItemOut: {
      /** Id */
      id: string;
      /** Name */
      name: string;
      /** Category */
      category: string;
      /** Brand */
      brand: string;
      /** Model */
      model: string;
      /** Acquired */
      acquired: string | null;
      /** Retired */
      retired: string | null;
      /** Notes Md */
      notes_md: string;
      /** Sort */
      sort: number;
      /** Photo Url */
      photo_url: string | null;
      /**
       * Dive Count
       * @default 0
       */
      dive_count: number;
      /**
       * Notes Html
       * @description The notes as sanitised HTML.
       */
      readonly notes_html: string;
    };
    /** GearPage */
    GearPage: {
      /** Setups */
      setups: components['schemas']['GearSetupOut'][];
      /** Items */
      items: components['schemas']['GearItemOut'][];
    };
    /** GearSetupIn */
    GearSetupIn: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /**
       * Description Md
       * @default
       */
      description_md?: string;
      /**
       * Sort
       * @default 0
       */
      sort?: number;
      /** Item Ids */
      item_ids?: string[];
    };
    /** GearSetupOut */
    GearSetupOut: {
      /** Id */
      id: string;
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Description Md */
      description_md: string;
      /** Sort */
      sort: number;
      /** Items */
      items: components['schemas']['GearItemOut'][];
      /**
       * Dive Count
       * @default 0
       */
      dive_count: number;
      /**
       * Description Html
       * @description The description as sanitised HTML.
       */
      readonly description_html: string;
    };
    /** GearSetupRef */
    GearSetupRef: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
    };
    /** HTTPValidationError */
    HTTPValidationError: {
      /** Detail */
      detail?: components['schemas']['ValidationError'][];
    };
    /**
     * ImportRecordOut
     * @description One past import as the import page lists it; ``created_at`` is ISO 8601 as stored.
     */
    ImportRecordOut: {
      /** Id */
      id: string;
      /** Format */
      format: string;
      /** Original Name */
      original_name: string;
      /** Created At */
      created_at: string;
      /** Created */
      created: number[];
      /** Updated */
      updated: number[];
      /** Url */
      url: string;
    };
    /** ImportResult */
    ImportResult: {
      /** Import Id */
      import_id: string;
      /** Created */
      created: number[];
      /** Updated */
      updated: number[];
      /** Skipped */
      skipped: number;
      /** Sites Created */
      sites_created: number;
    };
    /** MagicLinkRequest */
    MagicLinkRequest: {
      /**
       * Email
       * Format: email
       */
      email: string;
    };
    /**
     * MapArea
     * @description A closed shape: the shore, a depth band, coral, sand or a wreck footprint.
     */
    'MapArea-Input': {
      /** Id */
      id: string;
      /**
       * Kind
       * @default outline
       * @enum {string}
       */
      kind?:
        'outline' | 'depth' | 'shallows' | 'coral' | 'sand' | 'wall' | 'wreck' | 'reeds' | 'other';
      /**
       * Label
       * @default
       */
      label?: string;
      /** Depth */
      depth?: number | null;
      /** Points */
      points?: components['schemas']['MapPoint'][];
    };
    /**
     * MapArea
     * @description A closed shape: the shore, a depth band, coral, sand or a wreck footprint.
     */
    'MapArea-Output': {
      /** Id */
      id: string;
      /**
       * Kind
       * @default outline
       * @enum {string}
       */
      kind:
        'outline' | 'depth' | 'shallows' | 'coral' | 'sand' | 'wall' | 'wreck' | 'reeds' | 'other';
      /**
       * Label
       * @default
       */
      label: string;
      /** Depth */
      depth: number | null;
      /** Points */
      points: components['schemas']['MapPoint'][];
    };
    /** MapEdge */
    'MapEdge-Input': {
      /** From */
      from: string;
      /** To */
      to: string;
      /** Distance */
      distance?: number | null;
      /** Azimuth */
      azimuth?: number | null;
      /**
       * Note
       * @default
       */
      note?: string;
      /**
       * Style
       * @default line
       * @enum {string}
       */
      style?: 'line' | 'jump' | 'unsurveyed' | 'route';
    };
    /** MapEdge */
    'MapEdge-Output': {
      /** From */
      from: string;
      /** To */
      to: string;
      /** Distance */
      distance: number | null;
      /** Azimuth */
      azimuth: number | null;
      /**
       * Note
       * @default
       */
      note: string;
      /**
       * Style
       * @default line
       * @enum {string}
       */
      style: 'line' | 'jump' | 'unsurveyed' | 'route';
    };
    /** MapEdgeRef */
    MapEdgeRef: {
      /** From */
      from: string;
      /** To */
      to: string;
    };
    /**
     * MapLine
     * @description An open or closed polyline: a shoreline, a depth contour, a dive path, a wall.
     */
    'MapLine-Input': {
      /** Id */
      id: string;
      /**
       * Kind
       * @default path
       * @enum {string}
       */
      kind?: 'shoreline' | 'depth' | 'path' | 'wall' | 'pipe' | 'line';
      /**
       * Label
       * @default
       */
      label?: string;
      /** Depth */
      depth?: number | null;
      /**
       * Closed
       * @default false
       */
      closed?: boolean;
      /** Points */
      points?: components['schemas']['MapPoint'][];
    };
    /**
     * MapLine
     * @description An open or closed polyline: a shoreline, a depth contour, a dive path, a wall.
     */
    'MapLine-Output': {
      /** Id */
      id: string;
      /**
       * Kind
       * @default path
       * @enum {string}
       */
      kind: 'shoreline' | 'depth' | 'path' | 'wall' | 'pipe' | 'line';
      /**
       * Label
       * @default
       */
      label: string;
      /** Depth */
      depth: number | null;
      /**
       * Closed
       * @default false
       */
      closed: boolean;
      /** Points */
      points: components['schemas']['MapPoint'][];
    };
    /**
     * MapNode
     * @description A station or object on a site map.
     */
    'MapNode-Input': {
      /** Id */
      id: string;
      /** X */
      x: number;
      /** Y */
      y: number;
      /**
       * Type
       * @default station
       * @enum {string}
       */
      type?:
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
      /**
       * Label
       * @default
       */
      label?: string;
      /** Depth */
      depth?: number | null;
      /** Object Kind */
      object_kind?:
        | (
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
            | 'other'
          )
        | null;
      /** Left */
      left?: number | null;
      /** Right */
      right?: number | null;
      /** Color */
      color?: string | null;
    };
    /**
     * MapNode
     * @description A station or object on a site map.
     */
    'MapNode-Output': {
      /** Id */
      id: string;
      /** X */
      x: number;
      /** Y */
      y: number;
      /**
       * Type
       * @default station
       * @enum {string}
       */
      type:
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
      /**
       * Label
       * @default
       */
      label: string;
      /** Depth */
      depth: number | null;
      /** Object Kind */
      object_kind:
        | (
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
            | 'other'
          )
        | null;
      /** Left */
      left: number | null;
      /** Right */
      right: number | null;
      /** Color */
      color: string | null;
    };
    /**
     * MapOrigin
     * @description Where (0, 0) of the drawing sits on the earth.
     */
    MapOrigin: {
      /** Lat */
      lat: number;
      /** Lon */
      lon: number;
    };
    /** MapPoint */
    MapPoint: {
      /** X */
      x: number;
      /** Y */
      y: number;
    };
    /**
     * MapRef
     * @description One map a site page can show, from any of the three collections.
     */
    MapRef: {
      /** Ref */
      ref: string;
      /**
       * Collection
       * @enum {string}
       */
      collection: 'seed' | 'drawn' | 'reference';
      /** Title */
      title: string;
      /** Url */
      url: string | null;
      /**
       * Public
       * @default true
       */
      public: boolean;
      /** Credit */
      credit: string | null;
      /** Warning */
      warning: string | null;
      drawn: components['schemas']['SiteMapOut'] | null;
    };
    /** MapSite */
    MapSite: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Country Code */
      country_code: string;
      /** Lat */
      lat: number;
      /** Lon */
      lon: number;
      /** Dives */
      dives: number;
      /** Minutes */
      minutes: number;
      /** Site Type */
      site_type: string;
      /** Max Depth M */
      max_depth_m: number;
      /** First Year */
      first_year: number;
      /** Last Year */
      last_year: number;
    };
    /**
     * MapUnderlay
     * @description A map shown beneath the canvas while drawing; never part of the rendered result.
     */
    'MapUnderlay-Input': {
      /** Ref */
      ref: string;
      /**
       * Scale
       * @default 1
       */
      scale?: number;
      /**
       * Dx
       * @default 0
       */
      dx?: number;
      /**
       * Dy
       * @default 0
       */
      dy?: number;
      /**
       * Rotation
       * @default 0
       */
      rotation?: number;
      /**
       * Opacity
       * @default 0.5
       */
      opacity?: number;
    };
    /**
     * MapUnderlay
     * @description A map shown beneath the canvas while drawing; never part of the rendered result.
     */
    'MapUnderlay-Output': {
      /** Ref */
      ref: string;
      /**
       * Scale
       * @default 1
       */
      scale: number;
      /**
       * Dx
       * @default 0
       */
      dx: number;
      /**
       * Dy
       * @default 0
       */
      dy: number;
      /**
       * Rotation
       * @default 0
       */
      rotation: number;
      /**
       * Opacity
       * @default 0.5
       */
      opacity: number;
    };
    /** Me */
    Me: {
      /** Email */
      email: string;
      /** Expires At */
      expires_at: string;
    };
    /**
     * NearbySite
     * @description Another exactly-placed site within walking-or-short-drive distance of a site.
     */
    NearbySite: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Country Code */
      country_code: string;
      /** Site Type */
      site_type: string;
      /** Lat */
      lat: number;
      /** Lon */
      lon: number;
      /** Distance Km */
      distance_km: number;
      /** Dives */
      dives: number;
    };
    /** NextDiveNumber */
    NextDiveNumber: {
      /** Number */
      number: number;
    };
    /**
     * PersonDetail
     * @description A buddy's page: the person and the dives, places, years and trips we shared.
     */
    PersonDetail: {
      person: components['schemas']['PersonOut'];
      /** Countries */
      countries: components['schemas']['CountryStat'][];
      /** Dives */
      dives: components['schemas']['DiveListItem'][];
      /** Map Sites */
      map_sites: components['schemas']['MapSite'][];
      /** Years */
      years: components['schemas']['YearStat'][];
      /** Trips */
      trips: components['schemas']['TripTogether'][];
    };
    /** PersonIn */
    PersonIn: {
      /** First Name */
      first_name: string;
      /** Last Name */
      last_name?: string | null;
      /** Alias */
      alias?: string | null;
      /** Aliases */
      aliases?: string[];
      /** Email */
      email?: string | null;
      /**
       * Display
       * @default alias-or-first
       * @enum {string}
       */
      display?: 'alias-or-first' | 'full' | 'hidden';
      /** Notes */
      notes?: string | null;
      /**
       * Bio Md
       * @default
       */
      bio_md?: string;
    };
    /** PersonOut */
    PersonOut: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Avatar Url */
      avatar_url: string | null;
      /**
       * Bio Md
       * @default
       */
      bio_md: string;
      stats: components['schemas']['PersonStats'];
      /** Countries */
      countries: string[];
      private: components['schemas']['PersonPrivate'] | null;
      /**
       * Bio Html
       * @description The bio as sanitised HTML.
       */
      readonly bio_html: string;
    };
    /** PersonPrivate */
    PersonPrivate: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Avatar Url */
      avatar_url: string | null;
      /** Id */
      id: string;
      /** First Name */
      first_name: string;
      /** Last Name */
      last_name: string | null;
      /** Alias */
      alias: string | null;
      /** Aliases */
      aliases: string[];
      /** Email */
      email: string | null;
      /** Display */
      display: string;
      /** Notes */
      notes: string | null;
      /** Dives */
      dives: number;
    };
    /** PersonPublic */
    PersonPublic: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Avatar Url */
      avatar_url: string | null;
    };
    /** PersonStats */
    PersonStats: {
      /** Dives */
      dives: number;
      /** Minutes */
      minutes: number;
      /** Max Depth M */
      max_depth_m: number;
      /** Longest Min */
      longest_min: number;
      /** Coldest C */
      coldest_c: number | null;
      /** First Dive */
      first_dive: string | null;
      /** Last Dive */
      last_dive: string | null;
      /** Countries */
      countries: number;
      /** Sites */
      sites: number;
    };
    /**
     * PinState
     * @description How a personal overlay or fork relates to the current commons revision of its site.
     */
    PinState: {
      /** Pinned Revision */
      pinned_revision: number | null;
      /** Current Revision */
      current_revision: number;
      /** Stale */
      stale: boolean;
    };
    /** Price */
    'Price-Input': {
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Amount */
      amount: number;
      /**
       * Currency
       * @default EUR
       */
      currency?: string;
      /**
       * Note
       * @default
       */
      note?: string;
    } & {
      [key: string]: unknown;
    };
    /** Price */
    'Price-Output': {
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Amount */
      amount: number;
      /**
       * Currency
       * @default EUR
       */
      currency: string;
      /**
       * Note
       * @default
       */
      note: string;
    } & {
      [key: string]: unknown;
    };
    /** ProfileMeta */
    ProfileMeta: {
      /** Gf */
      gf: string | null;
      /** Deco Model */
      deco_model: string | null;
      /**
       * Deco
       * @default false
       */
      deco: boolean;
      /** Gas Switches */
      gas_switches: unknown[][];
      /** Surface Breaks */
      surface_breaks: number[][];
      /** Temp Min C */
      temp_min_c: number | null;
      /** Temp Max C */
      temp_max_c: number | null;
      /** Sample Interval S */
      sample_interval_s: number | null;
      /** Partial */
      partial: string | null;
      /** Samples */
      samples: number | null;
      /** Deco Min */
      deco_min: number | null;
      /** Deepest Stop M */
      deepest_stop_m: number | null;
      /** First Stop S */
      first_stop_s: number | null;
      /** Max Ascent M Min */
      max_ascent_m_min: number | null;
      /** Max Descent M Min */
      max_descent_m_min: number | null;
      /** Time At Max S */
      time_at_max_s: number | null;
    };
    /** ProfileSample */
    'ProfileSample-Input': {
      /** T */
      t: number;
      /** D */
      d: number;
      /** Temp */
      temp?: number | null;
      /** Ndl */
      ndl?: number | null;
      /** Stop */
      stop?: number | null;
      /** Tts */
      tts?: number | null;
    };
    /** ProfileSample */
    'ProfileSample-Output': {
      /** T */
      t: number;
      /** D */
      d: number;
      /** Temp */
      temp: number | null;
      /** Ndl */
      ndl: number | null;
      /** Stop */
      stop: number | null;
      /** Tts */
      tts: number | null;
    };
    /** RecordDive */
    RecordDive: {
      /** Number */
      number: number;
      /** Title */
      title: string;
      /** Value */
      value: number;
      /** Site */
      site: string | null;
    };
    /** RegionIn */
    RegionIn: {
      /** Id */
      id: string;
      /** Name */
      name: string;
      /** Country */
      country?: string | null;
      /** Waters */
      waters?: string[];
      /**
       * Body Md
       * @default
       */
      body_md?: string;
    };
    /** RegionOut */
    RegionOut: {
      /** Id */
      id: string;
      /** Name */
      name: string;
      /** Country */
      country: string | null;
      /** Country Code */
      country_code: string;
      /** Waters */
      waters: string[];
      /**
       * Body Md
       * @default
       */
      body_md: string;
      /** Sites */
      sites: components['schemas']['SiteSummary'][];
      /**
       * Dives
       * @default 0
       */
      dives: number;
      stats: components['schemas']['RegionStats'] | null;
      /** Map Sites */
      map_sites: components['schemas']['MapSite'][];
      /**
       * Body Html
       * @description The region text as sanitised HTML.
       */
      readonly body_html: string;
    };
    /**
     * RegionStats
     * @description The small stats band on a region page, over the dives the viewer may see.
     */
    RegionStats: {
      /** Dives */
      dives: number;
      /** Sites */
      sites: number;
      /** Minutes */
      minutes: number;
      /** Max Depth M */
      max_depth_m: number | null;
      /** First Year */
      first_year: number | null;
      /** Last Year */
      last_year: number | null;
      top_site: components['schemas']['SiteRef'] | null;
    };
    /** RepoStatus */
    RepoStatus: {
      /** State */
      state: string;
      /**
       * Ahead
       * @default 0
       */
      ahead: number;
      /**
       * Behind
       * @default 0
       */
      behind: number;
      /** Head */
      head: string | null;
      /**
       * Dirty
       * @default false
       */
      dirty: boolean;
      /** Last Push At */
      last_push_at: string | null;
      /** Last Error */
      last_error: string | null;
      /** Load Errors */
      load_errors: string[];
      /** Notices */
      notices: string[];
      /** Commons Head */
      commons_head: string | null;
      /** Commons State */
      commons_state: string | null;
    };
    /**
     * SameDayDive
     * @description Another dive logged on the same day, for the context strip.
     */
    SameDayDive: {
      /** Number */
      number: number;
      /** Site Name */
      site_name: string | null;
      /** Time In */
      time_in: string | null;
    };
    /**
     * SiteDetail
     * @description A site page: the site, the dives the viewer may see there, and what surrounds it.
     */
    SiteDetail: {
      site: components['schemas']['SiteOut'];
      /** Dives */
      dives: components['schemas']['DiveListItem'][];
      /** People */
      people: components['schemas']['PersonPublic'][];
      /** Nearby */
      nearby: components['schemas']['NearbySite'][];
      /** Routes */
      routes: components['schemas']['SiteDiveRoute'][];
    };
    /**
     * SiteDiveRoute
     * @description One logged dive's route on one of the site's drawn maps.
     */
    SiteDiveRoute: {
      /** Number */
      number: number;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Title */
      title: string;
      annotation: components['schemas']['DiveMapAnnotation-Output'];
    };
    /** SiteIn */
    SiteIn: {
      /** Site Id */
      site_id: string;
      /** Name */
      name: string;
      /** Full Name */
      full_name?: string | null;
      /** Short Name */
      short_name?: string | null;
      /** Aliases */
      aliases?: string[];
      /** Region */
      region?: string | null;
      /** Country */
      country?: string | null;
      /** Area */
      area?: string | null;
      /** System */
      system?: string | null;
      /**
       * Type
       * @default sea
       */
      type?: string;
      /** Section Vocabulary */
      section_vocabulary?: string[];
      /** Lat */
      lat?: number | null;
      /** Lon */
      lon?: number | null;
      access?: components['schemas']['AccessPoint-Input'] | null;
      /**
       * Location Visibility
       * @default exact
       * @enum {string}
       */
      location_visibility?: 'exact' | 'region_only';
      /** Water */
      water?: ('salt' | 'fresh' | 'brackish') | null;
      /**
       * Halocline
       * @default false
       */
      halocline?: boolean;
      /** Halocline M */
      halocline_m?: number | null;
      /** Summary */
      summary?: string | null;
      /**
       * Description Md
       * @default
       */
      description_md?: string;
      /** Default Map */
      default_map?: string | null;
      /** Prices */
      prices?: components['schemas']['Price-Input'][];
      /** Sources */
      sources?: string[];
      /** Verified */
      verified?: string | null;
      /** Geo Source */
      geo_source?: string | null;
      /** Notes */
      notes?: string | null;
    };
    /**
     * SiteMap
     * @description One drawing for a site.
     */
    SiteMap: {
      /**
       * Version
       * @default 3
       */
      version?: number;
      /**
       * Kind
       * @default stickmap
       * @enum {string}
       */
      kind?: 'stickmap' | 'sitemap';
      /**
       * Title
       * @default
       */
      title?: string;
      /**
       * North
       * @default 0
       */
      north?: number;
      /**
       * To Scale
       * @default true
       */
      to_scale?: boolean;
      /** Nodes */
      nodes?: components['schemas']['MapNode-Input'][];
      /** Edges */
      edges?: components['schemas']['MapEdge-Input'][];
      /** Areas */
      areas?: components['schemas']['MapArea-Input'][];
      /** Lines */
      lines?: components['schemas']['MapLine-Input'][];
      /**
       * Notes
       * @default
       */
      notes?: string;
      origin?: components['schemas']['MapOrigin'] | null;
      underlay?: components['schemas']['MapUnderlay-Input'] | null;
    };
    /** SiteMapIn */
    SiteMapIn: {
      data: components['schemas']['SiteMap'];
      /**
       * Note
       * @default
       */
      note?: string;
    };
    /**
     * SiteMapOut
     * @description A drawn map as stored; ``revision`` counts saves, ``changelog`` says why, newest first.
     */
    SiteMapOut: {
      /**
       * Version
       * @default 3
       */
      version: number;
      /**
       * Kind
       * @default stickmap
       * @enum {string}
       */
      kind: 'stickmap' | 'sitemap';
      /**
       * Title
       * @default
       */
      title: string;
      /**
       * North
       * @default 0
       */
      north: number;
      /**
       * To Scale
       * @default true
       */
      to_scale: boolean;
      /** Nodes */
      nodes: components['schemas']['MapNode-Output'][];
      /** Edges */
      edges: components['schemas']['MapEdge-Output'][];
      /** Areas */
      areas: components['schemas']['MapArea-Output'][];
      /** Lines */
      lines: components['schemas']['MapLine-Output'][];
      /**
       * Notes
       * @default
       */
      notes: string;
      origin: components['schemas']['MapOrigin'] | null;
      underlay: components['schemas']['MapUnderlay-Output'] | null;
      /** Id */
      id: string;
      /** Site Id */
      site_id: string;
      /** Sort */
      sort: number;
      /** Revision */
      revision: number;
      /** Changelog */
      changelog: components['schemas']['ChangeEntry'][];
      /** Updated At */
      updated_at: string | null;
    };
    /** SiteOut */
    SiteOut: {
      /** Id */
      id: string;
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Full Name */
      full_name: string | null;
      /** Short Name */
      short_name: string | null;
      /** Aliases */
      aliases: string[];
      /** Country */
      country: string | null;
      /** Country Code */
      country_code: string;
      /** Country Name */
      country_name: string;
      /** Region */
      region: string | null;
      /** Region Name */
      region_name: string | null;
      /** Area */
      area: string | null;
      /** System */
      system: string | null;
      /** Site Type */
      site_type: string;
      /** Section Vocabulary */
      section_vocabulary: string[];
      /** Lat */
      lat: number | null;
      /** Lon */
      lon: number | null;
      access: components['schemas']['AccessPoint-Output'] | null;
      /** Location Visibility */
      location_visibility: string;
      /** Water */
      water: string | null;
      /** Halocline */
      halocline: boolean;
      /** Halocline M */
      halocline_m: number | null;
      /** Summary */
      summary: string | null;
      /** Description Md */
      description_md: string;
      /** Max Depth M */
      max_depth_m: number | null;
      /** Dives */
      dives: number;
      /** First Dive */
      first_dive: string | null;
      /** Last Dive */
      last_dive: string | null;
      /** Maps */
      maps: components['schemas']['MapRef'][];
      /** Default Map */
      default_map: string | null;
      /** Attachments */
      attachments: components['schemas']['AttachmentOut'][];
      /** Prices */
      prices: components['schemas']['Price-Output'][];
      /** Sources */
      sources: string[];
      /** Verified */
      verified: string | null;
      /** Geo Source */
      geo_source: string | null;
      /**
       * Origin
       * @default log
       * @enum {string}
       */
      origin: 'log' | 'commons' | 'fork';
      attribution: components['schemas']['Attribution'] | null;
      /**
       * Revision
       * @default 1
       */
      revision: number;
      /** Changelog */
      changelog: components['schemas']['ChangeEntry'][];
      /** Forked From */
      forked_from: string | null;
      private: components['schemas']['SitePrivate'] | null;
      /**
       * Description Html
       * @description The site description as sanitised HTML.
       */
      readonly description_html: string;
    };
    /** SitePatch */
    SitePatch: {
      /** Default Map */
      default_map?: string | null;
      /** Prices */
      prices?: components['schemas']['Price-Input'][] | null;
      /** Location Visibility */
      location_visibility?: ('exact' | 'region_only') | null;
    };
    /**
     * SitePrivate
     * @description Owner-only part of a site; ``pin`` is None for a personal site.
     */
    SitePrivate: {
      /** Notes */
      notes: string | null;
      /** Reference Maps */
      reference_maps: components['schemas']['MapRef'][];
      pin: components['schemas']['PinState'] | null;
    };
    /** SiteRef */
    SiteRef: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Dives */
      dives: number;
    };
    /** SiteSummary */
    SiteSummary: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Country Code */
      country_code: string;
      /** Country Name */
      country_name: string;
      /** Region */
      region: string | null;
      /** Area */
      area: string | null;
      /** Lat */
      lat: number | null;
      /** Lon */
      lon: number | null;
      /** Site Type */
      site_type: string;
      /** Water */
      water: string | null;
    };
    /** TagStat */
    TagStat: {
      /** Tag */
      tag: string;
      /** Count */
      count: number;
    };
    /**
     * TankIn
     * @description One cylinder carried on a dive; the first ``back`` tank is the dive's gas.
     */
    TankIn: {
      /** Cylinder */
      cylinder: string;
      /** Volume L */
      volume_l?: number | null;
      /**
       * Gas
       * @default air
       * @enum {string}
       */
      gas?: 'air' | 'nitrox' | 'trimix' | 'oxygen';
      /** O2 Pct */
      o2_pct?: number | null;
      /** O2 Measured Pct */
      o2_measured_pct?: number | null;
      /** He Pct */
      he_pct?: number | null;
      /** Pressure In Bar */
      pressure_in_bar?: number | null;
      /** Pressure Out Bar */
      pressure_out_bar?: number | null;
      /**
       * Role
       * @default back
       * @enum {string}
       */
      role?: 'back' | 'stage' | 'deco' | 'bailout';
    };
    /**
     * TankOut
     * @description The stored tank with its volume resolved from the preset or the text.
     */
    TankOut: {
      /** Cylinder */
      cylinder: string;
      /** Volume L */
      volume_l: number | null;
      /**
       * Gas
       * @default air
       * @enum {string}
       */
      gas: 'air' | 'nitrox' | 'trimix' | 'oxygen';
      /** O2 Pct */
      o2_pct: number | null;
      /** O2 Measured Pct */
      o2_measured_pct: number | null;
      /** He Pct */
      he_pct: number | null;
      /** Pressure In Bar */
      pressure_in_bar: number | null;
      /** Pressure Out Bar */
      pressure_out_bar: number | null;
      /**
       * Role
       * @default back
       * @enum {string}
       */
      role: 'back' | 'stage' | 'deco' | 'bailout';
    };
    /**
     * TimelineDive
     * @description The latest public dive, for the front-page link.
     */
    TimelineDive: {
      /** Number */
      number: number;
      /**
       * Date
       * Format: date
       */
      date: string;
      /** Site */
      site: string | null;
    };
    /** TimelineYear */
    TimelineYear: {
      /** Year */
      year: number;
      /** Dives */
      dives: number;
    };
    /** TripBuddy */
    TripBuddy: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Avatar Url */
      avatar_url: string | null;
      /** Dives */
      dives: number;
    };
    /**
     * TripDetail
     * @description A trip page: the trip, its dives in date order and the sites for its map.
     */
    TripDetail: {
      trip: components['schemas']['TripSummary'];
      /** Dives */
      dives: components['schemas']['DiveListItem'][];
      /** Map Sites */
      map_sites: components['schemas']['MapSite'][];
    };
    /** TripIn */
    TripIn: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Start Date */
      start_date?: string | null;
      /** End Date */
      end_date?: string | null;
      /**
       * Description Md
       * @default
       */
      description_md?: string;
    };
    /**
     * TripOut
     * @description A trip as a dive page shows it; ``day_index`` is the day of the trip the dive fell on.
     */
    TripOut: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /** Start Date */
      start_date: string | null;
      /** End Date */
      end_date: string | null;
      /** Description Md */
      description_md: string;
      /** Day Index */
      day_index: number | null;
      /** Days */
      days: number | null;
      /**
       * Custom
       * @default false
       */
      custom: boolean;
      /**
       * Description Html
       * @description The trip description as sanitised HTML.
       */
      readonly description_html: string;
    };
    /**
     * TripRef
     * @description The trip a row of the log belongs to.
     */
    TripRef: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
    };
    /** TripRegion */
    TripRegion: {
      /** Id */
      id: string;
      /** Name */
      name: string;
    };
    /** TripStats */
    TripStats: {
      /** Dives */
      dives: number;
      /** Minutes */
      minutes: number;
      /** Max Depth M */
      max_depth_m: number | null;
      /** Sites */
      sites: number;
    };
    /**
     * TripSummary
     * @description A trip card, and the head of a trip page; everything counted over visible dives.
     */
    TripSummary: {
      /** Id */
      id: string;
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /**
       * Start Date
       * Format: date
       */
      start_date: string;
      /**
       * End Date
       * Format: date
       */
      end_date: string;
      /** Days */
      days: number;
      /** Countries */
      countries: components['schemas']['CountryStat'][];
      /** Regions */
      regions: components['schemas']['TripRegion'][];
      /** Site Ids */
      site_ids: string[];
      /** Dive Numbers */
      dive_numbers: number[];
      stats: components['schemas']['TripStats'];
      /** Buddies */
      buddies: components['schemas']['TripBuddy'][];
      /**
       * Description Md
       * @default
       */
      description_md: string;
      /** Cover Url */
      cover_url: string | null;
      /**
       * Description Html
       * @description The trip description as sanitised HTML.
       */
      readonly description_html: string;
    };
    /**
     * TripTogether
     * @description A trip a buddy was on, with the number of dives we made together on it.
     */
    TripTogether: {
      /** Slug */
      slug: string;
      /** Name */
      name: string;
      /**
       * Start Date
       * Format: date
       */
      start_date: string;
      /**
       * End Date
       * Format: date
       */
      end_date: string;
      /** Dives */
      dives: number;
    };
    /** ValidationError */
    ValidationError: {
      /** Location */
      loc: (string | number)[];
      /** Message */
      msg: string;
      /** Error Type */
      type: string;
      /** Input */
      input?: unknown;
      /** Context */
      ctx?: Record<string, never>;
    };
    /** YearStat */
    YearStat: {
      /** Year */
      year: number;
      /** Dives */
      dives: number;
      /** Minutes */
      minutes: number;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  version_api_v1_version_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: string;
          };
        };
      };
    };
  };
  dive_stats_api_v1_dive_stats_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveStats'];
        };
      };
    };
  };
  dive_summary_api_v1_dive_summary_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveSummary'];
        };
      };
    };
  };
  dive_timeline_api_v1_dive_timeline_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveTimeline'];
        };
      };
    };
  };
  list_dives_api_v1_dive_dives_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveEnvelope'];
        };
      };
    };
  };
  get_dive_api_v1_dive_dives__number__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_sites_api_v1_dive_sites_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteOut'][];
        };
      };
    };
  };
  get_site_api_v1_dive_sites__slug__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_regions_api_v1_dive_regions_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RegionOut'][];
        };
      };
    };
  };
  get_region_api_v1_dive_regions__region_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        region_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RegionOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_trips_api_v1_dive_trips_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TripSummary'][];
        };
      };
    };
  };
  get_trip_api_v1_dive_trips__slug__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TripDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_people_api_v1_dive_people_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PersonOut'][];
        };
      };
    };
  };
  get_person_api_v1_dive_people__slug__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PersonDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  gear_api_v1_dive_gear_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GearPage'];
        };
      };
    };
  };
  magic_link_api_v1_auth_magic_link_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['MagicLinkRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: string;
          };
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  verify_api_v1_auth_verify_get: {
    parameters: {
      query: {
        token: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  me_api_v1_auth_me_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Me'];
        };
      };
    };
  };
  logout_api_v1_auth_logout_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  admin_list_dives_api_v1_admin_dives_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminDiveListItem'][];
        };
      };
    };
  };
  admin_create_dive_api_v1_admin_dives_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DiveIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveAdminOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_next_number_api_v1_admin_dives_next_number_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NextDiveNumber'];
        };
      };
    };
  };
  admin_get_dive_api_v1_admin_dives__number__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveAdminOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_dive_api_v1_admin_dives__number__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DiveIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DiveAdminOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_dive_api_v1_admin_dives__number__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_upload_attachment_api_v1_admin_dives__number__attachments_post: {
    parameters: {
      query?: {
        kind?: string;
        public?: boolean | null;
      };
      header?: never;
      path: {
        number: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_admin_upload_attachment_api_v1_admin_dives__number__attachments_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AttachmentOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_upload_site_attachment_api_v1_admin_sites__site_id__attachments_post: {
    parameters: {
      query?: {
        kind?: string;
        public?: boolean;
      };
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_admin_upload_site_attachment_api_v1_admin_sites__site_id__attachments_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AttachmentOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_upload_avatar_api_v1_admin_people__person_id__avatar_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        person_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_admin_upload_avatar_api_v1_admin_people__person_id__avatar_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AttachmentOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_upload_gear_photo_api_v1_admin_gear_items__item_id__photo_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        item_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_admin_upload_gear_photo_api_v1_admin_gear_items__item_id__photo_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AttachmentOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_attachment_api_v1_admin_attachments__media_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        media_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_patch_attachment_api_v1_admin_attachments__media_id__patch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        media_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AttachmentPatch'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AttachmentOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_sites_api_v1_admin_sites_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteOut'][];
        };
      };
    };
  };
  admin_create_site_api_v1_admin_sites_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SiteIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_get_site_api_v1_admin_sites__site_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_site_api_v1_admin_sites__site_id__put: {
    parameters: {
      query?: {
        fork?: boolean;
      };
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SiteIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_site_api_v1_admin_sites__site_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_patch_site_api_v1_admin_sites__site_id__patch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SitePatch'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_pin_site_api_v1_admin_sites__site_id__pin_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_create_map_api_v1_admin_sites__site_id__maps_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SiteMapIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteMapOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_map_api_v1_admin_maps__map_id__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        map_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SiteMapIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteMapOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_map_api_v1_admin_maps__map_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        map_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_order_maps_api_v1_admin_sites__site_id__maps_order_put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        site_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': string[];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SiteMapOut'][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_trips_api_v1_admin_trips_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TripOut'][];
        };
      };
    };
  };
  admin_create_trip_api_v1_admin_trips_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TripIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TripOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_get_trip_api_v1_admin_trips__slug__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TripOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_trip_api_v1_admin_trips__slug__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TripIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TripOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_trip_api_v1_admin_trips__slug__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_regions_api_v1_admin_regions_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RegionOut'][];
        };
      };
    };
  };
  admin_create_region_api_v1_admin_regions_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RegionIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RegionOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_region_api_v1_admin_regions__region_id__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        region_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RegionIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RegionOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_region_api_v1_admin_regions__region_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        region_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_people_api_v1_admin_people_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PersonPrivate'][];
        };
      };
    };
  };
  admin_create_person_api_v1_admin_people_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PersonIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PersonPrivate'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_get_person_api_v1_admin_people__person_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        person_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PersonPrivate'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_person_api_v1_admin_people__person_id__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        person_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PersonIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PersonPrivate'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_person_api_v1_admin_people__person_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        person_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_gear_items_api_v1_admin_gear_items_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GearItemOut'][];
        };
      };
    };
  };
  admin_create_gear_item_api_v1_admin_gear_items_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GearItemIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GearItemOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_gear_item_api_v1_admin_gear_items__item_id__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        item_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GearItemIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GearItemOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_gear_item_api_v1_admin_gear_items__item_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        item_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_gear_setups_api_v1_admin_gear_setups_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GearSetupOut'][];
        };
      };
    };
  };
  admin_create_gear_setup_api_v1_admin_gear_setups_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GearSetupIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GearSetupOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_update_gear_setup_api_v1_admin_gear_setups__setup_id__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        setup_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GearSetupIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GearSetupOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_delete_gear_setup_api_v1_admin_gear_setups__setup_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        setup_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_repo_status_api_v1_admin_repo_status_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RepoStatus'];
        };
      };
    };
  };
  admin_repo_push_api_v1_admin_repo_push_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RepoStatus'];
        };
      };
    };
  };
  admin_repo_pull_api_v1_admin_repo_pull_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RepoStatus'];
        };
      };
    };
  };
  admin_repo_reload_api_v1_admin_repo_reload_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RepoStatus'];
        };
      };
    };
  };
  admin_import_subsurface_api_v1_admin_import_subsurface_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_admin_import_subsurface_api_v1_admin_import_subsurface_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportResult'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_import_shearwater_api_v1_admin_import_shearwater_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_admin_import_shearwater_api_v1_admin_import_shearwater_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportResult'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  admin_imports_api_v1_admin_imports_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportRecordOut'][];
        };
      };
    };
  };
  health_health_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
}
