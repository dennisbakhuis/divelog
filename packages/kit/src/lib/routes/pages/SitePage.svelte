<script lang="ts">
  import type { PublicDataFor } from '../public';
  import DiveTable from '$lib/components/dive/DiveTable.svelte';
  import Gallery from '$lib/components/dive/Gallery.svelte';
  import MapPanel from '$lib/components/dive/MapPanel.svelte';
  import SiteLocatorMap from '$lib/components/dive/SiteLocatorMap.svelte';
  import DetailTop from '$lib/components/dive/DetailTop.svelte';
  import { flagEmoji, formatDate, formatDepth, pluralize } from '$lib/core/dive/format';
  import { barHeights, waterTempByMonth } from '$lib/core/dive/stats-view';
  import { getDivelog } from '$lib/core/dive/context';
  import { revisionLine } from '$lib/core/dive/revision';
  import SiteAttribution from '$lib/components/dive/SiteAttribution.svelte';

  const { urls } = getDivelog();

  let { data }: { data: PublicDataFor<'site'> } = $props();
  const site = $derived(data.site);
  const owner = $derived(!!data.owner);
  const photos = $derived(site.attachments.filter((a) => a.kind === 'photo'));
  const uploads = $derived(site.attachments.filter((a) => a.kind === 'map'));
  const maps = $derived([...site.maps, ...(site.private?.reference_maps ?? [])]);
  const deepest = $derived(Math.max(0, ...data.dives.map((d) => d.max_depth_m)));
  const visits = $derived.by(() => {
    const byYear: Record<number, typeof data.dives> = {};
    for (const dive of data.dives) {
      const year = Number(dive.date.slice(0, 4));
      (byYear[year] ??= []).push(dive);
    }
    return Object.entries(byYear)
      .map(([year, dives]) => [Number(year), dives] as const)
      .sort((a, b) => b[0] - a[0]);
  });
  let openYear = $state<number | null>(null);
  const temps = $derived(waterTempByMonth(data.dives));
  const tempHeights = $derived(temps ? barHeights(temps, (m) => m.temp ?? 0) : []);
  const latestPrice = $derived(
    [...site.prices].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null,
  );
  const historyLine = $derived(revisionLine(site));
  const provenance = $derived(
    site.private
      ? `${site.verified ? `verified: ${site.verified}` : 'not verified'}${
          site.geo_source ? ` · ${site.geo_source}` : ''
        }`
      : null,
  );
</script>

<section class="site dl-container dl-detail">
  <DetailTop
    back={{ href: urls.sites(), label: 'Dive sites' }}
    owner={owner
      ? {
          edit: { label: 'Edit site', href: data.editHref },
          actions: [{ label: 'Maps', href: urls.admin.siteMaps(site.id) }],
          note: provenance,
        }
      : null}
  />
  <p class="dl-kicker">
    Dive site · {site.site_type}
    {#if site.region_name}· <a href={urls.region(site.region ?? '')}>{site.region_name}</a>{/if}
  </p>
  <h1>{flagEmoji(site.country_code)} {site.name}</h1>
  <p class="where">
    {[site.area, site.country_name].filter(Boolean).join(', ')}
    {#if site.system}· part of <strong>{site.system}</strong>{/if}
  </p>
  {#if site.summary}<p class="summary">{site.summary}</p>{/if}

  <div class="grid">
    <div>
      <dl class="facts">
        <div>
          <dt>Dives here</dt>
          <dd class="dl-num">{data.dives.length}</dd>
        </div>
        <div>
          <dt>Deepest</dt>
          <dd class="dl-num">{formatDepth(deepest)}</dd>
        </div>
        {#if site.water}
          <div>
            <dt>Water</dt>
            <dd class="small">
              {site.water}{site.halocline
                ? ` · halocline${site.halocline_m !== null ? ` at ${site.halocline_m} m` : ''}`
                : ''}
            </dd>
          </div>
        {/if}
        {#if site.first_dive}
          <div>
            <dt>First · last</dt>
            <dd class="dl-num small">
              {site.first_dive.slice(0, 4)}{site.last_dive && site.last_dive !== site.first_dive
                ? ` · ${site.last_dive.slice(0, 4)}`
                : ''}
            </dd>
          </div>
        {/if}
        {#if site.lat !== null && site.lon !== null}
          <div>
            <dt>Position</dt>
            <dd class="dl-num small">
              <a
                href="https://www.openstreetmap.org/?mlat={site.lat}&mlon={site.lon}#map=15/{site.lat}/{site.lon}"
                target="_blank"
                rel="noopener">{site.lat.toFixed(4)}, {site.lon.toFixed(4)}</a
              >
            </dd>
          </div>
        {:else}
          <div>
            <dt>Position</dt>
            <dd class="small">region only</dd>
          </div>
        {/if}
        {#if site.access?.note || site.access?.lat}
          <div class="wide">
            <dt>Getting in</dt>
            <dd class="small">
              {site.access.note ?? ''}
              {#if site.access.lat !== null && site.access.lon !== null}
                <span class="dl-num faint"
                  >({site.access.lat.toFixed(4)}, {site.access.lon.toFixed(4)})</span
                >
              {/if}
            </dd>
          </div>
        {/if}
        {#if site.aliases.length}
          <div class="wide">
            <dt>Also known as</dt>
            <dd class="small">{site.aliases.join(' · ')}</dd>
          </div>
        {/if}
        {#if site.section_vocabulary.length}
          <div class="wide">
            <dt>Lines & sections</dt>
            <dd class="small chips">
              {#each site.section_vocabulary as section (section)}
                <a class="chip" href={urls.filter({ site: site.slug, section })}>{section}</a>
              {/each}
            </dd>
          </div>
        {/if}
        {#if latestPrice}
          <div>
            <dt>Entry</dt>
            <dd class="dl-num small">
              {latestPrice.amount === 0
                ? 'free'
                : `${latestPrice.amount.toFixed(2)} ${latestPrice.currency}`}
              <span class="faint">({latestPrice.date.slice(0, 4)})</span>
            </dd>
          </div>
        {/if}
      </dl>
      {#if historyLine}
        <div class="versioning">
          <p class="revision dl-num">{historyLine}</p>
          {#if site.changelog.length}
            <details class="dl-detail history">
              <summary>History</summary>
              <ol>
                {#each site.changelog as entry (entry.revision)}
                  <li>
                    <span class="dl-num rev">r{entry.revision}</span>
                    <span class="dl-num faint">{formatDate(entry.date)}</span>
                    <span class="note">{entry.note}</span>
                    {#if entry.author}<span class="faint">· {entry.author}</span>{/if}
                  </li>
                {/each}
              </ol>
            </details>
          {/if}
        </div>
      {/if}
      <SiteAttribution
        origin={site.origin}
        attribution={site.attribution}
        forkedFrom={site.forked_from}
      />
    </div>
    <div class="map dl-card">
      {#snippet globe()}
        <svg
          viewBox="0 0 {data.map.width} {data.map.height}"
          role="img"
          aria-label="Location of {site.name}"
        >
          <path d={data.map.spherePath} class="sphere" />
          <path d={data.map.landPath} class="land" />
          {#if data.map.point}
            <circle cx={data.map.point.x} cy={data.map.point.y} r="14" class="halo" />
            <circle cx={data.map.point.x} cy={data.map.point.y} r="5" class="dot" />
          {/if}
        </svg>
      {/snippet}
      {#if site.lat !== null && site.lon !== null}
        <SiteLocatorMap
          lat={site.lat}
          lon={site.lon}
          name={site.name}
          siteType={site.site_type}
          access={site.access?.lat != null && site.access.lon != null
            ? { lat: site.access.lat, lon: site.access.lon }
            : null}
          nearby={data.nearby}
        >
          {@render globe()}
        </SiteLocatorMap>
      {:else}
        {@render globe()}
      {/if}
    </div>
  </div>

  {#if maps.length}
    <section class="block">
      <h2>{pluralize(maps.length, 'map')}</h2>
      <MapPanel
        {maps}
        siteName={site.name}
        {owner}
        defaultRef={site.default_map}
        routes={data.routes}
        origin={site.origin}
        attribution={site.attribution}
      />
    </section>
  {/if}

  {#if site.description_md}
    <section class="block prose-block">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by the backend -->
      <div class="dl-prose">{@html site.description_html}</div>
    </section>
  {/if}

  {#if photos.length}
    <section class="block">
      <h2>Photos</h2>
      <Gallery items={photos} kind="photo" />
    </section>
  {/if}

  {#if uploads.length}
    <section class="block">
      <h2>Uploaded maps</h2>
      <Gallery items={uploads} kind="map" />
    </section>
  {/if}

  {#if site.prices.length}
    <section class="block">
      <h2>What it cost</h2>
      <table class="prices">
        <thead><tr><th>When</th><th>Price</th><th>Note</th></tr></thead>
        <tbody>
          {#each [...site.prices].sort( (a, b) => b.date.localeCompare(a.date) ) as price (price.date + price.note)}
            <tr>
              <td class="dl-num">{formatDate(price.date)}</td>
              <td class="dl-num"
                >{price.amount === 0 ? 'free' : `${price.amount.toFixed(2)} ${price.currency}`}</td
              >
              <td>{price.note}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if data.people.length}
    <section class="block">
      <h2>Dived here with</h2>
      <div class="people">
        {#each data.people as person (person.slug)}
          <a class="person" href={urls.person(person.slug)}>
            {#if person.avatar_url}<img
                src={person.avatar_url}
                alt=""
                width="26"
                height="26"
              />{/if}
            {person.name}
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if data.nearby.length}
    <section class="block">
      <h2>Nearby sites</h2>
      <ul class="nearby">
        {#each data.nearby as other (other.slug)}
          <li>
            <a class="nearby-site dl-card" href={urls.site(other.slug)}>
              <span class="nearby-name">{flagEmoji(other.country_code)} {other.name}</span>
              <span class="nearby-meta dl-num"
                >{other.distance_km.toFixed(1)} km · {other.dives
                  ? pluralize(other.dives, 'dive')
                  : 'not dived yet'} · {other.site_type}</span
              >
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="block">
    <h2>{pluralize(data.dives.length, 'dive')} at {site.name}</h2>
    {#if visits.length > 1 || temps}
      <div class="site-charts">
        {#if visits.length > 1}
          <div class="site-chart">
            <h3 class="chart-title">Dives per year</h3>
            <div class="years">
              {#each visits as [year, dives] (year)}
                <button
                  type="button"
                  class="year"
                  class:active={openYear === year}
                  onclick={() => (openYear = openYear === year ? null : year)}
                >
                  <span class="dl-num">{year}</span>
                  <span class="bar" style="height: {Math.min(100, 12 + dives.length * 12)}%"></span>
                  <span class="dl-num faint">{dives.length}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
        {#if temps}
          <div class="site-chart">
            <h3 class="chart-title">Water temperature by month</h3>
            <div
              class="temps"
              role="img"
              aria-label="Mean water temperature per month at {site.name}"
            >
              {#each temps as month, i (month.month)}
                <div
                  class="temp-col"
                  title={month.temp !== null
                    ? `${month.temp.toFixed(1)} °C over ${pluralize(month.dives, 'dive')}`
                    : 'no dives'}
                >
                  <span class="temp-value dl-num"
                    >{month.temp !== null ? `${Math.round(month.temp)}°` : ''}</span
                  >
                  <span
                    class="temp-bar"
                    class:empty={month.temp === null}
                    style="height: {tempHeights[i]}%"
                  ></span>
                  <span class="temp-label dl-num">{month.label}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
    <DiveTable
      hideSite
      dives={openYear ? (visits.find(([y]) => y === openYear)?.[1] ?? []) : data.dives}
    />
  </section>

  {#if site.sources.length}
    <section class="block sources">
      <h3>Sources</h3>
      <ul>
        {#each site.sources as source (source)}
          {@const [title, url] = source.split(' — ')}
          <li>
            {#if url}<a href={url} rel="noopener">{title}</a>{:else}{source}{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if owner && site.private?.notes}
    <section class="block private">
      <h3>Provenance (only you)</h3>
      <p class="muted">{site.private.notes}</p>
    </section>
  {/if}
</section>

<style>
  .site {
    padding-top: 40px;
    padding-bottom: var(--dl-space-section);
  }
  .dl-kicker a {
    color: inherit;
  }
  h1 {
    font-size: clamp(30px, 5vw, 48px);
    margin-bottom: 6px;
  }
  .where {
    color: var(--dl-color-text-muted);
  }
  .summary {
    font-size: 1.15rem;
    max-width: 60ch;
    margin-top: 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 28px;
    margin: 24px 0 40px;
    align-items: start;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    margin: 0;
  }
  .facts .wide {
    grid-column: 1 / -1;
  }
  .facts dt {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .facts dd {
    margin: 2px 0 0;
    font-size: 22px;
    font-weight: 500;
  }
  .facts dd.small {
    font-size: 14px;
    font-weight: 400;
  }
  .facts dd a {
    color: inherit;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border-strong);
    text-decoration: none;
    color: var(--dl-color-text);
    font-size: 13px;
  }
  .chip:hover {
    border-color: var(--dl-color-accent);
  }
  .faint {
    color: var(--dl-color-text-faint);
  }
  .versioning {
    margin-top: 18px;
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .revision {
    margin: 0 0 4px;
  }
  .history summary {
    cursor: pointer;
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .history summary:hover {
    color: var(--dl-color-text);
  }
  .history ol {
    list-style: none;
    margin: 8px 0 0;
    padding: 0 0 0 12px;
    border-left: 1px solid var(--dl-color-border);
    display: grid;
    gap: 6px;
  }
  .history .rev {
    color: var(--dl-color-accent);
  }
  .history .note {
    color: var(--dl-color-text);
  }
  .map {
    padding: 0;
    overflow: hidden;
    background: var(--dl-color-bg-elevated);
    align-self: stretch;
    min-height: 340px;
  }
  .map > svg {
    padding: 8px;
  }
  .map svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .sphere {
    fill: color-mix(in srgb, var(--dl-color-accent) 4%, transparent);
    stroke: var(--dl-color-border);
  }
  .land {
    fill: var(--dl-color-surface-2);
    stroke: color-mix(in srgb, var(--dl-color-text) 14%, transparent);
    stroke-width: 0.5;
  }
  .halo {
    fill: var(--dl-color-warm);
    opacity: 0.25;
  }
  .dot {
    fill: var(--dl-color-warm);
    stroke: var(--dl-color-bg);
    stroke-width: 1.5;
  }
  h2 {
    font-size: 24px;
    margin-bottom: 14px;
  }
  h3 {
    font-size: 16px;
    margin-bottom: 8px;
  }
  .block {
    margin-bottom: 44px;
  }
  .prose-block {
    max-width: 72ch;
  }
  .prices {
    width: 100%;
    border-collapse: collapse;
    font-size: 14.5px;
  }
  .prices th,
  .prices td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--dl-color-border);
  }
  .prices th {
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    font-weight: 500;
  }
  .people {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .person {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px 5px 6px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border-strong);
    text-decoration: none;
    color: var(--dl-color-text);
    font-weight: 500;
  }
  .person img {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
  }
  .person:hover {
    border-color: var(--dl-color-accent);
  }
  .nearby {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  }
  .nearby-site {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 2px;
    height: 100%;
    padding: 12px 14px;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s ease;
  }
  .nearby-site:hover {
    border-color: var(--dl-color-accent);
  }
  .nearby-name {
    font-weight: 500;
  }
  .nearby-meta {
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .site-charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 28px;
    margin-bottom: 16px;
  }
  .site-chart {
    min-width: 0;
  }
  .chart-title {
    font-size: 11px;
    font-family: var(--dl-font-mono);
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    margin-bottom: 8px;
  }
  .years {
    display: flex;
    gap: 6px;
    align-items: flex-end;
    height: 84px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .temps {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 4px;
    height: 84px;
    align-items: end;
  }
  .temp-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    gap: 3px;
  }
  .temp-bar {
    width: 100%;
    max-width: 22px;
    min-height: 2px;
    border-radius: 3px 3px 0 0;
    background: var(--dl-tag-drift);
  }
  .temp-bar.empty {
    background: var(--dl-color-surface-2);
  }
  .temp-value {
    font-size: 10.5px;
    color: var(--dl-color-text-muted);
  }
  .temp-label {
    font-size: 10.5px;
    color: var(--dl-color-text-faint);
  }
  .year {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    height: 100%;
    min-width: 44px;
    background: none;
    border: none;
    color: var(--dl-color-text-muted);
    font-size: 11.5px;
    cursor: pointer;
    padding: 0;
  }
  .year .bar {
    width: 22px;
    border-radius: 3px 3px 0 0;
    background: var(--dl-color-surface-2);
    transition: background 0.15s ease;
  }
  .year:hover .bar,
  .year.active .bar {
    background: var(--dl-color-accent);
  }
  .year.active {
    color: var(--dl-color-text);
  }
  .sources ul {
    margin: 0;
    padding-left: 20px;
    color: var(--dl-color-text-muted);
    font-size: 14px;
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 14px;
  }
  .private {
    border-top: 1px dashed var(--dl-color-warm);
    padding-top: 16px;
  }
  .private h3 {
    color: var(--dl-color-warm);
  }
  @media (max-width: 800px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
