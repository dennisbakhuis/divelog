/**
 * The editor's dive list: its filter and sort as URL parameters, the API page request
 * they become, draft neighbours for the editor, and the import report's summary.
 */
import type { ImportReport } from './ux-api.js';

export const DIVE_STATUSES = ['public', 'draft', 'private'] as const;
export type DiveStatus = (typeof DIVE_STATUSES)[number];

export const DIVE_SORTS = ['date', 'number', 'depth', 'duration'] as const;
export type DiveSortKey = (typeof DIVE_SORTS)[number];

/** Rows per request; "Show more" asks for the next page of this size. */
export const PAGE_SIZE = 100;

export type DiveListQuery = {
  q: string;
  status: DiveStatus | null;
  sort: DiveSortKey;
  asc: boolean;
};

export const DEFAULT_LIST_QUERY: DiveListQuery = { q: '', status: null, sort: 'date', asc: false };

/** The list query in a URL's search parameters; unknown values fall back to the defaults. */
export function parseListQuery(params: URLSearchParams): DiveListQuery {
  const status = params.get('status');
  const sort = params.get('sort');
  return {
    q: (params.get('q') ?? '').trim(),
    status: (DIVE_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as DiveStatus)
      : null,
    sort: (DIVE_SORTS as readonly string[]).includes(sort ?? '') ? (sort as DiveSortKey) : 'date',
    asc: params.get('asc') === '1' || params.get('asc') === 'true',
  };
}

/** Search parameters for a list query, defaults left out so the plain list has a plain URL. */
export function listParams(query: DiveListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.status) params.set('status', query.status);
  if (query.sort !== 'date') params.set('sort', query.sort);
  if (query.asc) params.set('asc', '1');
  return params;
}

/** `?q=…&status=…` for the list URL, or '' for the defaults. */
export function listSearch(query: DiveListQuery): string {
  const text = listParams(query).toString();
  return text ? `?${text}` : '';
}

/** The API path of one page of the list: `/admin/dives/page?offset=…&limit=…&…`. */
export function pagePath(query: DiveListQuery, offset = 0, limit = PAGE_SIZE): string {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.status) params.set('status', query.status);
  params.set('sort', query.sort);
  params.set('asc', String(query.asc));
  return `/admin/dives/page?${params}`;
}

/**
 * The query after a click on a column header: the same column flips the direction, a new
 * one starts with the largest (latest, deepest, longest) first.
 */
export function toggleSort(query: DiveListQuery, sort: DiveSortKey): DiveListQuery {
  return query.sort === sort
    ? { ...query, asc: !query.asc }
    : { ...query, sort, asc: false };
}

/** `aria-sort` of a column header. */
export function ariaSort(
  query: DiveListQuery,
  sort: DiveSortKey,
): 'ascending' | 'descending' | 'none' {
  if (query.sort !== sort) return 'none';
  return query.asc ? 'ascending' : 'descending';
}

/** The drafts before and after `current` in a list of draft numbers in date order. */
export function draftNeighbours(
  drafts: readonly number[],
  current: number,
): { previous: number | null; next: number | null } {
  const i = drafts.indexOf(current);
  if (i < 0) return { previous: null, next: drafts[0] ?? null };
  return { previous: drafts[i - 1] ?? null, next: drafts[i + 1] ?? null };
}

/** `#12–#14, #20` style list of dive numbers, consecutive runs collapsed. */
export function numberRanges(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `#${sorted[i]}–#${sorted[j]}` : `#${sorted[i]}`);
    i = j;
  }
  return parts.join(', ');
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** One line per outcome of an import (or a dry run of one), for the import page. */
export function importLines(report: ImportReport): string[] {
  const dry = !!report.dry_run;
  const lines: string[] = [];
  if (report.dives_in_file) {
    const range =
      report.first_date && report.last_date
        ? report.first_date === report.last_date
          ? ` on ${report.first_date}`
          : ` from ${report.first_date} to ${report.last_date}`
        : '';
    lines.push(`${plural(report.dives_in_file, 'dive')} in the file${range}`);
  }
  lines.push(
    `${plural(report.created.length, 'new draft')} ${dry ? 'would be created' : 'created'}`,
  );
  lines.push(
    `${plural(report.updated.length, 'logged dive')} ${dry ? 'would get' : 'got'} a profile`,
  );
  if (report.skipped) lines.push(`${report.skipped} already imported, skipped`);
  const sitesCreated = report.sites_created;
  const sitesMatched = report.sites_matched ?? 0;
  if (sitesCreated || sitesMatched)
    lines.push(
      `${plural(sitesMatched, 'site')} matched, ${plural(sitesCreated, 'new site')}${
        dry ? ' to create' : ' created'
      }`,
    );
  return lines;
}
