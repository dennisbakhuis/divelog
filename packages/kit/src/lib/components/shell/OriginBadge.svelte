<script lang="ts">
  import type { SiteOrigin } from '$lib/core/dive/types';
  import { ORIGIN_LABEL } from '$lib/core/dive/sharing';

  let { origin, title }: { origin: SiteOrigin; title?: string } = $props();
</script>

<span class="dl-tag origin" data-origin={origin} {title}>{ORIGIN_LABEL[origin]}</span>

<style>
  .origin {
    font-size: 10px;
    padding: 1px 8px;
  }
</style>
