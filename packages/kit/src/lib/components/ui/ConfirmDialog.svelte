<script lang="ts">
  import Dialog from './Dialog.svelte';

  let {
    open = $bindable(false),
    title,
    body = '',
    confirmLabel = '',
    cancelLabel = 'Cancel',
    danger = false,
    onconfirm,
    oncancel,
  }: {
    open?: boolean;
    title: string;
    body?: string;
    /** Default "Delete" when `danger`, otherwise "Confirm". */
    confirmLabel?: string;
    cancelLabel?: string;
    /** A destructive action: danger button, and focus starts on Cancel. */
    danger?: boolean;
    onconfirm?: () => void;
    /** Cancel button, Escape, backdrop or the close button. */
    oncancel?: () => void;
  } = $props();

  let confirmed = false;

  function confirm() {
    confirmed = true;
    open = false;
  }

  function closed() {
    if (confirmed) onconfirm?.();
    else oncancel?.();
    confirmed = false;
  }
</script>

<Dialog
  bind:open
  {title}
  description={body}
  size="sm"
  showClose={false}
  initialFocus={danger ? '.dl-confirm-cancel' : '.dl-confirm-ok'}
  class="dl-confirm"
  onclose={closed}
>
  {#snippet footer()}
    <button
      type="button"
      class="dl-btn dl-btn-ghost dl-btn-sm dl-confirm-cancel"
      onclick={() => (open = false)}>{cancelLabel}</button
    >
    <button
      type="button"
      class="dl-btn dl-btn-sm dl-confirm-ok"
      class:dl-btn-danger={danger}
      class:dl-btn-solid={!danger}
      onclick={confirm}>{confirmLabel || (danger ? 'Delete' : 'Confirm')}</button
    >
  {/snippet}
</Dialog>
