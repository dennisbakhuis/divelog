<script lang="ts">
  import Field from '../Field.svelte';

  let {
    error = '',
    hint = '',
    id = '',
    layout = 'stacked',
    describedby = '',
  }: {
    error?: string;
    hint?: string;
    id?: string;
    layout?: 'stacked' | 'horizontal';
    describedby?: string;
  } = $props();
</script>

<Field label="Max depth (m)" {error} {hint} {id} {layout} {describedby}>
  {#snippet children(control)}<input {...control} class="dl-input" type="number" />{/snippet}
  {#snippet extra()}<span class="chip">from #649</span>{/snippet}
</Field>
