<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { DivelogConfig } from '$lib/core/dive/config';
  import { setDivelog } from '$lib/core/dive/context';
  import { configureAdminClient } from '$lib/core/admin/client';
  import SkipLink from '$lib/components/ui/SkipLink.svelte';
  import LiveRegion from '$lib/components/ui/LiveRegion.svelte';
  import ConfirmHost from '$lib/components/ui/ConfirmHost.svelte';

  let {
    config,
    skipLink = true,
    children,
  }: {
    config: DivelogConfig;
    /** Render the "Skip to content" link to `#dl-main` (shown only when a page has it). */
    skipLink?: boolean;
    children: Snippet;
  } = $props();

  // svelte-ignore state_referenced_locally
  setDivelog(config);
  // svelte-ignore state_referenced_locally
  configureAdminClient(config.apiBase);
</script>

<div class="divelog" style="display: contents">
  {#if skipLink}<SkipLink />{/if}
  {@render children()}
  <LiveRegion />
  <ConfirmHost />
</div>
