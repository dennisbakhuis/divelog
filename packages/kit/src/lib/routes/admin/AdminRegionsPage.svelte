<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'regions'> } = $props();
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={urls.admin.sites()}>Sites</a> › <span>Regions</span>
</nav>
<div class="head">
  <h1>Regions <span class="muted dl-num">{data.regions.length}</span></h1>
  <a class="dl-btn dl-btn-solid dl-btn-sm" href={urls.admin.newRegion()}>+ New region</a>
</div>

<div class="table-wrap">
  <table>
    <caption class="dl-visually-hidden">Regions of the log</caption>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Id</th>
        <th scope="col">Country</th>
        <th scope="col">Waters</th>
        <th scope="col" class="n">Sites</th>
        <th scope="col" class="n">Dives</th>
        <th scope="col"><span class="dl-visually-hidden">Public page</span></th>
      </tr>
    </thead>
    <tbody>
      {#each data.regions as region (region.id)}
        <tr>
          <td><a href={urls.admin.region(region.id)}>{region.name}</a></td>
          <td class="muted">{region.id}</td>
          <td>{region.country ?? '—'}</td>
          <td>{region.waters.join(', ') || '—'}</td>
          <td class="n dl-num">{region.sites.length}</td>
          <td class="n dl-num">{region.dives}</td>
          <td class="row-actions"
            ><a href={urls.region(region.id)} target="_blank" rel="noopener"
              >view<span class="dl-visually-hidden"> {region.name} (opens in a new tab)</span>
              <span aria-hidden="true">↗</span></a
            ></td
          >
        </tr>
      {:else}
        <tr><td colspan="7" class="muted">No regions yet.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrap {
    overflow-x: auto;
  }
  .crumbs {
    font-size: 13.5px;
    color: var(--dl-color-text-faint);
    margin-bottom: 6px;
  }
  .crumbs a {
    color: var(--dl-color-text-muted);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 14px;
    font-weight: 400;
  }
  .n {
    text-align: right;
  }
  .row-actions {
    white-space: nowrap;
    text-align: right;
    font-size: 13px;
  }
</style>
