<script lang="ts">
  import type { Snippet } from 'svelte';

  export type OwnerAction = { label: string; href: string; external?: boolean };

  let {
    edit,
    actions = [],
    note = null,
    compact = false,
    children,
  }: {
    /** The primary link: the editor page of the thing shown. */
    edit: OwnerAction;
    /** Secondary links, e.g. the maps editor of a site. */
    actions?: OwnerAction[];
    /** A short muted remark, e.g. "no route on the map yet". */
    note?: string | null;
    /** Inline links without the dashed box, for a nav row; a note gets a small dashed pill. */
    compact?: boolean;
    children?: Snippet;
  } = $props();
</script>

<div class="owner-bar" class:compact role="group" aria-label="Owner actions">
  <a
    class={compact ? 'owner-link' : 'dl-btn dl-btn-ghost dl-btn-sm'}
    href={edit.href}
    target={edit.external ? '_blank' : undefined}
    rel={edit.external ? 'noopener' : undefined}>✎ {edit.label}</a
  >
  {#each actions as action (action.href)}
    <a
      class={compact ? 'owner-link' : 'dl-btn dl-btn-ghost dl-btn-sm'}
      href={action.href}
      target={action.external ? '_blank' : undefined}
      rel={action.external ? 'noopener' : undefined}>{action.label}</a
    >
  {/each}
  {#if note}<span class="note">{note}</span>{/if}
  {#if children}{@render children()}{/if}
</div>

<style>
  .owner-bar {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin: 16px 0 0;
    padding: 10px 12px;
    border: 1px dashed var(--dl-color-warm);
    border-radius: var(--dl-radius);
  }
  .note {
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .owner-bar.compact {
    gap: 4px 12px;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
  }
  .owner-link {
    color: var(--dl-color-warm);
    text-decoration: none;
    white-space: nowrap;
  }
  .owner-link:hover {
    color: var(--dl-color-accent);
  }
  .compact .note {
    font-size: 12px;
    padding: 1px 8px;
    border: 1px dashed var(--dl-color-warm);
    border-radius: 999px;
    white-space: nowrap;
  }
</style>
