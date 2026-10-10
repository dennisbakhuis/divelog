/**
 * Option filtering, grouping and keyboard movement for `Combobox`. Kept out
 * of the component so it loads in Node and is covered by unit tests.
 */

/** One choice of a combobox. */
export interface ComboOption {
  value: string;
  label: string;
  /** Heading the option is listed under ("Recent", "All", "Commons"…); groups keep first-seen order. */
  group?: string;
  /** A second, muted line (country, date, dive count). */
  hint?: string;
  /** Extra words the type-ahead matches on (aliases, ids). */
  keywords?: string;
  disabled?: boolean;
}

export interface ComboGroup {
  group: string;
  options: ComboOption[];
}

/** Lower case without diacritics, so "cenote" matches "Cénote". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Options whose label, hint or keywords contain every word of the query. */
export function filterOptions(options: readonly ComboOption[], query: string): ComboOption[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...options];
  return options.filter((o) => {
    const haystack = normalizeText(`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''} ${o.value}`);
    return words.every((w) => haystack.includes(w));
  });
}

/**
 * Group options by `group`, in order of first appearance; options without a
 * group come first under the empty heading.
 */
export function groupOptions(options: readonly ComboOption[]): ComboGroup[] {
  const groups = new Map<string, ComboOption[]>();
  for (const o of options) {
    const key = o.group ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  const ordered = [...groups.entries()].map(([group, opts]) => ({ group, options: opts }));
  return ordered.sort((a, b) => (a.group === '' ? -1 : b.group === '' ? 1 : 0));
}

/** The options in the order the listbox shows them (grouped), for keyboard movement. */
export function flattenGroups(groups: readonly ComboGroup[]): ComboOption[] {
  return groups.flatMap((g) => g.options);
}

/** Drop repeated values, keeping the first occurrence. */
export function uniqueOptions(options: readonly ComboOption[]): ComboOption[] {
  const seen = new Set<string>();
  return options.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
}

export type ComboKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/**
 * The next active index for a navigation key, skipping disabled options and
 * wrapping around. `-1` means nothing active (and stays so for an empty list).
 */
export function moveActive(options: readonly ComboOption[], index: number, key: ComboKey): number {
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  if (!enabled.length) return -1;
  if (key === 'Home') return enabled[0];
  if (key === 'End') return enabled[enabled.length - 1];
  const at = enabled.indexOf(index);
  if (key === 'ArrowDown') return at < 0 ? enabled[0] : enabled[(at + 1) % enabled.length];
  return at < 0 ? enabled[enabled.length - 1] : enabled[(at - 1 + enabled.length) % enabled.length];
}
