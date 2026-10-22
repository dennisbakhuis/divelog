<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import DiveForm from '$lib/components/admin/DiveForm.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'dive-new'> } = $props();

  let created = $state(0);
  const formKey = $derived(`${JSON.stringify(data.prefill)}|${created}`);
</script>

<p class="crumbs"><a href={urls.admin.dives()}>Dives</a> › new</p>
<div class="head">
  <h1>New dive</h1>
  <a class="dl-btn dl-btn-ghost dl-btn-sm" href={`${urls.admin.import()}#shearwater-cloud`}
    >Import from Shearwater</a
  >
</div>
{#key formKey}
  <DiveForm
    dive={null}
    nextNumber={data.nextNumber}
    sites={data.sites}
    trips={data.trips}
    people={data.people}
    setups={data.setups}
    regions={data.regions}
    template={data.template}
    prefill={data.prefill}
    onSavedNew={() => created++}
  />
{/key}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--dl-space-3);
    margin-bottom: var(--dl-space-3);
  }
  .head h1 {
    margin-bottom: 0;
  }
  .crumbs {
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-faint);
    margin: 0 0 6px;
  }
</style>
