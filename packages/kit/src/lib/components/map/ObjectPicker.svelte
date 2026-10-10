<script lang="ts">
  import MapGlyph from '$lib/components/dive/MapGlyph.svelte';
  import Toolbar from '$lib/components/ui/Toolbar.svelte';
  import { OBJECT_KINDS, type ObjectKind } from '$lib/core/dive/sitemap';

  let {
    value,
    onchange,
    compact = false,
  }: {
    value: ObjectKind;
    onchange: (kind: ObjectKind) => void;
    /** Icons only, the name kept for assistive technology and as a tooltip; for narrow panels. */
    compact?: boolean;
  } = $props();

  const items = OBJECT_KINDS.map((o) => ({ value: o.kind, label: o.label }));
</script>

<Toolbar
  {items}
  bind:value={() => value, (kind) => onchange(kind as ObjectKind)}
  label="Object"
  class="dl-object-picker{compact ? ' compact' : ''}"
  itemClass={() => 'dl-object-kind'}
>
  {#snippet item(tool)}
    <svg viewBox="-16 -16 32 32" aria-hidden="true"
      ><MapGlyph type="object" objectKind={tool.value as ObjectKind} /></svg
    >
    <span class:dl-visually-hidden={compact} title={compact ? tool.label : undefined}
      >{tool.label}</span
    >
  {/snippet}
</Toolbar>

<style>
  :global(.dl-object-picker .dl-object-kind) {
    --map-bg: var(--dl-color-bg-elevated);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 64px;
    padding: 5px 2px;
    border: 1px solid var(--dl-color-border-control);
    border-radius: 8px;
    background: var(--dl-color-bg-elevated);
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-xs);
    line-height: 1.1;
    cursor: pointer;
  }
  :global(.dl-object-picker.compact .dl-object-kind) {
    width: 36px;
    padding: 4px;
  }
  :global(.dl-object-picker .dl-object-kind:hover) {
    border-color: var(--dl-color-border-strong);
    color: var(--dl-color-text);
  }
  :global(.dl-object-picker .dl-object-kind.selected) {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-text);
    box-shadow: 0 0 0 1px var(--dl-color-accent);
  }
  svg {
    width: 28px;
    height: 28px;
    overflow: visible;
  }
  :global(.dl-object-picker.compact) svg {
    width: 24px;
    height: 24px;
  }
  span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
