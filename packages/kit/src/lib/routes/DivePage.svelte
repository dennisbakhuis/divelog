<script lang="ts">
  import type { Snapshot } from '@sveltejs/kit';
  import type { WithComponent } from './pages';
  import type { PublicPageProps } from './public-pages';
  import { pageSnapshot, type PageSnapshot } from './snapshot';

  let { data }: { data: WithComponent<PublicPageProps> } = $props();

  const Page = $derived(data.component);
  let current = $state<{ snapshot?: Snapshot }>();

  export const snapshot: Snapshot<PageSnapshot> = pageSnapshot(
    () => data.page,
    () => current,
  );
</script>

<Page bind:this={current} {data} />
