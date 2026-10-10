<script lang="ts">
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import type { Site } from '$lib/core/dive/types';
  import { pinMessage } from '$lib/core/dive/revision';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';
  import ChangeList from '$lib/components/shell/ChangeList.svelte';
  import Disclosure from '$lib/components/ui/Disclosure.svelte';

  const { urls } = getDivelog();

  let {
    site,
    onChanged,
  }: {
    site: Site;
    /** The site came back changed (pin reviewed, fork dropped). */
    onChanged: (site: Site) => void | Promise<void>;
  } = $props();

  const pin = $derived(site.private?.pin ?? null);
  let busy = $state(false);

  async function markReviewed() {
    if (!pin) return;
    busy = true;
    try {
      const pinned = await adminJson<Site>(adminApi('sites', site.id, 'pin'), 'POST');
      toast.show({
        kind: 'success',
        message: `${site.name} reviewed against commons revision ${pin.current_revision}`,
      });
      await onChanged(pinned);
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not mark as reviewed',
      });
    } finally {
      busy = false;
    }
  }

  async function dropFork() {
    if (
      !(await confirmDialog({
        title: `Drop your fork of ${site.name}?`,
        body: 'Your copy is deleted and the commons record takes its place again.',
        confirmLabel: 'Drop fork',
        danger: true,
      }))
    )
      return;
    busy = true;
    try {
      await adminJson(adminApi('sites', site.id), 'DELETE');
      const restored = await adminJson<Site>(adminApi('sites', site.id));
      toast.show({ kind: 'success', message: `${site.name} is back on the commons record` });
      await onChanged(restored);
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not drop the fork',
      });
    } finally {
      busy = false;
    }
  }
</script>

<header class="site-head">
  <div class="title-row">
    <h1>{site.name}</h1>
    <OriginBadge origin={site.origin} />
    {#if site.forked_from}<span class="chip">forked from {site.forked_from}</span>{/if}
    {#if pin}
      <span class="chip pin" class:stale={pin.stale} data-pin={pin.stale ? 'stale' : 'current'}
        >{pin.stale
          ? `commons moved: r${pin.pinned_revision ?? '–'} → r${pin.current_revision}`
          : `commons r${pin.current_revision}`}</span
      >
    {/if}
    <a
      class="dl-btn dl-btn-ghost dl-btn-sm view"
      href={urls.site(site.slug)}
      target="_blank"
      rel="noopener"
      >View <span aria-hidden="true">↗</span><span class="dl-visually-hidden">
        (opens in a new tab)</span
      ></a
    >
  </div>
  <Disclosure count={site.changelog.length || null} persistKey="site-revision">
    {#snippet label()}Revision {site.revision}{#if pin?.stale}<span class="warn"
          >· review needed</span
        >{/if}{/snippet}
    <div class="revision">
      {#if pin}
        <div class="pin-row" class:stale={pin.stale}>
          <span>{pinMessage(pin)}</span>
          {#if pin.stale}
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              disabled={busy}
              onclick={markReviewed}
              >{busy
                ? 'Marking…'
                : `Mark as reviewed against revision ${pin.current_revision}`}</button
            >
          {/if}
        </div>
      {/if}
      {#if site.origin === 'fork'}
        <div class="pin-row">
          <span
            >Your fork shadows the commons record. Dropping it deletes your copy and the commons
            record takes its place again.</span
          >
          <button
            type="button"
            class="dl-btn dl-btn-danger dl-btn-sm"
            disabled={busy}
            onclick={dropFork}
            >{busy ? 'Dropping…' : 'Drop fork, back to the commons record'}</button
          >
        </div>
      {/if}
      <ChangeList entries={site.changelog} />
      <p class="hint">The revision moves when a field of the record itself changes.</p>
    </div>
  </Disclosure>
</header>

<style>
  .site-head {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-2);
    margin-bottom: var(--dl-space-4);
  }
  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-2) var(--dl-space-3);
  }
  h1 {
    margin: 0;
  }
  .chip {
    font-size: var(--dl-text-xs);
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border-control);
    color: var(--dl-color-text-muted);
  }
  .chip.stale {
    border-color: var(--dl-color-warm);
    color: var(--dl-color-warm);
  }
  .view {
    margin-left: auto;
  }
  .warn {
    margin-left: 6px;
    color: var(--dl-color-warm);
  }
  .revision {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-3);
  }
  .pin-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-2) var(--dl-space-3);
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-muted);
  }
  .pin-row.stale {
    color: var(--dl-color-warm);
  }
  .hint {
    margin: 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
  }
  @media (max-width: 560px) {
    .view {
      margin-left: 0;
    }
  }
</style>
