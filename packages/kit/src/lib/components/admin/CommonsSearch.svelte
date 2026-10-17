<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import { canLocate, COARSE_FIX, LocateError, locateDevice } from '$lib/core/admin/geolocation';
  import type { CommonsSiteHit } from '$lib/core/dive/types';
  import { commonsSearchPath, splitHits } from '$lib/core/dive/sharing';
  import { formatDistance, type LatLon } from '$lib/core/map/coords';
  import { announce } from '$lib/core/ui/announce';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';

  let {
    query = $bindable(''),
    near = null,
    actionLabel = 'Use this site',
    onUse,
  }: {
    query?: string;
    /**
     * A point to search around, e.g. the dive's or the new site's position. Without one,
     * a "Near me" button offers the device location where the browser has geolocation.
     */
    near?: LatLon | null;
    actionLabel?: string;
    onUse: (hit: CommonsSiteHit) => void | Promise<void>;
  } = $props();

  let useNear = $state(false);
  let hits = $state<CommonsSiteHit[]>([]);
  let searched = $state(false);
  let loading = $state(false);
  let error = $state('');
  let here = $state<LatLon | null>(null);
  let locating = $state(false);
  let locateError = $state('');
  let nearBox = $state<HTMLInputElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const locatable = canLocate();
  const propsId = $props.id();
  const locateErrorId = `dl-commons-locate-${propsId}`;
  const centre = $derived(near ?? here);
  const nearLabel = $derived(
    near
      ? `within 25 km of ${near.lat.toFixed(3)}, ${near.lon.toFixed(3)}`
      : 'within 25 km of your location',
  );
  const split = $derived(splitHits(hits));
  const around = $derived(useNear && centre ? centre : null);

  async function locate() {
    if (locating) return;
    locating = true;
    locateError = '';
    try {
      here = await locateDevice(COARSE_FIX);
      useNear = true;
      announce('Searching the commons within 25 km of your location');
      await tick();
      nearBox?.focus();
    } catch (err) {
      locateError =
        err instanceof LocateError && err.reason === 'denied'
          ? 'Location access was refused; search by name instead.'
          : err instanceof LocateError
            ? err.message
            : 'Could not get the device location.';
    } finally {
      locating = false;
    }
  }

  async function run(q: string, point: LatLon | null) {
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
    {#if centre}
      <label class="near"
        ><input type="checkbox" bind:checked={useNear} bind:this={nearBox} /> {nearLabel}</label
      >
    {:else if locatable}
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm near-me"
        aria-disabled={locating ? 'true' : undefined}
        aria-describedby={locateError ? locateErrorId : undefined}
        onclick={locate}>{locating ? 'Locating…' : 'Near me'}</button
      >
    {/if}
  </div>
  {#if locateError}<p class="error" role="alert" id={locateErrorId}>{locateError}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if split.fresh.length}
    <ul class="hits">
      {#each split.fresh as hit (hit.id)}
        <li>
          <span class="name">
            {hit.name}
            <span class="muted"
              >{[
                hit.area,
                hit.country,
                hit.type,
                hit.distance_km !== null ? `${formatDistance(hit.distance_km * 1000)} away` : '',
              ]
                .filter(Boolean)
                .join(' · ')}</span
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
  .near-me {
    flex: none;
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
