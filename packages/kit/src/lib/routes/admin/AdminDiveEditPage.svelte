<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import DiveForm from '$lib/components/admin/DiveForm.svelte';
  import Attachments from '$lib/components/admin/Attachments.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'dive-edit'> } = $props();
</script>

<p class="crumbs"><a href={urls.admin.root()}>Dives</a> › #{data.dive.number}</p>
<h1>
  Dive #{data.dive.number}{#if data.dive.title || data.dive.site}<span class="sub">
      {data.dive.title || data.dive.site?.name}</span
    >{/if}
</h1>
{#key data.dive.number}
  <DiveForm
    dive={data.dive}
    nextNumber={data.dive.number}
    sites={data.sites}
    trips={data.trips}
    people={data.people}
    setups={data.setups}
    regions={data.regions}
  />
{/key}
<Attachments dive={data.dive} />

<style>
  .crumbs {
    font-size: 13px;
    color: var(--dl-color-text-faint);
    margin: 0 0 6px;
  }
  .sub {
    font-size: 16px;
    font-weight: 400;
    color: var(--dl-color-text-muted);
    margin-left: 10px;
  }
</style>
