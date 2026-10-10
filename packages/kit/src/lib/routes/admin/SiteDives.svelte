<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import type { components } from '$lib/core/dive/api';
  import type { Site } from '$lib/core/dive/types';
  import { formatDate } from '$lib/core/dive/format';
  import { getDivelog } from '$lib/core/dive/context';

  type DivePage = components['schemas']['AdminDivePage'];
  type DiveRow = components['schemas']['AdminDiveRow'];

  const { urls } = getDivelog();

  let { site }: { site: Site } = $props();

  let rows = $state<DiveRow[] | null>(null);
  let error = $state('');

  const newDiveHref = $derived(urls.admin.newDive({ site: site.id }));

  onMount(async () => {
    try {
      const params = new URLSearchParams({ q: site.name, limit: '1000', sort: 'date' });
      const page = await adminJson<DivePage>(`${adminApi('dives', 'page')}?${params}`);
      rows = page.items.filter((d) => d.site_id === site.id);
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Could not load the dives';
      rows = [];
    }
  });
</script>

<section class="site-dives" aria-labelledby="site-dives-title">
  <div class="head">
    <h2 id="site-dives-title">
      Dives here {#if rows}<span class="count dl-num">{rows.length}</span>{/if}
    </h2>
    <a class="dl-btn dl-btn-solid" href={newDiveHref}>Log a dive here</a>
  </div>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if rows === null}
    <p class="muted" aria-live="polite">Loading…</p>
  {:else if rows.length}
    <ul>
      {#each rows as dive (dive.number)}
        <li>
          <a href={urls.admin.dive(dive.number)}>
            <span class="dl-num">#{dive.number}</span>
            <span class="dl-num date">{formatDate(dive.date)}</span>
            <span class="title">{dive.title || site.name}</span>
          </a>
          <span class="muted dl-num">{dive.max_depth_m} m · {dive.duration_min} min</span>
          {#if dive.visibility !== 'public'}<span class="chip">{dive.visibility}</span>{/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">No dives logged here yet.</p>
  {/if}
</section>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--dl-space-3);
    margin-bottom: var(--dl-space-3);
  }
  h2 {
    margin: 0;
    font-size: var(--dl-text-xl);
  }
  .count {
    margin-left: 6px;
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-md);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-1);
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-2) var(--dl-space-3);
    padding: var(--dl-space-2) var(--dl-space-3);
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  li a {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--dl-space-3);
    min-height: 24px;
    align-items: center;
    flex: 1 1 260px;
  }
  .date {
    color: var(--dl-color-text-muted);
  }
  .title {
    font-weight: 500;
  }
  .chip {
    font-size: var(--dl-text-xs);
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-warm);
    color: var(--dl-color-warm);
  }
  .muted {
    margin: 0;
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-sm);
  }
  .error {
    color: var(--dl-color-danger);
  }
</style>
