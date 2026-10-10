<script lang="ts">
  import Combobox from '../Combobox.svelte';
  import Field from '../Field.svelte';
  import type { ComboOption } from '$lib/core/ui/combobox.js';

  let {
    value = $bindable(null),
    values = $bindable([]),
    multiple = false,
    options = [],
    source,
    known = [],
    error = '',
    required = false,
    onchange,
    onfooter,
  }: {
    value?: string | null;
    values?: string[];
    multiple?: boolean;
    options?: ComboOption[];
    source?: (query: string, signal: AbortSignal) => Promise<ComboOption[]>;
    known?: ComboOption[];
    error?: string;
    required?: boolean;
    onchange?: (selection: string | null | string[]) => void;
    onfooter?: (query: string) => void;
  } = $props();
</script>

<form onsubmit={(e) => e.preventDefault()}>
  <Field label="Site" hint="Recent sites first" {error} {required}>
    {#snippet children(control)}
      <Combobox
        {...control}
        bind:value
        bind:values
        {multiple}
        {options}
        {source}
        {known}
        debounce={50}
        name="site"
        onchange={(s) => onchange?.(s)}
      >
        {#snippet footer({ query, close })}
          <button
            type="button"
            class="new"
            onclick={() => {
              onfooter?.(query);
              close();
            }}>+ New site</button
          >
        {/snippet}
      </Combobox>
    {/snippet}
  </Field>
  <button type="button" class="after">After</button>
</form>
