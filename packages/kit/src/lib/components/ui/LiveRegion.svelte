<script lang="ts">
  import { registerLiveRegion } from '$lib/core/ui/announce.js';

  let polite = $state('');
  let assertive = $state('');

  $effect(() =>
    registerLiveRegion(({ text, politeness }) => {
      if (politeness === 'assertive') assertive = text;
      else polite = text;
    }),
  );
</script>

<div class="dl-visually-hidden dl-live" role="status" aria-live="polite" aria-atomic="true">
  {polite}
</div>
<div class="dl-visually-hidden dl-live" role="alert" aria-live="assertive" aria-atomic="true">
  {assertive}
</div>
