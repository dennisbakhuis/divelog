<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import OwnerBar, { type OwnerAction } from '$lib/components/shell/OwnerBar.svelte';
  import { backHref } from '$lib/core/dive/back';
  import { stateFrom } from './follow';

  let {
    back,
    label = 'Page navigation',
    owner = null,
    backTo = $bindable(),
    children,
  }: {
    /** The link back to the list this page belongs to. */
    back: { href: string; label: string };
    /** Accessible name of the navigation landmark; unique on the page. */
    label?: string;
    /** Owner links, rendered inline after the back link; null for visitors. */
    owner?: { edit: OwnerAction; actions?: OwnerAction[]; note?: string | null } | null;
    /**
     * Read-only: where the back link points, i.e. `back.href` or the filtered
     * list the visitor came from. Bind it to hand the same list on to the next page.
     */
    backTo?: string;
    /** Whatever sits on the right, e.g. a prev / next pager. */
    children?: Snippet;
  } = $props();

  let navigatedFrom = $state<URL | null>(null);
  let referrer = $state<string | null>(null);
  let mounted = $state(false);

  afterNavigate(({ from }) => {
    navigatedFrom = from?.url ?? null;
  });

  onMount(() => {
    referrer = document.referrer || null;
    mounted = true;
  });

  const href = $derived(
    mounted
      ? backHref(back.href, {
          stateFrom: stateFrom(page.state),
          navigatedFrom,
          referrer,
          origin: page.url.origin,
        })
      : back.href,
  );

  $effect(() => {
    backTo = href;
  });
</script>

<nav class="detail-top" aria-label={label}>
  <span class="left">
    <a class="back" {href}><span aria-hidden="true">←</span> {back.label}</a>
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
