<script lang="ts">
  import type { Snapshot } from './$types';
  import { DivePage, type PageSnapshot } from '@divelog/kit/routes';

  let { data } = $props();

  let page = $state<{ snapshot: Snapshot<PageSnapshot> }>();

  export const snapshot: Snapshot<PageSnapshot> = {
    capture: () => page?.snapshot.capture() ?? null,
    restore: (saved) => page?.snapshot.restore(saved),
  };
</script>

<DivePage bind:this={page} {data} />
