<script lang="ts">
  import Toolbar, { type ToolItem } from '../Toolbar.svelte';

  let {
    value = $bindable('add'),
    mode = 'radio',
    orientation = 'horizontal',
    onchange,
  }: {
    value?: string;
    mode?: 'radio' | 'pressed';
    orientation?: 'horizontal' | 'vertical';
    onchange?: (v: string) => void;
  } = $props();

  const items: ToolItem[] = [
    { value: 'add', label: 'Station', hint: 'Click to add a station', shortcut: 'A' },
    { value: 'survey', label: 'Survey', disabled: true },
    { value: 'connect', label: 'Connect', shortcut: 'C' },
    { value: 'move', label: 'Move' },
  ];
</script>

<Toolbar
  {items}
  bind:value
  label="Tool"
  {mode}
  {orientation}
  {onchange}
  itemClass={(t, selected) => `dl-btn dl-btn-sm ${selected ? 'dl-btn-solid' : 'dl-btn-ghost'}`}
/>
