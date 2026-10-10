<script lang="ts">
  import type { CommonsPullOut, RepoStatus } from '$lib/core/dive/types';
  import { noticeSiteId, shortRef } from '$lib/core/dive/sharing';
  import { getDivelog } from '$lib/core/dive/context';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import OriginBadge from './OriginBadge.svelte';

  const { urls } = getDivelog();

  let {
    repo,
    onPulled,
  }: {
    repo: RepoStatus;
    /** After a commons pull: refresh the repo status and the page data. */
    onPulled?: () => void | Promise<void>;
  } = $props();

  let open = $state<'notices' | 'pull' | null>(null);
  let pulling = $state(false);
  let pulled = $state<CommonsPullOut | null>(null);
  let pullError = $state('');

  const logHead = $derived(shortRef(repo.head));
  const commonsHead = $derived(shortRef(repo.commons_head));
  const hasCommons = $derived(repo.commons_state !== null);
  const gitDisabled = $derived(repo.commons_state === 'disabled');

  const toggle = (what: 'notices' | 'pull') => (open = open === what ? null : what);

  async function pull() {
    pulling = true;
    pullError = '';
    pulled = null;
    open = 'pull';
    try {
      pulled = await adminJson<CommonsPullOut>(adminApi('commons', 'pull'), 'POST');
      await onPulled?.();
    } catch (err) {
      pullError = err instanceof AdminApiError ? err.message : 'The commons pull failed';
    } finally {
      pulling = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = null)} />

<span class="heads dl-num" title="Checked-out commits of the log and the sites commons">
  {#if logHead}<span class="head">log {logHead}</span>{/if}
  {#if commonsHead || hasCommons}
    <span class="head commons"
      >commons {commonsHead ?? '—'}{repo.commons_state ? ` · ${repo.commons_state}` : ''}</span
    >
  {/if}
</span>

{#if repo.notices.length || hasCommons}
  <span class="anchor">
    {#if repo.notices.length}
      <button
        type="button"
        class="badge"
        aria-expanded={open === 'notices'}
        aria-controls="dl-repo-notices"
        title="Notices from the last load"
        onclick={() => toggle('notices')}
        >{repo.notices.length} {repo.notices.length === 1 ? 'notice' : 'notices'}</button
      >
    {/if}
    {#if hasCommons}
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm pull"
        disabled={gitDisabled || pulling}
        title={gitDisabled
          ? 'Git is disabled for the commons on the server (COMMONS_GIT_ENABLED)'
          : 'Fetch the latest commons and pin the log to it'}
        onclick={pull}>{pulling ? 'pulling…' : 'pull commons'}</button
      >
    {/if}
    {#if open === 'notices'}
      <div class="popover dl-card" id="dl-repo-notices" role="dialog" aria-label="Repo notices">
        <ul>
          {#each repo.notices as notice, i (i)}
            {@const siteId = noticeSiteId(notice)}
            <li>
              {notice}
              {#if siteId}<a href={urls.admin.site(siteId)} onclick={() => (open = null)}>edit</a
                >{/if}
            </li>
          {/each}
        </ul>
      </div>
    {:else if open === 'pull'}
      <div class="popover dl-card" role="dialog" aria-label="Commons pull">
        {#if pulling}
          <p>Pulling the commons…</p>
        {:else if pullError}
          <p class="error">{pullError}</p>
        {:else if pulled}
          <p class="dl-num">
            {#if pulled.previous_head === pulled.head}
              Commons already at {shortRef(pulled.head) ?? '—'}
            {:else}
              Commons {shortRef(pulled.previous_head) ?? '—'} → {shortRef(pulled.head) ?? '—'}
            {/if}
            {#if pulled.pinned}<span class="muted">· log pinned</span>{/if}
          </p>
          {#if pulled.stale.length}
            <p class="muted">Stale against the commons now:</p>
            <ul>
              {#each pulled.stale as stale (stale.site_id)}
                <li>
                  <a href={urls.admin.site(stale.site_id)} onclick={() => (open = null)}
                    >{stale.site_id}</a
                  >
                  <OriginBadge origin={stale.origin} />
                  <span class="dl-num"
                    >r{stale.pinned_revision ?? '—'} → r{stale.current_revision}</span
                  >
                  {#if stale.new}<span class="new">new</span>{/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted">No overlay or fork is stale.</p>
          {/if}
        {/if}
        <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => (open = null)}
          >Close</button
        >
      </div>
    {/if}
  </span>
{/if}

<style>
  .heads {
    display: inline-flex;
    gap: 8px;
    font-family: var(--dl-font-mono);
    font-size: 11px;
    color: var(--dl-color-text-faint);
    white-space: nowrap;
  }
  .anchor {
    position: relative;
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .badge {
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-warm);
    background: var(--dl-color-warm-soft);
    color: var(--dl-color-warm);
    cursor: pointer;
    white-space: nowrap;
  }
  .pull {
    white-space: nowrap;
  }
  .popover {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 20;
    width: min(420px, 90vw);
    max-height: 60vh;
    overflow: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    background: var(--dl-color-bg-elevated);
    box-shadow: var(--dl-shadow-md);
    font-size: 13px;
  }
  .popover p {
    margin: 0;
  }
  .popover ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--dl-color-text-muted);
  }
  .popover li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .popover a {
    font-size: 12px;
  }
  .muted {
    color: var(--dl-color-text-faint);
  }
  .new {
    font-family: var(--dl-font-mono);
    font-size: 10px;
    text-transform: uppercase;
    color: var(--dl-color-warm);
  }
  .error {
    color: var(--dl-color-error);
  }
</style>
