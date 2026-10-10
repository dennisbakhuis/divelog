<script lang="ts">
  import type { Snapshot } from '@sveltejs/kit';
  import type { WithComponent } from './pages';
  import type { AdminPageProps } from './admin-pages';
  import { pageSnapshot, type PageSnapshot } from './snapshot';

  let { data }: { data: WithComponent<AdminPageProps> } = $props();

  const Page = $derived(data.component);
  let current = $state<{ snapshot?: Snapshot }>();

  export const snapshot: Snapshot<PageSnapshot> = pageSnapshot(
    () => data.page,
    () => current,
  );
</script>

<div id="dl-main" class="dl-main" tabindex="-1">
  <Page bind:this={current} {data} />
</div>
