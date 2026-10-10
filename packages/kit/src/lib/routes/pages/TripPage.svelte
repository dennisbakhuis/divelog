<script lang="ts">
  import type { PublicDataFor } from '../public';
  import DiveTable from '$lib/components/dive/DiveTable.svelte';
  import WorldMap from '$lib/components/dive/WorldMap.svelte';
  import DiveGlobe from '$lib/components/dive/DiveGlobe.svelte';
  import { boundsOf } from '$lib/core/map/globe';
  import DetailTop from '$lib/components/dive/DetailTop.svelte';
  import {
    flagEmoji,
    formatDateRange,
    formatDepth,
    formatHours,
    pluralize,
  } from '$lib/core/dive/format';
  import { listScale } from '$lib/core/dive/list-view';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: PublicDataFor<'trip'> } = $props();
  const trip = $derived(data.trip);
  const stats = $derived(trip.stats);
  const scale = $derived(listScale(data.dives));
  const divingDays = $derived(new Set(data.dives.map((d) => d.date)).size);
  const fit = $derived(boundsOf(data.map_sites));
</script>

<section class="trip dl-container dl-detail">
  <DetailTop
    back={{ href: urls.trips(), label: 'Dive trips' }}
    owner={data.owner ? { edit: { label: 'Edit trip', href: data.editHref } } : null}
  />
  <p class="dl-kicker">
    Trip · {trip.countries.map((c) => `${flagEmoji(c.country_code)} ${c.country_name}`).join(', ')}
  </p>
  <h1>{trip.name}</h1>
  <p class="where dl-num">
    {formatDateRange(trip.start_date, trip.end_date)} · {pluralize(
      trip.days,
      'day',
    )}{#each trip.regions as region (region.id)}
      <span class="sep">·</span>
      <a href={urls.region(region.id)}>{region.name}</a>{/each}
  </p>

  <dl class="band">
    <div>
      <dt>Dives</dt>
      <dd class="dl-num">{stats.dives}</dd>
    </div>
    <div>
      <dt>Diving days</dt>
      <dd class="dl-num">{divingDays}</dd>
    </div>
    <div>
      <dt>Sites</dt>
      <dd class="dl-num">{stats.sites}</dd>
    </div>
    <div>
      <dt>Time underwater</dt>
      <dd class="dl-num">{formatHours(stats.minutes)}</dd>
    </div>
    <div>
      <dt>Deepest</dt>
      <dd class="dl-num">{formatDepth(stats.max_depth_m)}</dd>
    </div>
  </dl>

  {#if data.map && data.map.dots.length}
    <div class="trip-map">
      <DiveGlobe sites={data.map_sites} countries={trip.countries} dives={data.dives} {fit}>
        <WorldMap
          map={data.map}
          compact
          label="Map of {pluralize(data.map.dots.length, 'dive site')} of {trip.name}"
          />
      </DiveGlobe>
    </div>
  {/if}

  {#if trip.description_md}
    <div class="prose-block">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by the backend -->
      <div class="dl-prose">{@html trip.description_html}</div>
    </div>
  {/if}

  {#if trip.buddies.length}
    <section class="block">
      <h2>With</h2>
      <div class="chips">
        {#each trip.buddies as buddy (buddy.slug)}
          <a class="chip" href={urls.person(buddy.slug)}
            >{buddy.name} <span class="dl-num faint">{buddy.dives}</span></a
          >
        {/each}
      </div>
    </section>
  {/if}

  <section class="block">
    <h2>Day by day</h2>
    <DiveTable
      dives={data.dives}
      groupBy="day"
      tripStart={trip.start_date}
      {scale}
      pageSize={200}
    />
  </section>
</section>

<style>
  .trip {
    padding-top: 40px;
    padding-bottom: var(--dl-space-section);
  }
  h1 {
    font-size: clamp(30px, 5vw, 48px);
    margin-bottom: 6px;
  }
  .where {
    color: var(--dl-color-text-muted);
    margin-bottom: 28px;
  }
  .where a {
    color: var(--dl-color-text);
    text-decoration: none;
  }
  .where a:hover {
    color: var(--dl-color-accent);
  }
  .band {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 14px 18px;
    margin: 0 0 20px;
    padding: 18px 20px;
    border-radius: var(--dl-radius);
    border: 1px solid var(--dl-color-border);
    background: var(--dl-color-bg-elevated);
  }
  .band dt {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .band dd {
    margin: 2px 0 0;
    font-size: 22px;
    font-weight: 500;
  }
  .trip-map {
    margin-bottom: 28px;
  }
  .prose-block {
    max-width: 72ch;
    margin-bottom: 28px;
  }
  .block {
    margin-top: 32px;
  }
  .block h2 {
    font-size: 22px;
    margin-bottom: 12px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border-strong);
    background: var(--dl-color-surface);
    text-decoration: none;
    color: var(--dl-color-text);
    font-size: 14px;
  }
  .chip:hover {
    border-color: var(--dl-color-accent);
  }
  .faint {
    color: var(--dl-color-text-faint);
    font-size: 12.5px;
  }
</style>
