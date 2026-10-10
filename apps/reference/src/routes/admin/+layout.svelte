<script lang="ts">
  import { DivelogProvider } from '@divelog/kit';
  import { AdminShell } from '@divelog/kit/routes';

  let { children, data } = $props();
</script>

<DivelogProvider config={data.divelogConfig}>
  <AdminShell owner={data.owner}>
    {@render children()}
  </AdminShell>
</DivelogProvider>
