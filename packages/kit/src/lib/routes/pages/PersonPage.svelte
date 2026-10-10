<script lang="ts">
  import type { PublicDataFor } from '../public';
  import { goto } from '$app/navigation';
  import DiveTable from '$lib/components/dive/DiveTable.svelte';
  import WorldMap from '$lib/components/dive/WorldMap.svelte';
  import DetailTop from '$lib/components/dive/DetailTop.svelte';
  import {
    flagEmoji,
    formatDate,
    formatDateRange,
    formatDepth,
    formatHours,
    formatTemp,
    pluralize,
  } from '$lib/core/dive/format';
  import { sitesTogether } from '$lib/core/dive/people';
  import { barHeights } from '$lib/core/dive/stats-view';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: PublicDataFor<'person'> } = $props();
  const person = $derived(data.person);
  const stats = $derived(person.stats);
  const yearHeights = $derived(barHeights(data.years, (y) => y.dives));
  const topSites = $derived(sitesTogether(data.dives));
  const siteWidths = $derived(barHeights(topSites, (s) => s.dives));

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
</script>

<section class="person dl-container dl-detail">
  <DetailTop
    back={{ href: urls.people(), label: 'Dive buddies' }}
    owner={data.owner ? { edit: { label: 'Edit person', href: data.editHref } } : null}
  />
  <header class="head">
    <span class="avatar">
      {#if person.avatar_url}
        <img src={person.avatar_url} alt="" width="96" height="96" />
      {:else}
        {initials(person.name)}
      {/if}
    </span>
    <div>
      <p class="dl-kicker">Dive buddy</p>
      <h1>{person.name}</h1>
      {#if stats.first_dive}
        <p class="where dl-num">
          Since {formatDate(stats.first_dive)}{stats.last_dive
            ? ` · last dive ${formatDate(stats.last_dive)}`
            : ''}
        </p>
      {/if}
    </div>
  </header>

  <dl class="facts">
    <div>
      <dt>Dives together</dt>
      <dd class="dl-num">{stats.dives}</dd>
    </div>
    <div>
      <dt>Time underwater</dt>
      <dd class="dl-num">{formatHours(stats.minutes)}</dd>
    </div>
    <div>
      <dt>Deepest together</dt>
      <dd class="dl-num">{formatDepth(stats.max_depth_m)}</dd>
    </div>
    <div>
      <dt>Longest dive</dt>
      <dd class="dl-num">{Math.round(stats.longest_min)} min</dd>
    </div>
    <div>
      <dt>Coldest</dt>
      <dd class="dl-num">{formatTemp(stats.coldest_c)}</dd>
    </div>
    <div>
      <dt>Countries · sites</dt>
      <dd class="dl-num">{stats.countries} · {stats.sites}</dd>
    </div>
  </dl>

  {#if person.private}
    <section class="private">
      <h2>Only you see this</h2>
      <dl class="facts small">
        <div>
          <dt>Full name</dt>
          <dd>{person.private.first_name} {person.private.last_name ?? ''}</dd>
        </div>
        {#if person.private.alias}<div>
            <dt>Alias</dt>
            <dd>{person.private.alias}</dd>
          </div>{/if}
        {#if person.private.aliases.length}<div>
            <dt>Former / other names</dt>
            <dd>{person.private.aliases.join(', ')}</dd>
          </div>{/if}
        {#if person.private.email}<div>
            <dt>E-mail</dt>
            <dd><a href="mailto:{person.private.email}">{person.private.email}</a></dd>
          </div>{/if}
        <div>
          <dt>Shown as</dt>
          <dd>{person.private.display}</dd>
        </div>
        {#if person.private.notes}<div class="wide">
            <dt>Notes</dt>
            <dd>{person.private.notes}</dd>
          </div>{/if}
      </dl>
    </section>
  {/if}

  {#if person.bio_md}
    <section class="block prose-block">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by the backend -->
      <div class="dl-prose">{@html person.bio_html}</div>
    </section>
  {/if}

  {#if data.map.dots.length}
    <section class="block">
      <h2>Where we dived</h2>
      <WorldMap map={data.map} compact onSelect={(slug) => slug && goto(urls.site(slug))} />
    </section>
  {/if}

  {#if topSites.length || data.countries.length}
    <div class="together">
      {#if topSites.length}
        <section class="block">
          <h2>Sites we dived together</h2>
          <ul class="hbars dl-card">
            {#each topSites as site, i (site.slug)}
              <li>
                <a class="hbar-row" href={urls.site(site.slug)}>
                  <span class="name">{flagEmoji(site.country_code)} {site.name}</span>
                  <span class="hbar-track"
                    ><span class="hbar" style="width: {siteWidths[i]}%"></span></span
                  >
                  <span class="hbar-value dl-num">{site.dives}</span>
                </a>
              </li>
            {/each}
          </ul>
          {#if stats.sites > topSites.length}
            <p class="more dl-num">
              and {pluralize(stats.sites - topSites.length, 'other site')}
            </p>
          {/if}
        </section>
      {/if}
      {#if data.countries.length}
        <section class="block">
          <h2>Countries together</h2>
          <div class="flags">
            {#each data.countries as country (country.country_code)}
              <a
                class="flag-chip"
                href={urls.filter({ country: country.country_code, with: person.slug })}
                title="{pluralize(country.dives, 'dive')} in {country.country_name}"
              >
                <span class="flag" aria-hidden="true">{flagEmoji(country.country_code)}</span>
                {country.country_name}
                <span class="dl-num faint">{country.dives}</span>
              </a>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}

  {#if data.trips.length}
    <section class="block">
      <h2>Trips together</h2>
      <div class="flags">
        {#each data.trips as trip (trip.slug)}
          <a
            class="flag-chip"
            href={urls.trip(trip.slug)}
            title="{pluralize(trip.dives, 'dive')} together, {formatDateRange(
              trip.start_date,
              trip.end_date,
            )}"
          >
            {trip.name}
            <span class="dl-num faint">{trip.dives}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if data.years.length > 1}
    <section class="block">
      <h2>By year</h2>
      <div class="bars dl-card" style="--n: {data.years.length}">
        {#each data.years as year, i (year.year)}
          <div class="bar-col" title="{year.year}: {year.dives} dives">
            <span class="bar-value dl-num">{year.dives}</span>
            <span class="bar" style="height: {yearHeights[i]}%"></span>
            <span class="bar-label dl-num">{String(year.year).slice(2)}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="block">
    <h2>{pluralize(data.dives.length, 'dive')} with {person.name}</h2>
    <DiveTable dives={data.dives} />
  </section>
</section>

<style>
  .person {
    padding-top: 40px;
    padding-bottom: var(--dl-space-section);
  }
  .head {
    display: flex;
    gap: 22px;
    align-items: center;
    margin-bottom: 24px;
  }
  .avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: var(--dl-color-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--dl-font-display);
    font-size: 30px;
    font-weight: 600;
    color: var(--dl-color-accent);
    overflow: hidden;
    flex: none;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  h1 {
    font-size: clamp(30px, 5vw, 48px);
    margin-bottom: 6px;
  }
  .where {
    color: var(--dl-color-text-muted);
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 14px 16px;
    margin: 0 0 36px;
    padding: 16px 18px;
    border-radius: var(--dl-radius);
    border: 1px solid var(--dl-color-border);
    background: var(--dl-color-bg-elevated);
  }
  .facts dt {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--dl-color-text-muted);
  }
  .facts dd {
    margin: 2px 0 0;
    font-size: 22px;
    font-weight: 500;
  }
  .facts.small {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
  .facts.small dd {
    font-size: 15px;
    font-weight: 400;
  }
  .facts .wide {
    grid-column: 1 / -1;
  }
  .private {
    border: 1px dashed var(--dl-color-warm);
    border-radius: var(--dl-radius);
    padding: 16px;
    margin-bottom: 36px;
  }
  .private h2 {
    color: var(--dl-color-warm);
    font-size: 15px;
    margin-bottom: 12px;
  }
  .private .facts {
    margin-bottom: 12px;
    background: transparent;
    border: none;
    padding: 0;
  }
  .block {
    margin-bottom: 44px;
  }
  .block h2 {
    font-size: 22px;
    margin-bottom: 14px;
  }
  .prose-block {
    max-width: 68ch;
  }
  .together {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 28px;
  }
  .hbars {
    list-style: none;
    margin: 0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--dl-color-bg-elevated);
  }
  .hbar-row {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 32px;
    gap: 10px;
    align-items: center;
    padding: 3px 0;
    text-decoration: none;
    color: inherit;
  }
  .hbar-row:hover .name {
    color: var(--dl-color-accent);
  }
  .name {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hbar-track {
    height: 8px;
    border-radius: 4px;
    background: var(--dl-color-surface-2);
    overflow: hidden;
  }
  .hbar {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--dl-color-accent);
  }
  .hbar-value {
    font-size: 12px;
    color: var(--dl-color-text-muted);
    text-align: right;
  }
  .more {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--dl-color-text-faint);
  }
  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .flag-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border-strong);
    text-decoration: none;
    color: var(--dl-color-text);
    font-size: 14px;
  }
  .flag-chip:hover {
    border-color: var(--dl-color-accent);
  }
  .flag {
    font-size: 17px;
    line-height: 1;
  }
  .faint {
    color: var(--dl-color-text-faint);
    font-size: 12.5px;
  }
  @media (max-width: 760px) {
    .together {
      grid-template-columns: 1fr;
    }
    .facts {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 480px) {
    .facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .bars {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 6px;
    height: 140px;
    align-items: end;
    padding: 16px;
    background: var(--dl-color-bg-elevated);
  }
  .bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    gap: 4px;
  }
  .bar {
    width: 100%;
    max-width: 32px;
    min-height: 2px;
    border-radius: 4px 4px 2px 2px;
    background: var(--dl-color-warm);
  }
  .bar-value {
    font-size: 11px;
    color: var(--dl-color-text-muted);
  }
  .bar-label {
    font-size: 10.5px;
    color: var(--dl-color-text-faint);
  }
</style>
