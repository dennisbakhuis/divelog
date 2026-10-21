<script lang="ts" module>
  /** Elements a dialog may move focus to, in DOM order. */
  export const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';

  let {
    open = $bindable(false),
    title = '',
    label = '',
    description = '',
    size = 'md',
    bare = false,
    closeOnBackdrop = true,
    showClose = true,
    closeLabel = 'Close',
    initialFocus = '',
    returnFocus = null,
    class: className = '',
    onclose,
    children,
    footer,
  }: {
    /** Whether the dialog is shown; set it to open, the dialog clears it when it closes. */
    open?: boolean;
    /** Visible heading; becomes the accessible name. */
    title?: string;
    /** Accessible name when there is no visible title (a lightbox). */
    label?: string;
    /** A line under the title, linked with `aria-describedby`. */
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'full';
    /** No panel chrome: content on the dimmed backdrop (image lightbox). */
    bare?: boolean;
    /** A click on the backdrop closes the dialog. */
    closeOnBackdrop?: boolean;
    showClose?: boolean;
    closeLabel?: string;
    /** CSS selector inside the dialog to focus on open; default the first control. */
    initialFocus?: string;
    /** Where focus goes after closing; default the element that had focus on open. */
    returnFocus?: HTMLElement | null;
    class?: string;
    /** Called after the dialog closed, whatever closed it. */
    onclose?: () => void;
    children?: Snippet;
    /** Action buttons, right-aligned under the content. */
    footer?: Snippet;
  } = $props();

  const propsId = $props.id();
  const uid = `dl-dialog-${propsId}`;
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  let dialog = $state<HTMLDialogElement>();
  let opener: HTMLElement | null = null;

  function isShown(el: HTMLDialogElement): boolean {
    return el.open || el.hasAttribute('open');
  }

  function focusInitial(el: HTMLDialogElement) {
    const target =
      (initialFocus && el.querySelector<HTMLElement>(initialFocus)) ||
      el.querySelector<HTMLElement>('[autofocus]') ||
      el.querySelector<HTMLElement>(`.dl-dialog-content :is(${FOCUSABLE})`) ||
      el.querySelector<HTMLElement>(`.dl-dialog-footer :is(${FOCUSABLE})`) ||
      el.querySelector<HTMLElement>('.dl-dialog-close') ||
      el;
    target.focus();
  }

  function show(el: HTMLDialogElement) {
    if (isShown(el)) return;
    const active = document.activeElement;
    opener = returnFocus ?? (active instanceof HTMLElement ? active : null);
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    focusInitial(el);
  }

  function hide(el: HTMLDialogElement) {
    if (!isShown(el)) return;
    if (typeof el.close === 'function' && el.open) el.close();
    else el.removeAttribute('open');
    finish();
  }

  function finish() {
    const target = opener;
    opener = null;
    if (target?.isConnected) target.focus();
    onclose?.();
  }

  $effect(() => {
    const el = dialog;
    const shouldOpen = open;
    if (!el) return;
    untrack(() => (shouldOpen ? show(el) : hide(el)));
  });

  $effect(() => {
    const el = dialog;
    return () => {
      if (el && isShown(el)) {
        const target = opener;
        opener = null;
        if (target?.isConnected) target.focus();
      }
    };
  });

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    open = false;
  }

  function oncancel(e: Event) {
    e.preventDefault();
    open = false;
  }

  function onNativeClose() {
    if (open) {
      open = false;
      finish();
    }
  }

  function onclick(e: MouseEvent) {
    if (!closeOnBackdrop) return;
    const target = e.target as Element | null;
    const onBackdrop =
      target === dialog || (bare && !!target?.matches?.('.dl-dialog-panel, .dl-dialog-content'));
    if (onBackdrop) open = false;
  }
</script>

<dialog
  bind:this={dialog}
  class="dl-dialog dl-dialog--{size} {className}"
  class:dl-dialog--bare={bare}
  aria-labelledby={title ? titleId : undefined}
  aria-label={!title && label ? label : undefined}
  aria-describedby={description ? descId : undefined}
  {onkeydown}
  {oncancel}
  onclose={onNativeClose}
  {onclick}
>
  {#if open}
    <div class="dl-dialog-panel">
      {#if title || showClose}
        <div class="dl-dialog-head">
          {#if title}<h2 class="dl-dialog-title" id={titleId}>{title}</h2>{/if}
          {#if showClose}
            <button
              type="button"
              class="dl-dialog-close"
              aria-label={closeLabel}
              onclick={() => (open = false)}><span aria-hidden="true">×</span></button
            >
          {/if}
        </div>
      {/if}
      {#if description}<p class="dl-dialog-desc" id={descId}>{description}</p>{/if}
      {#if children}<div class="dl-dialog-content">{@render children()}</div>{/if}
      {#if footer}<div class="dl-dialog-footer">{@render footer()}</div>{/if}
    </div>
  {/if}
</dialog>

<style>
  .dl-dialog {
    padding: 0;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    color: var(--dl-color-text);
    box-shadow: var(--dl-shadow-md);
    width: min(var(--dl-dialog-w, 560px), calc(100vw - 2 * var(--dl-space-4)));
    max-height: calc(100dvh - 2 * var(--dl-space-4));
    overflow: auto;
    overscroll-behavior: contain;
  }
  :global(:root:has(dialog.dl-dialog:modal)) {
    overflow: hidden;
  }
  .dl-dialog--sm {
    --dl-dialog-w: 420px;
  }
  .dl-dialog--lg {
    --dl-dialog-w: 860px;
  }
  .dl-dialog--full {
    --dl-dialog-w: 100vw;
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }
  .dl-dialog::backdrop {
    background: rgba(3, 9, 18, 0.8);
  }
  .dl-dialog--bare {
    background: transparent;
    border: none;
    box-shadow: none;
  }
  .dl-dialog--bare::backdrop {
    background: rgba(3, 9, 18, 0.92);
  }
  .dl-dialog-panel {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-3);
    padding: var(--dl-space-5);
  }
  .dl-dialog--bare .dl-dialog-panel {
    height: 100%;
    padding: var(--dl-space-6);
    position: relative;
  }
  .dl-dialog-head {
    display: flex;
    align-items: flex-start;
    gap: var(--dl-space-3);
  }
  .dl-dialog--bare .dl-dialog-head {
    position: absolute;
    top: var(--dl-space-3);
    right: var(--dl-space-4);
    z-index: 1;
  }
  .dl-dialog-title {
    flex: 1;
    margin: 0;
    font-family: var(--dl-font-display);
    font-size: var(--dl-text-xl);
    line-height: 1.3;
  }
  .dl-dialog-close {
    flex: none;
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--dl-radius-sm);
    background: none;
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-2xl);
    line-height: 1;
    cursor: pointer;
  }
  .dl-dialog--bare .dl-dialog-close {
    color: #fff;
    font-size: 2.25rem;
    min-width: 44px;
    min-height: 44px;
  }
  @media (pointer: coarse) {
    .dl-dialog-close {
      min-width: var(--dl-tap-min, 44px);
      min-height: var(--dl-tap-min, 44px);
    }
  }
  .dl-dialog-close:hover {
    color: var(--dl-color-text);
    border-color: var(--dl-color-border-strong);
  }
  .dl-dialog-desc {
    margin: 0;
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-base);
  }
  .dl-dialog-content {
    min-width: 0;
  }
  .dl-dialog--bare .dl-dialog-content {
    height: 100%;
  }
  .dl-dialog-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--dl-space-2);
    padding-top: var(--dl-space-2);
  }
</style>
