<script lang="ts">
  import DivelogProvider from '$lib/components/dive/DivelogProvider.svelte';
  import { DEFAULT_CONFIG } from '$lib/core/dive/config.js';

  let { main = true }: { main?: boolean } = $props();
</script>

<DivelogProvider config={DEFAULT_CONFIG}>
  {#if main}<div id="dl-main" tabindex="-1">Content</div>{/if}
</DivelogProvider>
