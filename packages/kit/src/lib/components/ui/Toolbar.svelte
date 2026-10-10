<script lang="ts" module>

  /** One tool: `value` is what the group selects. */
  export interface ToolItem {
    value: string;
    label: string;
    /** Longer help, linked as the button's description (and its tooltip). */
    hint?: string;
    /** A single-key shortcut shown as `<kbd>` and exposed as `aria-keyshortcuts`. */
    shortcut?: string;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';

  let {
    items,
    value = $bindable(''),
    label,
    mode = 'radio',
    orientation = 'horizontal',
    showShortcuts = true,
    class: className = '',
    itemClass,
    onchange,
    item: itemSnippet,
  }: {
    items: ToolItem[];
    /** The selected tool. */
    value?: string;
    /** Accessible name of the group ("Tool", "Annotation tool", "Object"). */
    label: string;
    /**
     * `radio`: a radiogroup of `role="radio"` buttons with `aria-checked`.
     * `pressed`: a `role="toolbar"` of toggle buttons with `aria-pressed`.
     */
    mode?: 'radio' | 'pressed';
    orientation?: 'horizontal' | 'vertical';
    /** Show the shortcut keys next to the labels. */
    showShortcuts?: boolean;
    class?: string;
    /** Classes per button, e.g. `dl-btn dl-btn-sm` plus solid/ghost by state. */
    itemClass?: (item: ToolItem, selected: boolean) => string;
    onchange?: (value: string) => void;
    /** Custom button content: `{#snippet item(tool, selected)}…{/snippet}`; default label + shortcut. */
    item?: Snippet<[ToolItem, boolean]>;
  } = $props();

  const propsId = $props.id();
  const uid = `dl-toolbar-${propsId}`;
  const enabled = $derived(items.filter((t) => !t.disabled));
  const focusable = $derived(
    enabled.some((t) => t.value === value) ? value : (enabled[0]?.value ?? ''),
  );
  let buttons: Record<string, HTMLButtonElement> = {};

  function select(next: string) {
    if (next === value) return;
    value = next;
    onchange?.(next);
  }

  function onkeydown(e: KeyboardEvent) {
    const prevKeys = orientation === 'vertical' ? ['ArrowUp'] : ['ArrowLeft', 'ArrowUp'];
    const nextKeys = orientation === 'vertical' ? ['ArrowDown'] : ['ArrowRight', 'ArrowDown'];
    const values = enabled.map((t) => t.value);
    const current = (e.target as HTMLElement | null)?.dataset?.value ?? focusable;
    const at = values.indexOf(current);
    let next: string | undefined;
    if (nextKeys.includes(e.key)) next = values[(at + 1) % values.length];
    else if (prevKeys.includes(e.key)) next = values[(at - 1 + values.length) % values.length];
    else if (e.key === 'Home') next = values[0];
    else if (e.key === 'End') next = values[values.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    if (mode === 'radio') select(next);
    const target = next;
    tick().then(() => buttons[target]?.focus());
  }
</script>

<div
  class="dl-toolbar {className}"
  class:dl-toolbar--vertical={orientation === 'vertical'}
  role={mode === 'radio' ? 'radiogroup' : 'toolbar'}
  aria-label={label}
  aria-orientation={mode === 'pressed' ? orientation : undefined}
  tabindex="-1"
  {onkeydown}
>
  {#each items as t (t.value)}
    {@const selected = t.value === value}
    <button
      bind:this={buttons[t.value]}
      type="button"
      data-value={t.value}
      class={itemClass ? itemClass(t, selected) : 'dl-tool'}
      class:selected
      role={mode === 'radio' ? 'radio' : undefined}
      aria-checked={mode === 'radio' ? selected : undefined}
      aria-pressed={mode === 'pressed' ? selected : undefined}
      aria-describedby={t.hint ? `${uid}-${t.value}-hint` : undefined}
      aria-keyshortcuts={t.shortcut || undefined}
      title={t.hint}
      tabindex={t.value === focusable ? 0 : -1}
      disabled={t.disabled}
      onclick={() => select(t.value)}
    >
      {#if itemSnippet}
        {@render itemSnippet(t, selected)}
      {:else}
        <span>{t.label}</span>
        {#if t.shortcut && showShortcuts}<kbd class="dl-tool-key" aria-hidden="true"
            >{t.shortcut}</kbd
          >{/if}
      {/if}
    </button>
  {/each}
  {#each items as t (t.value)}
    {#if t.hint}<span class="dl-visually-hidden" id="{uid}-{t.value}-hint">{t.hint}</span>{/if}
  {/each}
</div>

<style>
  .dl-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dl-space-1);
  }
  .dl-toolbar:focus {
    outline: none;
  }
  .dl-toolbar--vertical {
    flex-direction: column;
  }
  .dl-tool {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 5px 10px;
    border: 1px solid var(--dl-color-border-control);
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-bg-elevated);
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-md);
    cursor: pointer;
  }
  .dl-tool:hover {
    color: var(--dl-color-text);
  }
  .dl-tool.selected {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-text);
    background: var(--dl-color-accent-soft);
  }
  .dl-tool:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .dl-tool-key {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-xs);
    padding: 0 4px;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: 4px;
    color: var(--dl-color-text-faint);
  }
</style>
