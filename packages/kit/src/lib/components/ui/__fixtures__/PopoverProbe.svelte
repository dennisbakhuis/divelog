<script lang="ts">
  import Popover from '../Popover.svelte';

  let {
    open = $bindable(false),
    focus = 'panel',
  }: { open?: boolean; focus?: 'panel' | 'first' | 'none' } = $props();
</script>

<div class="wrap" style="position: relative">
  <Popover bind:open label="Repo notices" {focus}>
    {#snippet trigger(props)}<button {...props} class="trigger">2 notices</button>{/snippet}
    {#snippet children({ close })}
      <a href="/admin/sites/x" class="link">edit</a>
      <button type="button" class="close" onclick={close}>Close</button>
    {/snippet}
  </Popover>
</div>
<button type="button" class="outside">Elsewhere</button>
