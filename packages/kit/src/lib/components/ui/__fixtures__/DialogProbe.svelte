<script lang="ts">
  import Dialog from '../Dialog.svelte';

  let {
    open = $bindable(false),
    bare = false,
    onclose,
  }: { open?: boolean; bare?: boolean; onclose?: () => void } = $props();
</script>

<button type="button" class="opener" onclick={() => (open = true)}>Open</button>
<Dialog
  bind:open
  title={bare ? '' : 'Edit tank'}
  label="Photo"
  description="Cylinder and gas"
  {bare}
  {onclose}
>
  <input class="first" aria-label="Volume" />
  {#snippet footer()}
    <button type="button" class="save" onclick={() => (open = false)}>Save</button>
  {/snippet}
</Dialog>
