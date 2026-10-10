<script lang="ts">
  import { registerConfirmHost, type ConfirmRequest } from '$lib/core/ui/confirm.js';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let queue = $state<ConfirmRequest[]>([]);
  let open = $state(false);
  const current = $derived(queue[0]);

  $effect(() => {
    const off = registerConfirmHost((request) => {
      queue.push(request);
      open = true;
    });
    return () => {
      off();
      for (const request of queue) request.resolve(false);
    };
  });

  function answer(ok: boolean) {
    const request = queue.shift();
    request?.resolve(ok);
    if (queue.length) queueMicrotask(() => (open = true));
  }
</script>

{#if current}
  {#key current.id}
    <ConfirmDialog
      bind:open
      title={current.title}
      body={current.body}
      confirmLabel={current.confirmLabel}
      cancelLabel={current.cancelLabel}
      danger={current.danger}
      onconfirm={() => answer(true)}
      oncancel={() => answer(false)}
    />
  {/key}
{/if}
