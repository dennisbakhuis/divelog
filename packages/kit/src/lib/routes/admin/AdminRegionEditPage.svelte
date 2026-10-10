<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto, invalidateAll } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import { toast } from '$lib/components/stores/toast.svelte';
  import RegionForm from './RegionForm.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'region-edit'> } = $props();
  const region = $derived(data.region);
  let deleteError = $state('');

  async function remove() {
    if (!(await confirmDialog({ title: `Delete the region ${region.name}?`, danger: true })))
      return;
    deleteError = '';
    try {
      await adminJson(`/admin/regions/${region.id}`, 'DELETE');
      toast.show({ kind: 'success', message: `${region.name} deleted` });
      await goto(urls.admin.regions());
    } catch (err) {
      deleteError = err instanceof AdminApiError ? err.message : 'Could not delete';
    }
  }
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={urls.admin.sites()}>Sites</a> › <a href={urls.admin.regions()}>Regions</a> ›
  <span>{region.name}</span>
</nav>
<div class="head">
  <h1>{region.name}</h1>
  <a
    class="dl-btn dl-btn-ghost dl-btn-sm"
    href={urls.region(region.id)}
    target="_blank"
    rel="noopener">View ↗</a
  >
</div>

{#key region.id}
  <RegionForm {region} onSaved={() => invalidateAll()} />
{/key}

{#if region.sites.length}
  <section class="sites">
    <h2>Sites in this region</h2>
    <ul>
      {#each region.sites as s (s.slug)}
        <li><a href={urls.site(s.slug)} target="_blank" rel="noopener">{s.name} ↗</a></li>
      {/each}
    </ul>
  </section>
{/if}

<section class="danger-zone">
  <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm danger" onclick={remove}
    >Delete region</button
  >
  {#if region.sites.length}
    <span class="muted"
      >Refused while {region.sites.length} site{region.sites.length === 1 ? '' : 's'} use it.</span
    >
  {/if}
  {#if deleteError}<p class="error" role="alert">{deleteError}</p>{/if}
</section>

<style>
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
    gap: 14px;
    flex-wrap: wrap;
  }
  .sites {
    margin-bottom: 24px;
  }
  .sites h2 {
    font-size: 15px;
    margin: 0 0 8px;
  }
  .sites ul {
    margin: 0;
    padding-left: 18px;
    columns: 2;
    font-size: 14px;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 13.5px;
  }
  .danger-zone {
    border-top: 1px solid var(--dl-color-border);
    padding-top: 16px;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
</style>
