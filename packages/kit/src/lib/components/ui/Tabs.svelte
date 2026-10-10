<script lang="ts" module>

  /** One tab: `id` is what `active` holds and, with `hash`, what the URL hash shows. */
  export interface TabItem {
    id: string;
    label: string;
    /** Extra classes on the tab button (e.g. a dashed border for a private map). */
    class?: string;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount, tick } from 'svelte';

  let {
    tabs,
    active = $bindable(''),
    label,
    variant = 'underline',
    hash = false,
    idPrefix = '',
    listClass = '',
    tablistAlways = false,
    onchange,
    tab,
    panel,
  }: {
    tabs: TabItem[];
    /** Id of the selected tab; an unknown id selects the first enabled tab. */
    active?: string;
    /** Accessible name of the tab list. */
    label: string;
    variant?: 'underline' | 'pills';
    /** Read the selected tab from `location.hash` on mount and write it back on change. */
    hash?: boolean;
    /** Prefix of the generated tab and panel ids; generated when empty. */
    idPrefix?: string;
    /** Extra classes on the tab list. */
    listClass?: string;
    /** Show the tab list for a single tab too (by default one tab renders only its panel). */
    tablistAlways?: boolean;
    onchange?: (id: string) => void;
    /** Custom tab content: `{#snippet tab(item, selected)}…{/snippet}`; default the label. */
    tab?: Snippet<[TabItem, boolean]>;
    /** Content of the selected panel: `{#snippet panel(id)}…{/snippet}`. */
    panel: Snippet<[string]>;
  } = $props();

  const propsId = $props.id();
  const uid = `dl-tabs-${propsId}`;
  const prefix = $derived(idPrefix || uid);
  const enabled = $derived(tabs.filter((t) => !t.disabled));
  const current = $derived(
    tabs.some((t) => t.id === active && !t.disabled) ? active : (enabled[0]?.id ?? ''),
  );
  const showList = $derived(tabs.length > 1 || tablistAlways);
  let buttons: Record<string, HTMLButtonElement> = {};

  const tabId = (id: string) => `${prefix}-tab-${id}`;
  const panelId = (id: string) => `${prefix}-panel-${id}`;

  function writeHash(id: string) {
    if (!hash || typeof location === 'undefined') return;
    const url = `${location.pathname}${location.search}#${encodeURIComponent(id)}`;
    try {
      history.replaceState(history.state, '', url);
    } catch {
      // a sandboxed frame or a router that refuses: the tab still switches
    }
  }

  function select(id: string, focus = false) {
    if (id === current) {
      if (focus) buttons[id]?.focus();
      return;
    }
    active = id;
    onchange?.(id);
    writeHash(id);
    if (focus) tick().then(() => buttons[id]?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    const ids = enabled.map((t) => t.id);
    const at = ids.indexOf(current);
    let next: string | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = ids[(at + 1) % ids.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = ids[(at - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    select(next, true);
  }

  onMount(() => {
    if (!hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && tabs.some((t) => t.id === id && !t.disabled) && id !== current) {
      active = id;
      onchange?.(id);
    }
  });
</script>

{#if showList}
  <div
    class="dl-tabs dl-tabs--{variant} {listClass}"
    role="tablist"
    aria-label={label}
    tabindex="-1"
    {onkeydown}
  >
    {#each tabs as t (t.id)}
      {@const selected = t.id === current}
      <button
        bind:this={buttons[t.id]}
        type="button"
        role="tab"
        id={tabId(t.id)}
        aria-selected={selected}
        aria-controls={panelId(t.id)}
        tabindex={selected ? 0 : -1}
        disabled={t.disabled}
        class="dl-tab {t.class ?? ''}"
        class:active={selected}
        onclick={() => select(t.id)}
      >
        {#if tab}{@render tab(t, selected)}{:else}{t.label}{/if}
      </button>
    {/each}
  </div>
{/if}
{#each tabs as t (t.id)}
  {@const selected = t.id === current}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="dl-tabpanel"
    role={showList ? 'tabpanel' : undefined}
    id={panelId(t.id)}
    aria-labelledby={showList ? tabId(t.id) : undefined}
    tabindex={showList && selected ? 0 : undefined}
    hidden={!selected}
  >
    {#if selected}{@render panel(t.id)}{/if}
  </div>
{/each}

<style>
  .dl-tabs {
    display: flex;
    gap: var(--dl-space-1);
  }
  .dl-tabs:focus {
    outline: none;
  }
  .dl-tabs--underline {
    margin-bottom: var(--dl-space-4);
    border-bottom: 1px solid var(--dl-color-border);
    overflow-x: auto;
  }
  .dl-tabs--underline .dl-tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--dl-space-2) 14px;
    margin-bottom: -1px;
    color: var(--dl-color-text-muted);
    font-family: var(--dl-font-display);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .dl-tabs--underline .dl-tab.active {
    color: var(--dl-color-text);
    border-bottom-color: var(--dl-color-accent);
  }
  .dl-tabs--pills {
    flex-wrap: wrap;
    align-items: center;
  }
  .dl-tabs--pills .dl-tab {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 5px var(--dl-space-3);
    border: 1px solid var(--dl-color-border-control);
    border-radius: 999px;
    background: none;
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-md);
    cursor: pointer;
  }
  .dl-tabs--pills .dl-tab.active {
    color: var(--dl-color-text);
    border-color: var(--dl-color-accent);
    background: var(--dl-color-accent-soft);
  }
  .dl-tab:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .dl-tabpanel:focus {
    outline: none;
  }
  .dl-tabpanel:focus-visible {
    outline: var(--dl-focus-ring);
    outline-offset: var(--dl-focus-offset);
  }
</style>
