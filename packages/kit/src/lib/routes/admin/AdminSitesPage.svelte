<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import type { Site } from '$lib/core/dive/types';
  import { getDivelog } from '$lib/core/dive/context';
  import { pinMessage } from '$lib/core/dive/revision';
  import { matchesOrigin, ORIGIN_FILTERS, type OriginFilter } from '$lib/core/dive/sharing';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'sites'> } = $props();

  let query = $state('');
  let country = $state('');
  let origin = $state<OriginFilter>('all');

  const regionNames = $derived(Object.fromEntries(data.regions.map((r) => [r.id, r.name])));
  const countries = $derived(
    [...new Set(data.sites.map((s) => s.country ?? '').filter(Boolean))].sort(),
  );

  const drawnCount = (site: Site) => site.maps.filter((m) => m.collection === 'drawn').length;

  const rows = $derived(
    data.sites.filter((s) => {
      if (country && s.country !== country) return false;
      if (!matchesOrigin(s, origin)) return false;
      const q = query.trim().toLowerCase();
      return (
        !q ||
        `${s.name} ${s.area ?? ''} ${s.country_name} ${s.id} ${s.aliases.join(' ')}`
          .toLowerCase()
          .includes(q)
      );
    }),
  );
</script>

<div class="head">
  <h1>Dive sites <span class="muted dl-num">{data.sites.length}</span></h1>
  <a class="secondary" href={urls.admin.regions()}>Regions</a>
  <a class="dl-btn dl-btn-solid dl-btn-sm new" href={urls.admin.newSite()}>+ New site</a>
</div>

<div class="toolbar" role="search" aria-label="Filter sites">
  <div class="filter">
    <label for="sites-q">Search</label>
    <input
      id="sites-q"
      class="dl-input"
      type="search"
      placeholder="Name, area, alias or id"
      bind:value={query}
    />
  </div>
  <div class="filter">
    <label for="sites-country">Country</label>
    <select id="sites-country" class="dl-select" bind:value={country}>
      <option value="">All countries</option>
      {#each countries as c (c)}<option value={c}>{c}</option>{/each}
    </select>
  </div>
  <div class="filter">
    <label for="sites-origin">Origin</label>
    <select id="sites-origin" class="dl-select" bind:value={origin}>
      {#each ORIGIN_FILTERS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
    </select>
  </div>
  <span class="muted dl-num shown" aria-live="polite">{rows.length} shown</span>
</div>

<div class="table-wrap">
  <table>
    <caption class="dl-visually-hidden">Dive sites in the log</caption>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Country</th>
        <th scope="col">Type</th>
        <th scope="col">Region</th>
        <th scope="col">Origin</th>
        <th scope="col" class="n">Dives</th>
        <th scope="col" class="n">Drawn maps</th>
        <th scope="col"><span class="dl-visually-hidden">Public page</span></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as site (site.id)}
        <tr>
          <td
            ><a href={urls.admin.site(site.id)}>{site.name}</a>{#if site.area}<span class="muted">
                · {site.area}</span
              >{/if}{#if site.private?.pin?.stale}
              <span class="dl-tag stale" title={pinMessage(site.private.pin)}>stale</span>{/if}</td
          >
          <td>{site.country ?? site.country_code}</td>
          <td>{site.site_type}</td>
          <td>{site.region ? (regionNames[site.region] ?? site.region) : '—'}</td>
          <td
            ><OriginBadge
              origin={site.origin}
              title={site.forked_from ? `forked from ${site.forked_from}` : undefined}
            /></td
          >
          <td class="n dl-num">{site.dives}</td>
          <td class="n dl-num">{drawnCount(site) || '—'}</td>
          <td class="row-actions"
            ><a href={urls.site(site.slug)} target="_blank" rel="noopener"
              >view<span class="dl-visually-hidden"> {site.name} (opens in a new tab)</span>
              <span aria-hidden="true">↗</span></a
            ></td
          >
        </tr>
      {:else}
        <tr><td colspan="8" class="muted">No sites match.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .head h1 {
    margin-right: auto;
  }
  .secondary {
    font-size: 14px;
    color: var(--dl-color-text-muted);
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 14px;
    font-weight: 400;
  }
  .toolbar {
    display: flex;
    gap: var(--dl-space-3);
    align-items: flex-end;
    margin-bottom: var(--dl-space-3);
    flex-wrap: wrap;
  }
  .filter {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .filter label {
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .filter input {
    width: min(320px, 100%);
  }
  .filter select {
    width: auto;
  }
  .shown {
    padding-bottom: 10px;
  }
  .table-wrap {
    overflow-x: auto;
  }
  .new {
    min-height: 32px;
  }
  @media (max-width: 560px) {
    .filter,
    .filter input,
    .filter select {
      width: 100%;
    }
  }
  .n {
    text-align: right;
  }
  .stale {
    --dl-tag-color: var(--dl-color-warm);
    margin-left: 6px;
    font-size: 10px;
  }
  .row-actions {
    white-space: nowrap;
    text-align: right;
    font-size: 13px;
  }
</style>
