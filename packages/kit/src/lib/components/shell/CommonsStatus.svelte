<script lang="ts">
  import type { RepoStatus } from '$lib/core/dive/types';
  import { noticeSiteId, shortRef } from '$lib/core/dive/sharing';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { repo }: { repo: RepoStatus } = $props();

  let open = $state(false);
  const logHead = $derived(shortRef(repo.head));
  const commonsHead = $derived(shortRef(repo.commons_head));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<span class="heads dl-num" title="Checked-out commits of the log and the sites commons">
  {#if logHead}<span class="head">log {logHead}</span>{/if}
  {#if commonsHead || repo.commons_state}
    <span class="head commons"
      >commons {commonsHead ?? '—'}{repo.commons_state ? ` · ${repo.commons_state}` : ''}</span
    >
  {/if}
</span>

{#if repo.notices.length}
  <span class="notices">
    <button
      type="button"
      class="badge"
      aria-expanded={open}
      aria-controls="dl-repo-notices"
      title="Notices from the last load"
      onclick={() => (open = !open)}
      >{repo.notices.length} {repo.notices.length === 1 ? 'notice' : 'notices'}</button
    >
    {#if open}
      <div class="popover dl-card" id="dl-repo-notices" role="dialog" aria-label="Repo notices">
        <ul>
          {#each repo.notices as notice, i (i)}
            {@const siteId = noticeSiteId(notice)}
            <li>
              {notice}
              {#if siteId}<a href={urls.admin.site(siteId)} onclick={() => (open = false)}>edit</a
                >{/if}
            </li>
          {/each}
        </ul>
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
  .notices {
    position: relative;
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
  .popover {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 20;
    width: min(420px, 90vw);
    max-height: 60vh;
    overflow: auto;
    padding: 10px 12px;
    background: var(--dl-color-bg-elevated);
    box-shadow: var(--dl-shadow-md);
  }
  .popover ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .popover a {
    margin-left: 6px;
    font-size: 12px;
  }
</style>
