<script lang="ts">
  import Disclosure from '../Disclosure.svelte';

  let {
    open = $bindable(false),
    persistKey = '',
    count = null,
  }: { open?: boolean; persistKey?: string; count?: number | null } = $props();
</script>

<Disclosure summary="Transcription" bind:open {persistKey} {count}>
  <p class="inside">Paper log fields</p>
</Disclosure>
