<script lang="ts">
  import { goto } from '$app/navigation';
  import RegionForm from './RegionForm.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={urls.admin.sites()}>Sites</a> › <a href={urls.admin.regions()}>Regions</a> ›
  <span>New region</span>
</nav>
<h1>New region</h1>
<RegionForm onSaved={(region) => goto(urls.admin.region(region.id))} />

<style>
  .crumbs {
    font-size: 13.5px;
    color: var(--dl-color-text-faint);
    margin-bottom: 6px;
  }
  .crumbs a {
    color: var(--dl-color-text-muted);
  }
</style>
