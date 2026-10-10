<script lang="ts">
  import ConfirmHost from '../ConfirmHost.svelte';
  import { confirmDialog, type ConfirmOptions } from '$lib/core/ui/confirm.js';

  let { options, answers }: { options: ConfirmOptions; answers: boolean[] } = $props();
</script>

<button type="button" class="ask" onclick={async () => answers.push(await confirmDialog(options))}
  >Delete</button
>
<ConfirmHost />
