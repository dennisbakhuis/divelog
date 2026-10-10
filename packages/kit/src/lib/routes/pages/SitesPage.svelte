<script lang="ts">
  import type { PublicDataFor } from '../public';
  import { flagEmoji, formatDepth, pluralize } from '$lib/core/dive/format';
  import { reveal } from '$lib/components/anim/reveal';
  import { getDivelog } from '$lib/core/dive/context';
  import { copyFor } from '$lib/core/dive/config';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import {
    siteMatches,
    sitesFilterFromParams,
    sitesFilterToParams,
  } from '$lib/core/dive/sites-filter';
  import { announce } from '$lib/core/ui/announce';
  import OwnerBar from '$lib/components/shell/OwnerBar.svelte';

  const { urls, config } = getDivelog();
  const copy = copyFor(config);

  let { data }: { data: PublicDataFor<'sites'> } = $props();
  const initial = sitesFilterFromParams(page.url.searchParams);
  let type = $state(initial.type);
  let country = $state(initial.country);
  let query = $state(initial.q);

  const filter = $derived({ q: query, country, type });
  const shown = $derived(
    data.countries
      .filter((c) => !country || c.code === country)
      .map((c) => ({
        ...c,
        regions: c.regions
          .map((r) => ({ ...r, sites: r.sites.filter((s) => siteMatches(s, r.name, filter)) }))
          .filter((r) => r.sites.length),
      }))
      .filter((c) => c.regions.length),
  );
  const count = $derived(
    shown.reduce((n, c) => n + c.regions.reduce((m, r) => m + r.sites.length, 0), 0),
  );

  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let lastCount: number | null = null;

  /** Mirror the filter in the URL (so a view is a link) and speak the new count. */
  function sync(delay = 0) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const query = sitesFilterToParams(filter, page.url.searchParams).toString();
      const search = query ? `?${query}` : '';
      if (search !== page.url.search)
        replaceState(`${page.url.pathname}${search}${page.url.hash}`, page.state);
      if (count !== lastCount) {
        lastCount = count;
        announce(`${count} ${count === 1 ? 'site' : 'sites'}`);
      }
    }, delay);
  }

  $effect(() => () => clearTimeout(syncTimer));
</script>

<section class="page dl-container">
  <p class="dl-kicker">Dive sites</p>
  <h1>{data.total} places, <span class="accent">{data.countries.length} countries</span></h1>
  <p class="lede">
    {copy.sitesLede} Or go by <a href={urls.trips()}>trip</a>.
  </p>
  {#if data.owner}
    <OwnerBar
      edit={{ label: 'Edit sites', href: data.editHref }}
      actions={[
        { label: '+ New site', href: urls.admin.newSite() },
        { label: '+ New dive', href: urls.admin.newDive() },
      ]}
    />
  {/if}

  <div class="toolbar">
    <input
      class="dl-input"
      type="search"
      placeholder="Find a site…"
      bind:value={query}
      oninput={() => sync(300)}
      aria-label="Find a site"
    />
    <select class="dl-select" bind:value={country} onchange={() => sync()} aria-label="Country">
      <option value="">All countries</option>
      {#each data.countries as c (c.code)}
        <option value={c.code}>{flagEmoji(c.code)} {c.name}</option>
      {/each}
    </select>
    <select class="dl-select" bind:value={type} onchange={() => sync()} aria-label="Site type">
      <option value="">All types</option>
      {#each data.types as t (t)}<option value={t}>{t}</option>{/each}
    </select>
    <span class="count dl-num">{count} sites</span>
  </div>

  {#each shown as group (group.code)}
    <section class="country" use:reveal={{ stagger: 30 }}>
      <h2 data-reveal>
        {flagEmoji(group.code)}
        {group.name} <span class="dl-num muted">{pluralize(group.dives, 'dive')}</span>
      </h2>
      {#each group.regions as region (region.id ?? 'none')}
        {#if group.regions.length > 1 || region.id}
          <h3 class="region">
            {#if region.id}<a href={urls.region(region.id)}>{region.name}</a
              >{:else}{region.name}{/if}
          </h3>
        {/if}
        <ul class="sites">
          {#each region.sites as site (site.slug)}
            <li data-reveal>
              <a class="site dl-card" href={urls.site(site.slug)}>
                <span class="thumb">
                  <span class="type-mark">{site.site_type}</span>
                </span>
                <span class="body">
                  <span class="site-name">{site.name}</span>
                  <span class="site-meta">
                    <span class="type">{site.site_type}</span>
                    {#if site.area}<span>· {site.area}</span>{/if}
                    {#if site.max_depth_m}<span class="dl-num"
                        >· {formatDepth(site.max_depth_m)}</span
                      >{/if}
                  </span>
                  <span class="site-foot">
                    <span class="dl-num">{pluralize(site.dives, 'dive')}</span>
                    {#if site.last_dive}<span class="dl-num faint"
                        >last {site.last_dive.slice(0, 4)}</span
                      >{/if}
                    {#if site.drawn}<span class="badge">drawn map</span>{/if}
                  </span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/each}
    </section>
  {/each}
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
    margin-bottom: 28px;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 36px;
  }
  .toolbar input,
  .toolbar select {
    font: inherit;
    font-size: 14.5px;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-control);
    border-radius: var(--dl-radius-sm);
    padding: 9px 12px;
  }
  .toolbar input {
    flex: 1 1 240px;
  }
  .toolbar select {
    text-transform: capitalize;
  }
  .count {
    margin-left: auto;
    color: var(--dl-color-text-faint);
    font-size: 13px;
  }
  .country {
    margin-bottom: 40px;
  }
  .country h2 {
    font-size: 22px;
    margin-bottom: 12px;
  }
  .muted {
    font-size: 13px;
    color: var(--dl-color-text-faint);
    font-weight: 400;
    margin-left: 6px;
  }
  .region {
    font-family: var(--dl-font-mono);
    font-size: 11.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    margin: 18px 0 10px;
    font-weight: 500;
  }
  .region a {
    color: inherit;
    text-decoration: none;
  }
  .region a:hover {
    color: var(--dl-color-accent);
  }
  .sites {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
  .site {
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
  .site:hover {
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
  .type-mark {
    font-family: var(--dl-font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dl-color-text-faint);
    text-align: center;
    padding: 4px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .site-name {
    font-family: var(--dl-font-display);
    font-size: 16px;
    font-weight: 600;
  }
  .site-meta {
    font-size: 13px;
    color: var(--dl-color-text-muted);
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .type {
    text-transform: capitalize;
  }
  .site-foot {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: auto;
    padding-top: 6px;
    font-size: 13px;
    color: var(--dl-color-text-faint);
  }
  .faint {
    color: var(--dl-color-text-faint);
  }
  .badge {
    font-family: var(--dl-font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--dl-color-accent-soft);
    color: var(--dl-color-accent);
    margin-left: auto;
  }
  .page > :global(.owner-bar) {
    margin: 0 0 28px;
  }
</style>
