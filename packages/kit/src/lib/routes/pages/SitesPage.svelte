<script lang="ts">
  import type { PublicDataFor } from '../public';
  import { flagEmoji, formatDepth, pluralize } from '$lib/core/dive/format';
  import { reveal } from '$lib/components/anim/reveal';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: PublicDataFor<'sites'> } = $props();
  let type = $state('');
  let country = $state('');
  let query = $state('');

  const shown = $derived(
    data.countries
      .filter((c) => !country || c.code === country)
      .map((c) => ({
        ...c,
        regions: c.regions
          .map((r) => ({
            ...r,
            sites: r.sites.filter(
              (s) =>
                (!type || s.site_type === type) &&
                (!query ||
                  `${s.name} ${s.area ?? ''} ${r.name}`
                    .toLowerCase()
                    .includes(query.toLowerCase())),
            ),
          }))
          .filter((r) => r.sites.length),
      }))
      .filter((c) => c.regions.length),
  );
  const count = $derived(
    shown.reduce((n, c) => n + c.regions.reduce((m, r) => m + r.sites.length, 0), 0),
  );
</script>

<section class="page dl-container">
  <p class="dl-kicker">Dive sites</p>
  <h1>{data.total} places, <span class="accent">{data.countries.length} countries</span></h1>
  <p class="lede">
    Every site in the log, grouped by country and region. Each has its own page with the story of
    the place, a locator map, the dives I did there and, where I have drawn one, a map of the site.
    Or go by <a href={urls.trips()}>trip</a>.
  </p>

  <div class="toolbar">
    <input type="search" placeholder="Find a site…" bind:value={query} aria-label="Find a site" />
    <select bind:value={country} aria-label="Country">
      <option value="">All countries</option>
      {#each data.countries as c (c.code)}
        <option value={c.code}>{flagEmoji(c.code)} {c.name}</option>
      {/each}
    </select>
    <select bind:value={type} aria-label="Site type">
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
    border: 1px solid var(--dl-color-border-strong);
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
</style>
