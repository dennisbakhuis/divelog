<script lang="ts">
  import type { ImportSite } from '$lib/core/dive/types';
  import { importMatchLabel } from '$lib/core/dive/sharing';
  import { getDivelog } from '$lib/core/dive/context';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';

  const { urls } = getDivelog();

  let { sites }: { sites: ImportSite[] } = $props();
</script>

{#if sites.length}
  <table class="import-sites">
    <thead>
      <tr><th>Imported as</th><th>Site</th><th>How</th><th>Origin</th></tr>
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
{/if}

<style>
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
