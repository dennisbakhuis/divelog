<script lang="ts">
  import DivelogProvider from '$lib/components/dive/DivelogProvider.svelte';
  import ContextProbe from './ContextProbe.svelte';
  import type { DivelogConfig } from '../config';
  import type { Divelog } from '../context';

  let { config, onread }: { config: DivelogConfig; onread: (divelog: Divelog) => void } = $props();
</script>

<DivelogProvider {config}>
  <ContextProbe {onread} />
</DivelogProvider>
