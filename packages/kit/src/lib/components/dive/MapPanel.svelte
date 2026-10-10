<script lang="ts">
  import MapLegend from './MapLegend.svelte';
  import SiteMapView from './SiteMapView.svelte';
  import type { MapRef, SiteDiveRoute } from '$lib/core/dive/types';
  import { formatDate } from '$lib/core/dive/format';
  import { defaultTitle, mapSummary, normalizeSiteMap, routeKeys } from '$lib/core/dive/sitemap';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let {
    maps,
    siteName,
    owner = false,
    defaultRef = null,
    routes = [],
  }: {
    maps: MapRef[];
    siteName: string;
    owner?: boolean;
    defaultRef?: string | null;
    /** Logged dives with a route on one of the drawn maps. */
    routes?: SiteDiveRoute[];
  } = $props();

  let current = $state(0);
  const active = $derived(maps[Math.min(current, maps.length - 1)]);
  const drawn = $derived(active?.drawn ? normalizeSiteMap(active.drawn) : null);

  // Which dive's route to overlay: every dive together (the lines ever dived), one dive, or none.
  let shown = $state<'all' | 'none' | number>('all');
  const dived = $derived(
    active?.drawn ? routes.filter((r) => r.annotation.map_id === active.drawn?.id) : [],
  );
  const selected = $derived(
    typeof shown === 'number' ? dived.find((r) => r.number === shown) : undefined,
  );
  const routeSet = $derived.by(() => {
    if (!dived.length || shown === 'none') return null;
    if (selected) return routeKeys(selected.annotation);
    return new Set(dived.flatMap((r) => [...routeKeys(r.annotation)]));
  });

  const LABEL: Record<MapRef['collection'], string> = {
    drawn: 'Drawn',
    seed: 'Sketch',
    reference: 'Reference',
  };
</script>

{#if maps.length}
  <section class="panel dl-card">
    {#if maps.length > 1 || owner}
      <div class="tabs" role="tablist">
        {#each maps as m, i (m.ref)}
          <button
            type="button"
            role="tab"
            aria-selected={i === current}
            class:active={i === current}
            class:private={!m.public}
            onclick={() => (current = i)}
          >
            <span class="coll">{LABEL[m.collection]}</span>
            {m.title}
            {#if defaultRef === m.ref}<span class="star" title="Shown first">★</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if active}
      {#if !active.public}
        <p class="warning">
          <strong>Not for publication.</strong>
          {active.warning ?? 'Third-party map kept for reference; only you can see it.'}
          {#if active.credit}<span class="credit">Source: {active.credit}</span>{/if}
        </p>
      {/if}
      {#if active.collection === 'drawn' && drawn}
        {#if dived.length}
          <div class="tabs dives" role="group" aria-label="Dives on this map">
            <button
              type="button"
              class:active={shown === 'all' || (typeof shown === 'number' && !selected)}
              onclick={() => (shown = 'all')}>All dived lines</button
            >
            {#each dived as r (r.number)}
              <button
                type="button"
                class:active={selected?.number === r.number}
                title={r.title}
                onclick={() => (shown = r.number)}>{formatDate(r.date)} · #{r.number}</button
              >
            {/each}
            <button type="button" class:active={shown === 'none'} onclick={() => (shown = 'none')}
              >Map only</button
            >
            {#if selected}<a class="open" href={urls.dive(selected.number)}>open dive ↗</a>{/if}
          </div>
        {/if}
        <SiteMapView
          map={drawn}
          title="{active.title} of {siteName}"
          route={routeSet}
          legs={selected?.annotation.route ?? []}
          path={selected?.annotation.path ?? []}
          pathTurn={selected?.annotation.turn_at ?? null}
          turn={selected?.annotation.turn ?? null}
          pins={selected?.annotation.pins ?? []}
        />
        {#if selected?.annotation.note}<p class="muted">{selected.annotation.note}</p>{/if}
        <div class="foot">
          <MapLegend map={drawn} />
          <span class="muted dl-num">{defaultTitle(drawn.kind)} · {mapSummary(drawn)}</span>
        </div>
        {#if drawn.notes}<p class="muted">{drawn.notes}</p>{/if}
      {:else if active.url}
        <figure class="image" class:reference={active.collection === 'reference'}>
          <img src={active.url} alt="{active.title} of {siteName}" loading="lazy" />
          {#if active.credit}<figcaption>{active.credit}</figcaption>{/if}
        </figure>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .panel {
    padding: 10px;
    background: var(--dl-color-bg-elevated);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tabs button {
    background: none;
    border: 1px solid var(--dl-color-border);
    border-radius: 999px;
    padding: 5px 12px;
    color: var(--dl-color-text-muted);
    font-size: 13px;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    cursor: pointer;
  }
  .tabs button.active {
    color: var(--dl-color-text);
    border-color: var(--dl-color-accent);
    background: var(--dl-color-accent-soft);
  }
  .tabs button.private {
    border-style: dashed;
  }
  .coll {
    font-family: var(--dl-font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dl-color-text-faint);
  }
  .dives button {
    font-size: 12px;
    padding: 4px 10px;
  }
  .open {
    margin-left: auto;
    font-size: 12px;
    color: var(--dl-color-text-muted);
  }
  .star {
    color: var(--dl-color-warm);
  }
  .warning {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--dl-radius-sm);
    border: 1px dashed var(--dl-color-warm);
    color: var(--dl-color-warm);
    font-size: 13px;
  }
  .warning .credit {
    display: block;
    color: var(--dl-color-text-muted);
  }
  .image {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .image img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface);
  }
  .image figcaption {
    font-size: 12px;
    color: var(--dl-color-text-faint);
    font-family: var(--dl-font-mono);
    text-align: right;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 13px;
    margin: 0;
  }
</style>
