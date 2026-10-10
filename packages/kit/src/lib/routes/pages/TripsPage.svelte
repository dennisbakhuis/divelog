<script lang="ts">
  import type { PublicDataFor } from '../public';
  import { flagEmoji, formatDateRange, formatDepth, pluralize } from '$lib/core/dive/format';
  import type { TripSummary } from '$lib/core/dive/types';
  import { reveal } from '$lib/components/anim/reveal';
  import { getDivelog } from '$lib/core/dive/context';
  import OwnerBar from '$lib/components/shell/OwnerBar.svelte';

  const { urls } = getDivelog();

  let { data }: { data: PublicDataFor<'trips'> } = $props();

  const years = $derived.by(() => {
    const groups: { year: number; trips: TripSummary[] }[] = [];
    for (const trip of data.trips) {
      const year = Number(trip.start_date.slice(0, 4));
      const last = groups[groups.length - 1];
      if (last && last.year === year) last.trips.push(trip);
      else groups.push({ year, trips: [trip] });
    }
    return groups;
  });
  const diveCount = $derived(data.trips.reduce((n, t) => n + t.stats.dives, 0));
  const countries = $derived(
    new Set(data.trips.flatMap((t) => t.countries.map((c) => c.country_code))).size,
  );
</script>

<section class="page dl-container">
  <p class="dl-kicker">Dive trips</p>
  <h1>
    {pluralize(data.trips.length, 'trip')},
    <span class="accent">{pluralize(countries, 'country', 'countries')}</span>
  </h1>
  <p class="lede">
    Every run of dives abroad, a few days apart at most: {pluralize(diveCount, 'dive')} in all. Each trip
    has a map of its sites, the numbers, who came along and the dives day by day.
  </p>
  {#if data.owner}
    <OwnerBar
      edit={{ label: 'Edit trips', href: data.editHref }}
      actions={[{ label: '+ New dive', href: urls.admin.newDive() }]}
    />
  {/if}

  {#if data.trips.length === 0}
    <p class="empty">No trips yet.</p>
  {/if}

  {#each years as group (group.year)}
    <section class="year" use:reveal={{ stagger: 30 }}>
      <h2 data-reveal class="dl-num">{group.year}</h2>
      <ul class="trips">
        {#each group.trips as trip (trip.slug)}
          <li data-reveal>
            <a class="trip dl-card" href={urls.trip(trip.slug)}>
              <span class="thumb" class:empty={!trip.cover_url}>
                {#if trip.cover_url}
                  <img src={trip.cover_url} alt="" loading="lazy" width="168" height="124" />
                {:else}
                  <span class="flags" aria-hidden="true"
                    >{trip.countries.map((c) => flagEmoji(c.country_code)).join('')}</span
                  >
                {/if}
              </span>
              <span class="body">
                <span class="trip-name">{trip.name}</span>
                <span class="trip-meta dl-num">
                  {formatDateRange(trip.start_date, trip.end_date)} · {pluralize(trip.days, 'day')}
                </span>
                <span class="trip-meta">
                  {trip.countries
                    .map((c) => `${flagEmoji(c.country_code)} ${c.country_name}`)
                    .join(', ')}
                </span>
                <span class="trip-foot">
                  <span class="dl-num">{pluralize(trip.stats.dives, 'dive')}</span>
                  <span class="dl-num">{pluralize(trip.stats.sites, 'site')}</span>
                  {#if trip.stats.max_depth_m}<span class="dl-num faint"
                      >max {formatDepth(trip.stats.max_depth_m)}</span
                    >{/if}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <p class="cross">
    <a href={urls.sites()}>All dive sites →</a>
    <a href={urls.people()}>Dive buddies →</a>
  </p>
</section>

<style>
  .page {
    padding-top: 56px;
    padding-bottom: var(--dl-space-section);
  }
  h1 {
    font-size: clamp(34px, 5vw, 52px);
  }
  .accent {
    color: var(--dl-color-accent);
  }
  .lede {
    color: var(--dl-color-text-muted);
    font-size: 1.1rem;
    max-width: 60ch;
    margin-bottom: 36px;
  }
  .empty {
    color: var(--dl-color-text-muted);
  }
  .year {
    margin-bottom: 36px;
  }
  .year h2 {
    font-size: 22px;
    margin-bottom: 12px;
  }
  .trips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .trip {
    display: grid;
    grid-template-columns: 84px 1fr;
    gap: 12px;
    padding: 10px;
    text-decoration: none;
    color: inherit;
    height: 100%;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease;
  }
  .trip:hover {
    transform: translateY(-2px);
    border-color: var(--dl-color-accent);
  }
  .thumb {
    width: 84px;
    height: 62px;
    border-radius: var(--dl-radius-sm);
    overflow: hidden;
    background: var(--dl-color-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .flags {
    font-size: 28px;
    line-height: 1;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .trip-name {
    font-family: var(--dl-font-display);
    font-size: 16px;
    font-weight: 600;
  }
  .trip-meta {
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .trip-foot {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: auto;
    padding-top: 6px;
    font-size: 13px;
    color: var(--dl-color-text-faint);
  }
  .faint {
    color: var(--dl-color-text-faint);
  }
  .cross {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .cross a {
    color: var(--dl-color-text-muted);
    text-decoration: none;
  }
  .cross a:hover {
    color: var(--dl-color-accent);
  }
  .page > :global(.owner-bar) {
    margin: 0 0 28px;
  }
</style>
