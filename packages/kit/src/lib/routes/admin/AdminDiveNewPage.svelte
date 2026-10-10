<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import DiveForm from '$lib/components/admin/DiveForm.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'dive-new'> } = $props();
</script>

<p class="crumbs"><a href={urls.admin.root()}>Dives</a> › new</p>
<h1>New dive</h1>
<p class="later">Photos, scans and computer exports can be added after the first save.</p>
<DiveForm
  dive={null}
  nextNumber={data.nextNumber}
  sites={data.sites}
  trips={data.trips}
  people={data.people}
  setups={data.setups}
  regions={data.regions}
  template={data.template}
/>

<style>
  .crumbs {
    font-size: 13px;
    color: var(--dl-color-text-faint);
    margin: 0 0 6px;
  }
  .later {
    font-size: 13px;
    color: var(--dl-color-text-faint);
    margin: -8px 0 16px;
  }
</style>
