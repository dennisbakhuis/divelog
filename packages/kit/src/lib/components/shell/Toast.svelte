<script lang="ts">
  import { toast } from '$lib/components/stores/toast.svelte';
</script>

{#if toast.items.length > 0}
  <div class="toast-container divelog" aria-live="polite" aria-atomic="false">
    {#each toast.items as item (item.id)}
      <div class="toast toast--{item.kind}" role="alert">
        <span class="toast-message">{item.message}</span>
        <button
          type="button"
          class="toast-close"
          aria-label="Close"
          onclick={() => toast.dismiss(item.id)}
        >
          ×
        </button>
      </div>
    {/each}
  </div>
{/if}

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
  }
  .toast {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-radius: var(--dl-radius);
    box-shadow: var(--dl-shadow-md);
    color: #06101f;
    font-size: 15px;
    animation: toast-in 0.2s ease;
  }
  .toast--success {
    background-color: var(--dl-color-success);
  }
  .toast--error {
    background-color: var(--dl-color-error);
  }
  .toast-message {
    flex: 1;
    line-height: 1.4;
  }
  .toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: inherit;
    font-size: 1.5rem;
    line-height: 1;
    padding: 0;
    opacity: 0.8;
  }
  .toast-close:hover {
    opacity: 1;
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
</style>
