<script lang="ts">
  import { toast } from '$lib/components/stores/toast.svelte';
  import LiveRegion from '$lib/components/ui/LiveRegion.svelte';
</script>

<!--
  The container is always mounted. Toasts are announced through the live
  regions (polite for success and info, assertive for errors), so the visible
  items carry no live role of their own and nothing is read twice.
-->
<div class="toast-container divelog">
  <LiveRegion />
  {#each toast.items as item (item.id)}
    <div
      class="toast toast--{item.kind}"
      data-kind={item.kind}
      role="group"
      aria-label={item.kind === 'error' ? 'Error' : item.kind === 'success' ? 'Done' : 'Note'}
      onmouseenter={() => toast.pause(item.id)}
      onmouseleave={() => toast.resume(item.id)}
      onfocusin={() => toast.pause(item.id)}
      onfocusout={() => toast.resume(item.id)}
    >
      <span class="toast-message">{item.message}</span>
      <button
        type="button"
        class="toast-close"
        aria-label="Dismiss: {item.message}"
        onclick={() => toast.dismiss(item.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: min(24rem, calc(100vw - 2rem));
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-radius: var(--dl-radius);
    box-shadow: var(--dl-shadow-md);
    font-size: var(--dl-text-base);
    animation: toast-in 0.2s ease;
    pointer-events: auto;
  }
  .toast--success {
    background-color: var(--dl-color-success);
    color: var(--dl-color-success-fg);
  }
  .toast--error {
    background-color: var(--dl-color-danger);
    color: var(--dl-color-danger-fg);
  }
  .toast--info {
    background-color: var(--dl-color-info);
    color: var(--dl-color-info-fg);
  }
  .toast-message {
    flex: 1;
    line-height: 1.4;
  }
  .toast-close {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
    margin: -4px -6px -4px 0;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--dl-radius-sm);
    color: inherit;
    font-size: 1.5rem;
    line-height: 1;
    opacity: 0.85;
    cursor: pointer;
  }
  .toast-close:hover {
    opacity: 1;
  }
  .toast-close:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
