<script lang="ts">
  import { untrack } from 'svelte';
  import type { AdminDataFor } from '../admin';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import {
    PAGE_SIZE,
    ariaSort,
    listSearch,
    pagePath,
    toggleSort,
    type DiveListQuery,
    type DiveSortKey,
    type DiveStatus,
  } from '$lib/core/admin/dive-list';
  import type { AdminDivePage, AdminDiveRow, DivesPublishOut } from '$lib/core/dive/types';
  import { formatDate } from '$lib/core/dive/format';
  import { getDivelog } from '$lib/core/dive/context';
  import { announce } from '$lib/core/ui/announce.js';
  import { toast } from '$lib/components/stores/toast.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'dives'> } = $props();

  const STATUSES: { value: DiveStatus | null; label: string }[] = [
    { value: null, label: 'All' },
    { value: 'public', label: 'Public' },
    { value: 'draft', label: 'Drafts' },
    { value: 'private', label: 'Private' },
  ];

  const SORTS: Record<'before' | 'after', { sort: DiveSortKey; label: string }[]> = {
    before: [
      { sort: 'number', label: '#' },
      { sort: 'date', label: 'Date' },
    ],
    after: [
      { sort: 'depth', label: 'Depth' },
      { sort: 'duration', label: 'Time' },
    ],
  };

  const key = $derived(listSearch(data.query));
  let more = $state<{ key: string; rows: AdminDiveRow[] }>({ key: '', rows: [] });
  const rows = $derived(more.key === key ? [...data.rows, ...more.rows] : data.rows);
  let loadingMore = $state(false);
  let q = $state(untrack(() => data.query.q));
  let selected = $state<number[]>([]);
  let publishing = $state(false);

  const filtered = $derived(!!data.query.q || data.query.status !== null);
  const draftRows = $derived(rows.filter((r) => r.visibility === 'draft'));
  const selectedDrafts = $derived(selected.filter((n) => draftRows.some((r) => r.number === n)));
  const allDraftsSelected = $derived(
    draftRows.length > 0 && draftRows.every((r) => selected.includes(r.number)),
  );

  function navigate(query: DiveListQuery) {
    selected = [];
    void goto(`${page.url.pathname}${listSearch(query)}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (q.trim() !== data.query.q) navigate({ ...data.query, q: q.trim() });
    }, 300);
  }

  function searchNow(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    navigate({ ...data.query, q: q.trim() });
  }

  async function showMore() {
    loadingMore = true;
    try {
      const next = await adminJson<AdminDivePage>(pagePath(data.query, rows.length, PAGE_SIZE));
      more = { key, rows: [...(more.key === key ? more.rows : []), ...next.items] };
      announce(`Showing ${rows.length} of ${data.total} dives`);
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not load more dives',
      });
    } finally {
      loadingMore = false;
    }
  }

  function toggleRow(number: number, on: boolean) {
    selected = on ? [...selected, number] : selected.filter((n) => n !== number);
  }

  function toggleAll(on: boolean) {
    selected = on ? draftRows.map((r) => r.number) : [];
  }

  async function publishSelected() {
    if (!selectedDrafts.length) return;
    publishing = true;
    try {
      const out = await adminJson<DivesPublishOut>(adminApi('dives', 'publish'), 'POST', {
        numbers: selectedDrafts,
      });
      selected = [];
      const n = out.published.length;
      toast.show({ kind: 'success', message: `${n} dive${n === 1 ? '' : 's'} published` });
      await invalidateAll();
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Publishing failed',
      });
    } finally {
      publishing = false;
    }
  }

  const arrow = (sort: DiveSortKey) =>
    data.query.sort === sort ? (data.query.asc ? '▲' : '▼') : '';
</script>

<div class="head">
  <h1>
    Dives <span class="count dl-num">{data.total}</span>{#if data.drafts}<a
        class="drafts"
        href={urls.admin.dives({ status: 'draft' })}
        >{data.drafts} draft{data.drafts === 1 ? '' : 's'}</a
      >{/if}
  </h1>
  <a class="dl-btn dl-btn-solid dl-btn-sm" href={urls.admin.newDive()}>New dive</a>
</div>

<div class="toolbar">
  <Field label="Search dives" id="dl-dives-q" class="search">
    {#snippet children(c)}
      <input
        {...c}
        type="search"
        placeholder="Number, title, site or buddy"
        bind:value={q}
        oninput={onSearch}
        onkeydown={searchNow}
      />
    {/snippet}
  </Field>
  <div class="statuses" role="group" aria-label="Status">
    {#each STATUSES as s (s.label)}
      <button
        type="button"
        class="dl-tag chip"
        aria-pressed={data.query.status === s.value}
        onclick={() => navigate({ ...data.query, status: s.value })}
        >{s.label}{#if s.value === 'draft' && data.drafts}<span class="dl-num">
            {data.drafts}</span
          >{/if}</button
      >
    {/each}
  </div>
</div>

<p class="summary" role="status">
  {#if data.total}Showing {rows.length} of {data.total} dive{data.total === 1 ? '' : 's'}{/if}
</p>

{#if draftRows.length}
  <div class="bulk">
    <button
      type="button"
      class="dl-btn dl-btn-ghost dl-btn-sm"
      disabled={!selectedDrafts.length || publishing}
      onclick={publishSelected}
      >{publishing
        ? 'Publishing…'
        : `Publish selected drafts${selectedDrafts.length ? ` (${selectedDrafts.length})` : ''}`}</button
    >
  </div>
{/if}

{#if !data.total}
  <div class="empty dl-card">
    {#if filtered}
      <p>No dives match these filters.</p>
      <a class="dl-btn dl-btn-ghost dl-btn-sm" href={urls.admin.dives()}>Clear the filters</a>
    {:else}
      <p>No dives logged yet.</p>
      <a class="dl-btn dl-btn-solid dl-btn-sm" href={urls.admin.newDive()}>Log your first dive</a>
    {/if}
  </div>
{:else}
  <div class="table-wrap">
    <table>
      <caption class="dl-visually-hidden">Dives</caption>
      <thead>
        <tr>
          <th scope="col" class="pick">
            {#if draftRows.length}
              <input
                type="checkbox"
                aria-label="Select every draft shown"
                checked={allDraftsSelected}
                onchange={(e) => toggleAll(e.currentTarget.checked)}
              />
            {/if}
          </th>
          {#each SORTS.before as col (col.sort)}
            <th scope="col" aria-sort={ariaSort(data.query, col.sort)}>
              <button
                type="button"
                class="sort"
                onclick={() => navigate(toggleSort(data.query, col.sort))}
                >{col.label}<span aria-hidden="true" class="arrow">{arrow(col.sort)}</span></button
              >
            </th>
          {/each}
          <th scope="col">Title / site</th>
          {#each SORTS.after as col (col.sort)}
            <th scope="col" aria-sort={ariaSort(data.query, col.sort)}>
              <button
                type="button"
                class="sort"
                onclick={() => navigate(toggleSort(data.query, col.sort))}
                >{col.label}<span aria-hidden="true" class="arrow">{arrow(col.sort)}</span></button
              >
            </th>
          {/each}
          <th scope="col">Tags</th>
          <th scope="col">Media</th>
          <th scope="col">Status</th>
          <th scope="col"><span class="dl-visually-hidden">Public page</span></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as dive (dive.number)}
          {@const siteLink = !!(dive.title && dive.site_name && dive.site_id)}
          <tr>
            <td class="pick" class:blank={dive.visibility !== 'draft'}>
              {#if dive.visibility === 'draft'}
                <input
                  type="checkbox"
                  aria-label="Select draft #{dive.number}"
                  checked={selected.includes(dive.number)}
                  onchange={(e) => toggleRow(dive.number, e.currentTarget.checked)}
                />
              {/if}
            </td>
            <td class="dl-num">{dive.number}</td>
            <td class="dl-num nowrap">{formatDate(dive.date)}</td>
            <td class="title">
              <a class="row-link" href={urls.admin.dive(dive.number)}
                >{dive.title || dive.site_name || 'Untitled'}</a
              >
              {#if siteLink || dive.trip}
                <span class="secondary">
                  {#if siteLink && dive.site_id}<a href={urls.admin.site(dive.site_id)}
                      >{dive.site_name}</a
                    >{/if}{#if siteLink && dive.trip}<span class="sep" aria-hidden="true">·</span
                    >{/if}{#if dive.trip}<a href={urls.admin.trip(dive.trip.slug)}
                      >{dive.trip.name}</a
                    >{/if}
                </span>
              {/if}
            </td>
            <td class="dl-num nowrap">{dive.max_depth_m} m</td>
            <td class="dl-num nowrap">{dive.duration_min} min</td>
            <td class="tags">{dive.tags.join(', ')}</td>
            <td class="dl-num media">{dive.attachments || ''}</td>
            <td><span class="status status-{dive.visibility}">{dive.visibility}</span></td>
            <td
              ><a class="view" href={urls.dive(dive.number)} target="_blank" rel="noopener"
                >View<span class="dl-visually-hidden"> dive #{dive.number} (new tab)</span> ↗</a
              ></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if rows.length < data.total}
    <div class="more">
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        disabled={loadingMore}
        onclick={showMore}
        >{loadingMore
          ? 'Loading…'
          : `Show ${Math.min(PAGE_SIZE, data.total - rows.length)} more`}</button
      >
    </div>
  {/if}
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--dl-space-3);
    margin-bottom: var(--dl-space-3);
  }
  .head h1 {
    margin-bottom: 0;
  }
  .count {
    font-size: var(--dl-text-xl);
    color: var(--dl-color-text-faint);
    font-weight: 400;
  }
  .drafts {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-sm);
    font-weight: 400;
    color: var(--dl-color-warm);
    margin-left: 12px;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dl-space-3);
    align-items: flex-end;
    margin-bottom: var(--dl-space-2);
  }
  .toolbar :global(.search) {
    flex: 1 1 16rem;
    max-width: 26rem;
  }
  .statuses {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dl-space-2);
  }
  .chip {
    cursor: pointer;
    min-height: 32px;
  }
  .chip[aria-pressed='true'] {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-accent);
  }
  .summary {
    min-height: 1.4em;
    margin: 0 0 var(--dl-space-2);
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .bulk {
    margin-bottom: var(--dl-space-2);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--dl-space-2);
    padding: var(--dl-space-4);
  }
  .empty p {
    margin: 0;
  }
  .table-wrap {
    overflow-x: auto;
  }
  tbody tr {
    position: relative;
  }
  tbody tr:hover {
    background: var(--dl-color-surface);
  }
  .row-link,
  .secondary a,
  .view {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
  }
  .row-link::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .secondary,
  .pick input,
  .view {
    position: relative;
    z-index: 1;
  }
  .secondary {
    display: block;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
  }
  .sep {
    margin: 0 0.35em;
  }
  .secondary a {
    color: var(--dl-color-text-muted);
  }
  .nowrap,
  .view {
    white-space: nowrap;
  }
  .view {
    font-size: var(--dl-text-md);
  }
  .sort {
    background: none;
    border: none;
    padding: 0;
    min-height: 24px;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: inherit;
    cursor: pointer;
  }
  .arrow {
    margin-left: 4px;
  }
  .pick {
    width: 2rem;
  }
  .status {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--dl-color-surface-2);
  }
  .status-draft {
    color: var(--dl-color-warm);
  }
  .status-private {
    color: var(--dl-color-text-muted);
  }
  .status-public {
    color: var(--dl-color-success);
  }
  .more {
    margin-top: var(--dl-space-3);
  }
  @media (max-width: 700px) {
    table,
    tbody,
    tr,
    td {
      display: block;
    }
    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    tbody tr {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--dl-space-1) var(--dl-space-3);
      padding: var(--dl-space-2) 0;
      border-bottom: 1px solid var(--dl-color-border);
    }
    tbody td {
      padding: 0;
      border: none;
    }
    td.title {
      order: -1;
      flex-basis: 100%;
    }
    td.blank,
    td.tags,
    td.media {
      display: none;
    }
  }
</style>
