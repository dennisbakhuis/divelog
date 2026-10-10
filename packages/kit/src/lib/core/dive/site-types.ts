/**
 * The one list of dive site types the editor offers, with the water each type
 * usually holds. The site form, the new-site form and the dive editor's quick
 * create all read it; a type outside the list stays valid (the API takes any
 * string), it just has no water default.
 */

export type SiteWater = 'salt' | 'fresh' | 'brackish';

export interface SiteTypeDef {
  /** The value stored on the site (`type`). */
  id: string;
  /** What the select shows. */
  label: string;
  /** The water a new site of this type starts with; editable. */
  water: SiteWater;
}

/** Ordered by how often a log meets them: open water first, then inland, then overhead. */
export const SITE_TYPES: readonly SiteTypeDef[] = [
  { id: 'sea', label: 'Sea', water: 'salt' },
  { id: 'reef', label: 'Reef', water: 'salt' },
  { id: 'wreck', label: 'Wreck', water: 'salt' },
  { id: 'reef with wrecks', label: 'Reef with wrecks', water: 'salt' },
  { id: 'lake', label: 'Lake', water: 'fresh' },
  { id: 'quarry lake', label: 'Quarry lake', water: 'fresh' },
  { id: 'reservoir', label: 'Reservoir', water: 'fresh' },
  { id: 'river', label: 'River', water: 'fresh' },
  { id: 'cave', label: 'Cave', water: 'fresh' },
  { id: 'cavern', label: 'Cavern', water: 'fresh' },
  { id: 'cenote', label: 'Cenote', water: 'fresh' },
  { id: 'mine', label: 'Mine', water: 'fresh' },
  { id: 'pool', label: 'Pool', water: 'fresh' },
  { id: 'indoor dive tower', label: 'Indoor dive tower', water: 'fresh' },
];

/** The type a new site starts as. */
export const DEFAULT_SITE_TYPE = 'sea';

/** The definition of a type, matched without regard to case or surrounding space. */
export function siteType(id: string | null | undefined): SiteTypeDef | null {
  const key = (id ?? '').trim().toLowerCase();
  return SITE_TYPES.find((t) => t.id === key) ?? null;
}

/** The water a site of this type usually lies in, or null for a type outside the list. */
export function waterDefault(id: string | null | undefined): SiteWater | null {
  return siteType(id)?.water ?? null;
}

/**
 * The options for a type select: the list, plus `current` at the end when a site
 * carries a type the list does not know, so editing never drops it.
 */
export function siteTypeOptions(current?: string | null): readonly SiteTypeDef[] {
  const value = (current ?? '').trim();
  if (!value || siteType(value)) return SITE_TYPES;
  return [...SITE_TYPES, { id: value, label: value, water: 'salt' }];
}
