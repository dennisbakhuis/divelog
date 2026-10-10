<script lang="ts">
  import type { Snippet } from 'svelte';
  import OwnerBar, { type OwnerAction } from '$lib/components/shell/OwnerBar.svelte';

  let {
    back,
    owner = null,
    children,
  }: {
    /** The link back to the list this page belongs to. */
    back: { href: string; label: string };
    /** Owner links, rendered inline after the back link; null for visitors. */
    owner?: { edit: OwnerAction; actions?: OwnerAction[]; note?: string | null } | null;
    /** Whatever sits on the right, e.g. a prev / next pager. */
    children?: Snippet;
  } = $props();
</script>

<nav class="detail-top">
  <span class="left">
    <a class="back" href={back.href}>← {back.label}</a>
    {#if owner}
      <OwnerBar compact edit={owner.edit} actions={owner.actions ?? []} note={owner.note ?? null} />
    {/if}
  </span>
  {#if children}<span class="right">{@render children()}</span>{/if}
</nav>

<style>
  .detail-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-size: 14px;
    margin-bottom: 28px;
  }
  .left,
  .right {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 14px;
    min-width: 0;
  }
  .right {
    justify-content: flex-end;
  }
  .back {
    text-decoration: none;
    color: var(--dl-color-text-muted);
  }
  .back:hover {
    color: var(--dl-color-accent);
  }
  .left :global(.owner-bar)::before {
    content: '·';
    margin-right: 8px;
    color: var(--dl-color-text-faint);
  }
</style>
