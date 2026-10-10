<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    summary,
    open = $bindable(false),
    persistKey = '',
    count = null,
    class: className = '',
    ontoggle,
    label,
    children,
  }: {
    /** Summary text; or pass a `label` snippet for richer content. */
    summary?: string;
    open?: boolean;
    /** Remember the open state in `localStorage` under `dl-disclosure:<key>`. */
    persistKey?: string;
    /** A count badge after the summary (filled fields, errors, items). */
    count?: number | string | null;
    class?: string;
    ontoggle?: (open: boolean) => void;
    label?: Snippet;
    children: Snippet;
  } = $props();

  const storageKey = $derived(persistKey ? `dl-disclosure:${persistKey}` : '');

  function readStored(key: string): boolean | null {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw === '1' ? true : raw === '0' ? false : null;
    } catch {
      return null;
    }
  }

  function store(key: string, value: boolean) {
    try {
      globalThis.localStorage?.setItem(key, value ? '1' : '0');
    } catch {
      // storage blocked: the state just isn't remembered
    }
  }

  $effect.pre(() => {
    if (!storageKey) return;
    const stored = readStored(storageKey);
    if (stored !== null) open = stored;
  });

  function onToggle(e: Event & { currentTarget: HTMLDetailsElement }) {
    const now = e.currentTarget.open;
    if (now === open) return;
    open = now;
    if (storageKey) store(storageKey, now);
    ontoggle?.(now);
  }
</script>

<details class="dl-disclosure {className}" {open} ontoggle={onToggle}>
  <summary class="dl-disclosure-summary">
    <span class="dl-disclosure-label">
      {#if label}{@render label()}{:else}{summary}{/if}
    </span>
    {#if count !== null && count !== undefined && count !== ''}
      <span class="dl-disclosure-count">{count}</span>
    {/if}
  </summary>
  <div class="dl-disclosure-body">{@render children()}</div>
</details>

<style>
  .dl-disclosure {
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  .dl-disclosure-summary {
    display: flex;
    align-items: center;
    gap: var(--dl-space-2);
    min-height: 44px;
    padding: var(--dl-space-2) var(--dl-space-4);
    cursor: pointer;
    list-style: none;
    font-family: var(--dl-font-display);
    font-weight: 600;
    font-size: var(--dl-text-lg);
    color: var(--dl-color-text);
    border-radius: var(--dl-radius);
  }
  .dl-disclosure-summary::-webkit-details-marker {
    display: none;
  }
  .dl-disclosure-summary::before {
    content: '';
    flex: none;
    width: 0.5em;
    height: 0.5em;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(-45deg);
    transition: transform 0.15s ease;
    color: var(--dl-color-text-muted);
  }
  .dl-disclosure[open] > .dl-disclosure-summary::before {
    transform: rotate(45deg);
  }
  .dl-disclosure-count {
    margin-left: auto;
    min-width: 1.6em;
    padding: 1px var(--dl-space-2);
    border-radius: 999px;
    background: var(--dl-color-surface-2);
    border: 1px solid var(--dl-color-border-strong);
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-sm);
    font-weight: 500;
    text-align: center;
    color: var(--dl-color-text-muted);
  }
  .dl-disclosure-body {
    padding: 0 var(--dl-space-4) var(--dl-space-4);
  }
</style>
