<script lang="ts">
  import { tick } from 'svelte';
  import type { DiveListItem } from '$lib/core/dive/types';
  import {
    flagEmoji,
    formatDate,
    formatDepth,
    formatTemp,
    siteLocation,
  } from '$lib/core/dive/format';
  import {
    barPercent,
    firstIndexOfYear,
    groupByDay,
    groupByMonth,
    listScale,
    profileArea,
    siteGlyph,
    type ListScale,
  } from '$lib/core/dive/list-view';
  import { typeColour } from '$lib/core/dive/stats-view';
  import MapGlyph from './MapGlyph.svelte';
  import { getDivelog } from '$lib/core/dive/context';
  import { page } from '$app/state';
  import { fromState } from '$lib/core/dive/back';
  import { followWithState } from './follow';

  const { urls } = getDivelog();

  let {
    dives,
    pageSize = 60,
    groupBy = null,
    tripStart,
    scale,
    hideSite = false,
  }: {
    dives: DiveListItem[];
    pageSize?: number;
    /**
     * Head the rows by month (with the trips each month holds) or by day of a trip; only
     * meaningful when the list is in date order.
     */
    groupBy?: 'month' | 'day' | null;
    /** First day of the trip, for `groupBy: 'day'` labels ("Day 3 · …"). */
    tripStart?: string;
    /** Bar maxima; defaults to the maxima of `dives`. */
    scale?: ListScale;
    /** On a site page every row is the same site; show section, date and buddies instead. */
    hideSite?: boolean;
  } = $props();

  // Rendering 674 rows at once is two megabytes of HTML nobody scrolls through;
  // show a page and grow it on demand. A new list resets the window.
  // svelte-ignore state_referenced_locally
  let shown = $state(pageSize);
  $effect(() => {
    void dives;
    shown = pageSize;
  });
  const visible = $derived(dives.slice(0, shown));
  const bars = $derived(scale ?? listScale(dives));
  const groups = $derived.by(() => {
    if (groupBy === 'month') return groupByMonth(visible, dives);
    if (groupBy === 'day') return groupByDay(visible, tripStart ?? dives[0]?.date ?? '', dives);
    return [{ key: 'all', label: '', count: dives.length, dives: visible, trips: [] }];
  });

  /** The row link's name: short and unique, e.g. "Dive #650, Cenote Nohoch Nah Chich, 8 Feb 2026". */
  function rowLabel(dive: DiveListItem): string {
    const name = dive.title || dive.site?.name || dive.section || 'Untitled dive';
    return `Dive #${dive.number}, ${name}, ${formatDate(dive.date)}`;
  }

  const SPARK_W = 96;
  const SPARK_H = 52;

  /** Grow the window until the first dive of `year` is rendered, then scroll to it. */
  export async function jumpToYear(year: number): Promise<boolean> {
    const index = firstIndexOfYear(dives, year);
    if (index < 0) return false;
    if (index >= shown) shown = index + pageSize;
    await tick();
    document
      .getElementById(`dive-row-${dives[index].number}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
</script>

{#snippet buddyLinks(buddies: DiveListItem['buddies'])}
  with <a class="above" href={urls.person(buddies[0].slug)}>{buddies[0].name}</a>{#if buddies.length > 1}, {buddies
      .slice(1)
      .map((b) => b.name)
      .join(', ')}{/if}
{/snippet}

{#snippet row(dive: DiveListItem)}
  {@const href = urls.dive(dive.number)}
  <li id="dive-row-{dive.number}">
    <div class="dive">
      <span
        class="cover"
        class:has-photo={dive.cover_url}
        class:has-spark={!dive.cover_url && dive.spark}
        aria-hidden="true"
      >
        {#if dive.cover_url}
          <img src={dive.cover_url} alt="" loading="lazy" width="120" height="80" />
        {:else if dive.spark}
          <svg viewBox="0 -6 {SPARK_W} {SPARK_H + 8}" preserveAspectRatio="none">
            <line class="surface" x1="0" y1="0" x2={SPARK_W} y2="0" />
            <path class="profile" d={profileArea(dive.spark, SPARK_W, SPARK_H)} />
          </svg>
        {:else}
          {@const glyph = siteGlyph(dive.site?.site_type)}
          <svg
            class="glyph"
            viewBox="-14 -14 28 28"
            style:color={typeColour(dive.site?.site_type ?? '')}
          >
            <MapGlyph type={glyph.type} objectKind={glyph.objectKind} />
          </svg>
        {/if}
      </span>
      <span class="main">
        <span class="title">
          <span class="number dl-num" aria-hidden="true">#{dive.number}</span>
          <a
            class="row-link"
            {href}
            aria-label={rowLabel(dive)}
            onclick={(e) => followWithState(e, href, fromState(page.url))}
          >
            {#if dive.title && dive.section && !hideSite}
              {dive.section}<span class="section">· {dive.title}</span>
            {:else}
              {dive.title ||
                (hideSite ? dive.section || formatDate(dive.date) : dive.site?.name) ||
                'Untitled dive'}
              {#if dive.section && !hideSite}<span class="section">· {dive.section}</span>{/if}
            {/if}
          </a>
        </span>
        <span class="where">
          {#if hideSite}
            {[
              dive.title ? dive.section : null,
              dive.title || dive.section ? formatDate(dive.date) : null,
            ]
              .filter(Boolean)
              .join(' · ')}{#if dive.buddies.length}{dive.title || dive.section
                ? ' · '
                : ''}{@render buddyLinks(dive.buddies)}{/if}
          {:else}
            {#if dive.site}
              <span aria-hidden="true">{flagEmoji(dive.site.country_code)}</span>
              {@const loc = siteLocation(dive.site.name, dive.site.area)}
              {@const cut = loc.toLowerCase().startsWith(dive.site.name.toLowerCase())
                ? dive.site.name.length
                : loc.length}
              <a class="above" href={urls.site(dive.site.slug)}>{loc.slice(0, cut)}</a
              >{loc.slice(cut)}
            {:else}
              Unknown site
            {/if}
            {#if dive.buddies.length}
              · {@render buddyLinks(dive.buddies)}
            {/if}
            {#if dive.trip && !groupBy}
              · <a class="above trip-link" href={urls.trip(dive.trip.slug)}>{dive.trip.name}</a>
            {/if}
          {/if}
        </span>
        <span class="tags">
          {#each dive.tags as tag (tag)}<span class="dl-tag" data-tag={tag}>{tag}</span>{/each}
        </span>
      </span>
      <span class="numbers dl-num">
        <span><small>date</small>{formatDate(dive.date)}</span>
        <span>
          <small>depth</small>{formatDepth(dive.max_depth_m)}
          <span class="bar" aria-hidden="true"
            ><i style:width="{barPercent(dive.max_depth_m, bars.depth)}%"></i></span
          >
        </span>
        <span>
          <small>time</small>{Math.round(dive.duration_min)} min
          <span class="bar" aria-hidden="true"
            ><i style:width="{barPercent(dive.duration_min, bars.time)}%"></i></span
          >
        </span>
        <span><small>water</small>{formatTemp(dive.water_temp_c)}</span>
        <span class="profile-mark">
          {#if dive.has_profile && dive.cover_url}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M1 3h2l3 9h4l3-9h2"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="dl-visually-hidden">Dive-computer profile</span>
          {/if}
        </span>
      </span>
    </div>
  </li>
{/snippet}

{#if dives.length === 0}
  <p class="empty">No dives match — loosen a filter or two.</p>
{:else}
  {#each groups as group (`${group.key}-${group.dives[0]?.number}`)}
    <section class="group">
      {#if groupBy}
        <h3 class="month">
          {group.label}
          <span class="count">· {group.count} {group.count === 1 ? 'dive' : 'dives'}</span>
          {#if groupBy === 'month'}
            {#each group.trips as trip (trip.slug)}
              <a class="trip" href={urls.trip(trip.slug)}>· {trip.name} →</a>
            {/each}
          {/if}
        </h3>
      {/if}
      <ol class="dives">
        {#each group.dives as dive (dive.number)}
          {@render row(dive)}
        {/each}
      </ol>
    </section>
  {/each}
  {#if shown < dives.length}
    <div class="more">
      <button type="button" class="dl-btn dl-btn-ghost" onclick={() => (shown += pageSize * 2)}
        >Show more <span class="dl-num">({dives.length - shown} left)</span></button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        onclick={() => (shown = dives.length)}>Show all</button
      >
    </div>
  {/if}
{/if}

<style>
  .more {
    display: flex;
    gap: 8px;
    justify-content: center;
    align-items: center;
    padding: 20px 0 0;
  }
  .empty {
    color: var(--dl-color-text-muted);
    padding: 40px 0;
  }
  .group + .group {
    margin-top: 8px;
  }
  .month {
    position: sticky;
    top: var(--dl-header-h);
    z-index: 2;
    margin: 0;
    padding: 14px 0 10px;
    background: var(--dl-color-bg);
    font-family: var(--dl-font-mono);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--dl-color-accent);
  }
  .month .count {
    color: var(--dl-color-text-faint);
  }
  .month .trip {
    margin-left: 0.4em;
    color: var(--dl-color-warm);
    text-decoration: none;
    letter-spacing: 0.08em;
  }
  .month .trip:hover {
    color: var(--dl-color-accent);
  }
  .dives {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dives li {
    scroll-margin-top: calc(var(--dl-header-h) + 48px);
  }
  .dive {
    position: relative;
    display: grid;
    grid-template-columns: 96px 1fr auto;
    gap: 16px;
    align-items: center;
    padding: 12px 16px 12px 12px;
    border-radius: var(--dl-radius);
    border: 1px solid var(--dl-color-border);
    background: var(--dl-color-surface);
    text-decoration: none;
    color: inherit;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease;
  }
  .dive:hover {
    border-color: var(--dl-color-accent);
    transform: translateX(2px);
  }
  .dive:has(.row-link:focus-visible) {
    border-color: var(--dl-color-accent);
    outline: var(--dl-focus-ring);
    outline-offset: var(--dl-focus-offset);
  }
  .row-link {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
    color: inherit;
    text-decoration: none;
  }
  .row-link:focus-visible {
    outline: none;
  }
  .row-link::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .above {
    position: relative;
    z-index: 1;
    color: inherit;
    text-decoration: none;
  }
  .above:hover {
    color: var(--dl-color-accent);
    text-decoration: underline;
  }
  .cover {
    --map-bg: var(--dl-color-surface-2);
    width: 96px;
    height: 64px;
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dl-color-text-faint);
    font-size: 13px;
    overflow: hidden;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .cover.has-spark svg {
    width: 100%;
    height: 100%;
  }
  .cover .glyph {
    width: 32px;
    height: 32px;
  }
  .surface {
    stroke: var(--dl-color-border-strong);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
  .profile {
    fill: var(--dl-color-accent-soft);
    stroke: var(--dl-color-accent);
    stroke-width: 1.5px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .title {
    font-family: var(--dl-font-display);
    font-weight: 600;
    font-size: 17px;
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .number {
    font-size: 12px;
    color: var(--dl-color-text-faint);
    font-weight: 400;
  }
  .section {
    font-weight: 400;
    color: var(--dl-color-text-muted);
    font-size: 14px;
  }
  .where {
    color: var(--dl-color-text-muted);
    font-size: 14px;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .numbers {
    display: grid;
    grid-template-columns: auto 64px 64px auto 14px;
    gap: 18px;
    font-size: 14px;
    text-align: right;
  }
  .numbers > span {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .bar {
    display: block;
    align-self: stretch;
    height: 3px;
    margin-top: 4px;
    border-radius: 2px;
    background: var(--dl-color-border);
    overflow: hidden;
    direction: rtl;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--dl-color-accent);
    border-radius: 2px;
  }
  .numbers .profile-mark {
    justify-content: center;
    color: var(--dl-color-text-faint);
  }
  .numbers small {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-faint);
  }
  @media (max-width: 820px) {
    .dive {
      grid-template-columns: 72px 1fr;
    }
    .cover {
      width: 72px;
      height: 48px;
    }
    .numbers {
      grid-column: 1 / -1;
      grid-template-columns: repeat(4, 1fr) 14px;
      text-align: left;
      gap: 8px;
    }
    .numbers > span {
      align-items: flex-start;
    }
    .bar {
      direction: ltr;
      max-width: 96px;
    }
  }
  @media (max-width: 480px) {
    .dive {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
    }
    .cover {
      width: 100%;
      height: 40px;
    }
    .cover.has-photo {
      height: 96px;
    }
    .cover .glyph {
      width: 24px;
      height: 24px;
    }
    .numbers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
    }
    .numbers .profile-mark {
      display: none;
    }
  }
</style>
