<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import DiveForm from '$lib/components/admin/DiveForm.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'dive-new'> } = $props();

  const formKey = $derived(`${data.nextNumber}|${JSON.stringify(data.prefill)}`);
</script>

<p class="crumbs"><a href={urls.admin.dives()}>Dives</a> › new</p>
<h1>New dive</h1>
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
  />
{/key}

<style>
  .crumbs {
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-faint);
    margin: 0 0 6px;
  }
</style>
