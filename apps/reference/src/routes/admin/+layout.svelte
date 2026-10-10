<script lang="ts">
  import { DivelogProvider } from '@divelog/kit';
  import { AdminShell } from '@divelog/kit/routes';

  let { children, data } = $props();

  const config = $derived({ ...data.divelogConfig, devHints: import.meta.env.DEV });
</script>

<DivelogProvider {config}>
  <AdminShell owner={data.owner}>
    {@render children()}
  </AdminShell>
</DivelogProvider>
