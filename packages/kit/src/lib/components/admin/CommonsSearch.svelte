<script lang="ts">
  import { onDestroy } from 'svelte';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import type { CommonsSiteHit } from '$lib/core/dive/types';
  import { commonsSearchPath, splitHits } from '$lib/core/dive/sharing';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';

  let {
    query = $bindable(''),
    near = null,
    actionLabel = 'Use this site',
    onUse,
  }: {
    query?: string;
    /** A point to search around, e.g. the dive's or the new site's position. */
    near?: { lat: number; lon: number } | null;
    actionLabel?: string;
    onUse: (hit: CommonsSiteHit) => void | Promise<void>;
  } = $props();

  let useNear = $state(false);
  let hits = $state<CommonsSiteHit[]>([]);
  let searched = $state(false);
  let loading = $state(false);
  let error = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const split = $derived(splitHits(hits));
  const around = $derived(useNear && near ? near : null);

  async function run(q: string, point: { lat: number; lon: number } | null) {
    const mine = ++seq;
    if (!q.trim() && !point) {
      hits = [];
      searched = false;
      return;
    }
    loading = true;
    error = '';
    try {
      const found = await adminJson<CommonsSiteHit[]>(
        `${adminApi('commons', 'sites')}${commonsSearchPath(q, point)}`,
      );
      if (mine !== seq) return;
      hits = found;
      searched = true;
    } catch (err) {
      if (mine !== seq) return;
      hits = [];
      error = err instanceof AdminApiError ? err.message : 'Search failed';
    } finally {
      if (mine === seq) loading = false;
    }
  }

  $effect(() => {
    const q = query;
    const point = around;
    clearTimeout(timer);
    timer = setTimeout(() => void run(q, point), 250);
  });

  onDestroy(() => clearTimeout(timer));
</script>

<div class="commons-search">
  <div class="bar">
    <input
      type="search"
      placeholder="Search the commons by name, alias or area…"
      aria-label="Search the commons"
      bind:value={query}
    />
    {#if near}
      <label class="near"
        ><input type="checkbox" bind:checked={useNear} /> within 25 km of {near.lat.toFixed(3)},
        {near.lon.toFixed(3)}</label
      >
    {/if}
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  {#if split.fresh.length}
    <ul class="hits">
      {#each split.fresh as hit (hit.id)}
        <li>
          <span class="name">
            {hit.name}
            <span class="muted"
              >{[hit.area, hit.country, hit.type].filter(Boolean).join(' · ')}{hit.distance_km !==
              null
                ? ` · ${hit.distance_km.toFixed(1)} km`
                : ''}</span
            >
          </span>
          <OriginBadge origin={hit.origin} />
          <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => onUse(hit)}
            >{actionLabel}</button
          >
        </li>
      {/each}
    </ul>
  {:else if searched && !loading}
    <p class="muted">No commons site matches that is not in your log yet.</p>
  {/if}
  {#if split.known.length}
    <p class="muted known">
      Already in your log: {split.known.map((h) => h.name).join(', ')}
    </p>
  {/if}
</div>

<style>
  .commons-search {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bar {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .bar input[type='search'] {
    flex: 1;
    min-width: 220px;
  }
  .near {
    font-size: 13px;
    color: var(--dl-color-text-muted);
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .hits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .hits li {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 8px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius-sm);
  }
  .name {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 13px;
    margin: 0;
  }
  .error {
    color: var(--dl-color-error);
    font-size: 14px;
    margin: 0;
  }
</style>
