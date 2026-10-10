<script lang="ts">
  import { DiveNav, DivelogProvider } from '@divelog/kit';

  let { children, data } = $props();
</script>

<DivelogProvider config={data.divelogConfig}>
  <DiveNav />
  {@render children()}
</DivelogProvider>
