<script lang="ts">
  import MapLegend from './MapLegend.svelte';
  import SiteMapView from './SiteMapView.svelte';
  import SiteAttribution from './SiteAttribution.svelte';
  import type { Attribution, MapRef, SiteDiveRoute, SiteOrigin } from '$lib/core/dive/types';
  import { mapFromCommons } from '$lib/core/dive/sharing';
  import { formatDate } from '$lib/core/dive/format';
  import { defaultTitle, mapSummary, normalizeSiteMap, routeKeys } from '$lib/core/dive/sitemap';
  import { getDivelog } from '$lib/core/dive/context';
  import Tabs from '$lib/components/ui/Tabs.svelte';

  const { urls } = getDivelog();

  let {
    maps,
    siteName,
    owner = false,
    defaultRef = null,
    routes = [],
    origin = 'log',
    attribution = null,
  }: {
    maps: MapRef[];
    siteName: string;
    owner?: boolean;
    defaultRef?: string | null;
    /** Logged dives with a route on one of the drawn maps. */
    routes?: SiteDiveRoute[];
    /** Where the site comes from; maps taken from the commons get an attribution line. */
    origin?: SiteOrigin;
    attribution?: Attribution | null;
  } = $props();

  let current = $state(0);
  const active = $derived(maps[Math.min(current, maps.length - 1)]);
  const drawn = $derived(active?.drawn ? normalizeSiteMap(active.drawn) : null);
  const fromCommons = $derived(!!active && mapFromCommons(active, origin));

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
  // Every dive together overlays the free-drawn tracks too, not just the legs on the line.
  const tracks = $derived(
    selected || shown === 'none'
      ? []
      : dived
          .map((r) => ({ path: r.annotation.path ?? [], turn: r.annotation.turn_at ?? null }))
          .filter((t) => t.path.length > 1),
  );

  const LABEL: Record<MapRef['collection'], string> = {
    drawn: 'Drawn',
    seed: 'Sketch',
    reference: 'Reference',
  };
</script>

{#if maps.length}
  <section class="panel dl-card">
    <Tabs
      tabs={maps.map((m) => ({ id: m.ref, label: m.title, class: m.public ? '' : 'private' }))}
      bind:active={
        () => active?.ref ?? '',
        (ref) =>
          (current = Math.max(
            0,
            maps.findIndex((m) => m.ref === ref),
          ))
      }
      label="Maps of {siteName}"
      variant="pills"
      listClass="tabs"
      tablistAlways={owner}
    >
      {#snippet tab(t)}
        {@const m = maps.find((x) => x.ref === t.id)}
        {#if m}
          <span class="coll">{LABEL[m.collection]}</span>
          {m.title}
          {#if defaultRef === m.ref}<span class="star" aria-hidden="true">★</span><span
              class="dl-visually-hidden">(shown first)</span
            >{/if}
        {/if}
      {/snippet}
      {#snippet panel()}
        {@render body()}
      {/snippet}
    </Tabs>
  </section>
{/if}

{#snippet body()}
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
            aria-pressed={shown === 'all' || (typeof shown === 'number' && !selected)}
            class:active={shown === 'all' || (typeof shown === 'number' && !selected)}
            onclick={() => (shown = 'all')}>All dived lines</button
          >
          {#each dived as r (r.number)}
            <button
              type="button"
              aria-pressed={selected?.number === r.number}
              class:active={selected?.number === r.number}
              title={r.title}
              onclick={() => (shown = r.number)}
              >{formatDate(r.date)} · #{r.number}{#if r.title}<span class="dl-visually-hidden"
                  >, {r.title}</span
                >{/if}</button
            >
          {/each}
          <button
            type="button"
            aria-pressed={shown === 'none'}
            class:active={shown === 'none'}
            onclick={() => (shown = 'none')}>Map only</button
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
        {tracks}
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
    {#if fromCommons}<SiteAttribution {origin} {attribution} variant="map" />{/if}
  {/if}
{/snippet}

<style>
  .panel {
    padding: 10px;
    background: var(--dl-color-bg-elevated);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .panel > :global(.dl-tabpanel:not([hidden])) {
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
  .panel :global(.dl-tab.private) {
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
