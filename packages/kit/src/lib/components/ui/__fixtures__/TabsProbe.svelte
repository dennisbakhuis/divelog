<script lang="ts">
  import Tabs, { type TabItem } from '../Tabs.svelte';

  let {
    tabs = [
      { id: 'story', label: 'Story' },
      { id: 'original', label: 'As written' },
      { id: 'off', label: 'Off', disabled: true },
      { id: 'logbook', label: 'Logbook page' },
    ],
    active = $bindable('story'),
    hash = false,
    onchange,
  }: {
    tabs?: TabItem[];
    active?: string;
    hash?: boolean;
    onchange?: (id: string) => void;
  } = $props();
</script>

<Tabs {tabs} bind:active label="Notes" {hash} {onchange} idPrefix="t">
  {#snippet panel(id)}<p class="content">Panel {id}</p>{/snippet}
</Tabs>
