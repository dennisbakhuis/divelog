<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { DivelogConfig } from '$lib/core/dive/config';
  import { setDivelog } from '$lib/core/dive/context';
  import { configureAdminClient } from '$lib/core/admin/client';

  let { config, children }: { config: DivelogConfig; children: Snippet } = $props();

  // svelte-ignore state_referenced_locally
  setDivelog(config);
  // svelte-ignore state_referenced_locally
  configureAdminClient(config.apiBase);
</script>

<div class="divelog" style="display: contents">
  {@render children()}
</div>
