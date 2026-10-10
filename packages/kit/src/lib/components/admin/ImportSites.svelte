<script lang="ts">
  import type { ImportSite } from '$lib/core/dive/types';
  import { importMatchLabel } from '$lib/core/dive/sharing';
  import { getDivelog } from '$lib/core/dive/context';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';

  const { urls } = getDivelog();

  let { sites }: { sites: ImportSite[] } = $props();
</script>

{#if sites.length}
  <div class="table-wrap">
    <table class="import-sites">
      <caption class="dl-visually-hidden">How the imported sites resolved</caption>
      <thead>
        <tr
          ><th scope="col">Imported as</th><th scope="col">Site</th><th scope="col">How</th><th
            scope="col">Origin</th
          ></tr
        >
      </thead>
      <tbody>
        {#each sites as site (site.subsurface_uuid ?? `${site.name}|${site.site_id}`)}
          <tr class={site.outcome}>
            <td>{site.name}</td>
            <td><a href={urls.admin.site(site.site_id)}>{site.site_id}</a></td>
            <td class="how">{importMatchLabel(site)}</td>
            <td><OriginBadge origin={site.origin} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .table-wrap {
    overflow-x: auto;
  }
  .import-sites {
    margin-top: 12px;
  }
  .how {
    color: var(--dl-color-text-muted);
  }
  .created .how {
    color: var(--dl-color-warm);
  }
</style>
