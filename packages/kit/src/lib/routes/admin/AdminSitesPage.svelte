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

<div class="toolbar">
  <input type="search" placeholder="Search sites…" bind:value={query} />
  <select bind:value={country} aria-label="Country">
    <option value="">All countries</option>
    {#each countries as c (c)}<option value={c}>{c}</option>{/each}
  </select>
  <select bind:value={origin} aria-label="Origin">
    {#each ORIGIN_FILTERS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
  </select>
  <span class="muted dl-num">{rows.length} shown</span>
</div>

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Country</th>
      <th>Type</th>
      <th>Region</th>
      <th>Origin</th>
      <th class="n">Dives</th>
      <th class="n">Drawn maps</th>
      <th></th>
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
          ><a href={urls.site(site.slug)} target="_blank" rel="noopener">view ↗</a></td
        >
      </tr>
    {:else}
      <tr><td colspan="8" class="muted">No sites match.</td></tr>
    {/each}
  </tbody>
</table>

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
    gap: 10px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .toolbar input {
    max-width: 320px;
  }
  .toolbar select {
    width: auto;
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
