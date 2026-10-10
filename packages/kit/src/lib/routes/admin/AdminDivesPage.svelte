<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { formatDate } from '$lib/core/dive/format';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'dives'> } = $props();
  let query = $state('');
  let show = $state<'all' | 'public' | 'draft' | 'private'>('all');

  const rows = $derived(
    data.dives.filter((d) => {
      if (show !== 'all' && d.visibility !== show) return false;
      const q = query.toLowerCase();
      return (
        !q || `${d.number} ${d.title} ${d.site_name ?? ''} ${d.date}`.toLowerCase().includes(q)
      );
    }),
  );
  const drafts = $derived(data.dives.filter((d) => d.visibility === 'draft').length);
</script>

<h1>
  Dives <span class="count dl-num">{data.dives.length}</span>{#if drafts}<span class="drafts"
      >{drafts} draft{drafts === 1 ? '' : 's'}</span
    >{/if}
</h1>

<div class="toolbar">
  <input type="search" placeholder="Filter…" aria-label="Filter dives" bind:value={query} />
  <select bind:value={show} aria-label="Show">
    <option value="all">All</option>
    <option value="public">Public</option>
    <option value="draft">Drafts{drafts ? ` (${drafts})` : ''}</option>
    <option value="private">Private</option>
  </select>
</div>

<table>
  <thead>
    <tr
      ><th>#</th><th>Date</th><th>Title / site</th><th>Depth</th><th>Time</th><th>Tags</th><th
        >Media</th
      ><th>Status</th><th></th></tr
    >
  </thead>
  <tbody>
    {#each rows as dive (dive.number)}
      <tr>
        <td class="dl-num">{dive.number}</td>
        <td class="dl-num">{formatDate(dive.date)}</td>
        <td
          ><a href={urls.admin.dive(dive.number)}>{dive.title || dive.site_name || 'Untitled'}</a
          >{#if dive.title && dive.site_name}<span class="muted"> · {dive.site_name}</span>{/if}</td
        >
        <td class="dl-num">{dive.max_depth_m} m</td>
        <td class="dl-num">{dive.duration_min} min</td>
        <td>{dive.tags.join(', ')}</td>
        <td class="dl-num">{dive.attachments || ''}</td>
        <td><span class="status status-{dive.visibility}">{dive.visibility}</span></td>
        <td
          ><a class="view" href={urls.dive(dive.number)} target="_blank" rel="noopener">view ↗</a
          ></td
        >
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .count {
    font-size: 16px;
    color: var(--dl-color-text-faint);
    font-weight: 400;
  }
  .drafts {
    font-family: var(--dl-font-mono);
    font-size: 12px;
    font-weight: 400;
    color: var(--dl-color-warm);
    margin-left: 12px;
  }
  .view {
    font-size: 13px;
    white-space: nowrap;
  }
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    align-items: center;
  }
  .toolbar input {
    max-width: 320px;
  }
  .toolbar select {
    width: auto;
  }
  .muted {
    color: var(--dl-color-text-faint);
  }
  .status {
    font-family: var(--dl-font-mono);
    font-size: 11px;
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
</style>
