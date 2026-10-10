<script lang="ts">
  import type { PublicDataFor } from '../public';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import StatsBand from '$lib/components/dive/StatsBand.svelte';
  import WorldMap from '$lib/components/dive/WorldMap.svelte';
  import DiveGlobe from '$lib/components/dive/DiveGlobe.svelte';
  import Charts from '$lib/components/dive/Charts.svelte';
  import DiveTimeline from '$lib/components/dive/DiveTimeline.svelte';
  import DiveFilters from '$lib/components/dive/DiveFilters.svelte';
  import DiveSort from '$lib/components/dive/DiveSort.svelte';
  import DiveTable from '$lib/components/dive/DiveTable.svelte';
  import {
    applyFilter,
    filterFromParams,
    filterToParams,
    hitsOf,
    type DiveFilter,
  } from '$lib/core/dive/filter';
  import { listScale, yearsOf } from '$lib/core/dive/list-view';
  import { reveal } from '$lib/components/anim/reveal';
  import type { GlobeView } from '$lib/core/map/globe';
  import type { Snapshot } from '@sveltejs/kit';
  import { getDivelog } from '$lib/core/dive/context';
  import { copyFor } from '$lib/core/dive/config';

  const { urls, config } = getDivelog();
  const copy = copyFor(config);

  let { data }: { data: PublicDataFor<'log'> } = $props();

  // Where the globe was pointed survives a trip to a dive page and back.
  let globeView = $state<GlobeView | null>(null);
  export const snapshot: Snapshot<GlobeView | null> = {
    capture: () => globeView,
    restore: (saved) => (globeView = saved),
  };

  // The URL is the single source of truth for the filter, so any view is a link.
  const filter = $derived(filterFromParams(page.url.searchParams));

  const filtered = $derived(applyFilter(data.envelope.dives, filter));
  const hits = $derived(filter.q ? hitsOf(filtered) : null);
  const visibleNumbers = $derived(new Set(filtered.map((d) => d.number)));
  const narrowed = $derived(filtered.length !== data.envelope.dives.length);
  const visibleSites = $derived(
    narrowed ? new Set(filtered.flatMap((d) => (d.site ? [d.site.slug] : []))) : null,
  );
  const scale = $derived(listScale(data.envelope.dives));
  const resultYears = $derived(yearsOf(filtered));

  let table: DiveTable | undefined = $state();

  async function jumpToYear(year: number) {
    const found = await table?.jumpToYear(year);
    if (!found) update({ ...filter, year });
  }

  /** Pins the log to a site from the map popup; an empty slug unpins it. */
  function selectSite(slug: string) {
    update({ ...filter, site: slug });
  }

  function update(next: DiveFilter) {
    const params = filterToParams(next);
    const query = params.toString();
    void goto(urls.log(query), {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }
</script>

<section class="intro dl-container">
  <p class="dl-kicker">Dive log</p>
  <h1>Every dive, <span class="accent">on the record</span></h1>
  <p class="lede">{copy.logLede}</p>
</section>

<StatsBand stats={data.stats} />

<section class="dl-container charts-section" use:reveal>
  <div data-reveal>
    <p class="dl-kicker">Numbers</p>
    <h2>By year, by depth, by type</h2>
  </div>
  <div data-reveal>
    <Charts dives={data.envelope.dives} selected={filtered} {filter} onChange={update} />
  </div>
</section>

<section class="dl-container explore-section" use:reveal>
  <div data-reveal>
    <p class="dl-kicker">Explore</p>
    <h2>Where, when and what</h2>
  </div>
  <div data-reveal>
    <DiveGlobe
      sites={data.stats.map_sites}
      countries={data.stats.country_breakdown}
      dives={filtered}
      filtered={narrowed}
      activeSite={filter.site}
      size={filter.mapSize}
      colour={filter.mapColour}
      bind:view={globeView}
      onSelect={selectSite}
      onOptions={(patch) => update({ ...filter, ...patch })}
    >
      <WorldMap
        map={data.map}
        activeSite={filter.site}
        size={filter.mapSize}
        colour={filter.mapColour}
        highlight={visibleSites}
        compact
        onSelect={selectSite}
      />
    </DiveGlobe>
  </div>
  <div class="when" data-reveal>
    <DiveTimeline
      dives={data.envelope.dives}
      visible={visibleNumbers}
      from={filter.dateFrom}
      to={filter.dateTo}
      onRange={(range) => update({ ...filter, dateFrom: range.from, dateTo: range.to })}
    />
  </div>
  <div class="what" data-reveal>
    <DiveFilters envelope={data.envelope} {filter} onChange={update} />
  </div>
</section>

<section class="dl-container list-section" id="dives">
  <p class="dl-kicker">The log</p>
  <div class="list-head">
    <h2>
      {#if filtered.length === data.envelope.total}
        All {data.envelope.total} dives
      {:else}
        {filtered.length} of {data.envelope.total} dives
      {/if}
    </h2>
    <DiveSort
      {filter}
      onChange={update}
      years={filter.sort === 'date' ? resultYears : []}
      onJump={jumpToYear}
    />
  </div>
  {#if hits && (hits.sites.length || hits.people.length)}
    <div class="hits">
      {#each hits.sites.slice(0, 6) as hit (hit.slug)}
        <a class="hit" href={urls.site(hit.slug)}
          >{hit.name} <span class="dl-num">{hit.count}</span></a
        >
      {/each}
      {#each hits.people.slice(0, 6) as hit (hit.slug)}
        <a class="hit person" href={urls.person(hit.slug)}
          >{hit.name} <span class="dl-num">{hit.count}</span></a
        >
      {/each}
    </div>
  {/if}
  <DiveTable
    bind:this={table}
    dives={filtered}
    groupBy={filter.sort === 'date' ? 'month' : null}
    {scale}
  />
</section>

<style>
  .intro {
    padding-top: 56px;
    padding-bottom: 40px;
  }
  h1 {
    font-size: clamp(36px, 6vw, 64px);
    max-width: 16ch;
  }
  .accent {
    color: var(--dl-color-accent);
  }
  .lede {
    color: var(--dl-color-text-muted);
    font-size: 1.15rem;
    max-width: 56ch;
  }
  .explore-section,
  .charts-section,
  .list-section {
    padding-top: var(--dl-space-section);
  }
  .when {
    margin-top: 28px;
  }
  .what {
    margin-top: 24px;
  }
  .list-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    margin-bottom: 20px;
  }
  .list-head h2 {
    margin: 0;
  }
  .list-section {
    padding-bottom: var(--dl-space-section);
  }
  h2 {
    font-size: clamp(26px, 3.5vw, 36px);
  }
  .hits {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 16px;
  }
  .hit {
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border-strong);
    background: var(--dl-color-surface);
    text-decoration: none;
    color: var(--dl-color-text);
    font-size: 13.5px;
  }
  .hit:hover {
    border-color: var(--dl-color-accent);
  }
  .hit.person {
    border-style: dashed;
  }
  .hit .dl-num {
    color: var(--dl-color-text-faint);
    font-size: 12px;
  }
</style>
