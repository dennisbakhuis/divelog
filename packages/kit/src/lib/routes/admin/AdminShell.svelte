<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { adminJson } from '$lib/core/admin/client';
  import type { RepoStatus } from '$lib/core/dive/types';
  import { escapeRegExp, titleSuffix } from '$lib/core/dive/config';
  import { getDivelog } from '$lib/core/dive/context';
  import { formatDate } from '$lib/core/dive/format';
  import { shortRef } from '$lib/core/dive/sharing';
  import type { Snippet } from 'svelte';
  import CommonsStatus from '$lib/components/shell/CommonsStatus.svelte';
  import Popover from '$lib/components/ui/Popover.svelte';

  let { owner, children }: { owner: string | null; children: Snippet } = $props();

  const { config, urls } = getDivelog();

  /** Below this width the right-hand cluster folds into the "Menu" popover. */
  const NARROW_QUERY = '(max-width: 1099.98px)';

  const REPO_STATE: Record<string, string> = {
    clean: 'Everything is committed and pushed.',
    unpushed: 'Commits are waiting to be pushed.',
    pushing: 'Pushing to the remote…',
    conflict: 'The remote has changes that conflict with the log; pull and resolve.',
    error: 'The last git operation failed.',
    disabled: 'Git is off for this log; changes are saved to disk only.',
  };

  let repo = $state<RepoStatus | null>(null);
  let repoBusy = $state(false);
  let narrow = $state(false);
  let menuOpen = $state(false);
  let repoOpen = $state(false);

  async function refreshRepo() {
    try {
      repo = await adminJson<RepoStatus>('/admin/repo/status');
    } catch {
      repo = null;
    }
  }

  async function repoAction(action: 'push' | 'pull') {
    repoBusy = true;
    try {
      repo = await adminJson<RepoStatus>(`/admin/repo/${action}`, 'POST');
      if (action === 'pull') await invalidateAll();
    } catch {
      await refreshRepo();
    } finally {
      repoBusy = false;
    }
  }

  onMount(() => {
    if (owner) void refreshRepo();
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY) : null;
    if (!query) return;
    narrow = query.matches;
    const onChange = (e: MediaQueryListEvent) => {
      narrow = e.matches;
      if (!e.matches) menuOpen = false;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  $effect(() => {
    void page.url.pathname;
    menuOpen = false;
  });

  const admin = escapeRegExp(urls.admin.base);
  const under = (rest: string) => new RegExp(`^${admin}${rest}(\\/|$)`);
  const nav = [
    {
      href: urls.admin.root(),
      label: 'Dives',
      match: new RegExp(`^${admin}(\\/?$|\\/dives(\\/|$))`),
    },
    { href: urls.admin.sites(), label: 'Sites', match: under('\\/(sites|regions)') },
    { href: urls.admin.people(), label: 'People', match: under('\\/people') },
    { href: urls.admin.trips(), label: 'Trips', match: under('\\/trips') },
    { href: urls.admin.gear(), label: 'Gear', match: under('\\/gear') },
    { href: urls.admin.import(), label: 'Import', match: under('\\/import') },
  ];

  function active(item: { match: RegExp }): boolean {
    return item.match.test(page.url.pathname);
  }

  const repoText = $derived.by(() => {
    if (!repo) return '';
    const errors = repo.load_errors.length;
    return [
      repo.state,
      repo.ahead ? ` ↑${repo.ahead}` : '',
      repo.behind ? ` ↓${repo.behind}` : '',
      errors ? ` · ${errors} file ${errors === 1 ? 'error' : 'errors'}` : '',
    ].join('');
  });
  const canPush = $derived(
    !!repo && (repo.state === 'unpushed' || repo.state === 'conflict' || repo.state === 'error'),
  );
  const attention = $derived(!!repo && repo.state !== 'clean' && repo.state !== 'disabled');

  async function logout() {
    await adminJson('/auth/logout', 'POST');
    await invalidateAll();
    await goto(urls.admin.login());
  }
</script>

<svelte:head>
  <title>Admin — {titleSuffix(config)}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet repoDetails(status: RepoStatus)}
  <span class="anchor">
    <Popover bind:open={repoOpen} label="Repository status" class="repo-panel">
      {#snippet trigger(props)}
        <button {...props} class="repo repo-{status.state}"
          ><span class="dl-visually-hidden">{'Repository: '}</span>{repoText}</button
        >
      {/snippet}
      {#snippet children({ close })}
        <p class="repo-line">
          <strong>{status.state}</strong>{#if REPO_STATE[status.state]}
            · {REPO_STATE[status.state]}{/if}
        </p>
        <dl class="repo-facts dl-num">
          {#if status.head}<div>
              <dt>Head</dt>
              <dd>{shortRef(status.head)}{status.dirty ? ' · uncommitted changes' : ''}</dd>
            </div>{/if}
          <div>
            <dt>Ahead · behind</dt>
            <dd>{status.ahead} · {status.behind}</dd>
          </div>
          {#if status.last_push_at}<div>
              <dt>Last push</dt>
              <dd>
                {formatDate(status.last_push_at.slice(0, 10))}
                {status.last_push_at.slice(11, 16)}
              </dd>
            </div>{/if}
        </dl>
        {#if status.last_error}<p class="repo-error">{status.last_error}</p>{/if}
        {#if status.load_errors.length}
          <p class="repo-sub">Files that did not load:</p>
          <ul class="repo-errors">
            {#each status.load_errors as error, i (i)}<li>{error}</li>{/each}
          </ul>
        {/if}
        <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => close()}
          >Close</button
        >
      {/snippet}
    </Popover>
  </span>
{/snippet}

{#snippet cluster()}
  {#if repo}
    {@render repoDetails(repo)}
    <CommonsStatus
      {repo}
      onPulled={async () => {
        await refreshRepo();
        await invalidateAll();
      }}
    />
    {#if canPush}
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        disabled={repoBusy}
        onclick={() => repoAction('push')}>push</button
      >
    {/if}
    {#if repo.state !== 'disabled'}
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        disabled={repoBusy}
        onclick={() => repoAction('pull')}>pull</button
      >
    {/if}
  {/if}
  <a href={urls.log()} class="muted">view site</a>
  <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={logout}>Sign out</button>
{/snippet}

<div class="admin">
  {#if owner}
    <header class="bar">
      <a class="brand" href={urls.admin.root()}>dive log admin</a>
      <nav class="sections" aria-label="Admin sections">
        {#each nav as item (item.href)}
          <a href={item.href} aria-current={active(item) ? 'page' : undefined}>{item.label}</a>
        {/each}
      </nav>
      <div class="right">
        <a href={urls.admin.newDive()} class="dl-btn dl-btn-sm new-dive">+ New dive</a>
        {#if !narrow}
          <div class="cluster">{@render cluster()}</div>
        {/if}
        <span class="anchor menu-anchor">
          <Popover bind:open={menuOpen} label="Admin menu" focus="first" class="menu-panel">
            {#snippet trigger(props)}
              <button {...props} class="dl-btn dl-btn-ghost dl-btn-sm menu-trigger">
                Menu{#if attention && repo}<span
                    class="menu-dot repo-{repo.state}"
                    aria-hidden="true"
                  ></span><span class="dl-visually-hidden">, repository {repo.state}</span>{/if}
              </button>
            {/snippet}
            {#snippet children()}
              <div class="menu-body">{@render cluster()}</div>
            {/snippet}
          </Popover>
        </span>
      </div>
    </header>
  {/if}
  <div class="admin-body dl-admin-body">
    {@render children()}
  </div>
</div>

<style>
  .admin {
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    background: var(--dl-c-abyss);
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px 20px;
    padding: 10px var(--dl-space-page-x);
    border-bottom: 1px solid var(--dl-color-border);
    background: var(--dl-color-bg);
    flex-wrap: wrap;
  }
  .brand {
    font-family: var(--dl-font-mono);
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--dl-color-accent);
    white-space: nowrap;
  }
  .sections {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 2px;
  }
  .sections::-webkit-scrollbar {
    display: none;
  }
  .sections a {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    text-decoration: none;
    color: var(--dl-color-text-muted);
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 14px;
  }
  .sections a:hover,
  .sections a[aria-current='page'] {
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .cluster {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .new-dive {
    white-space: nowrap;
  }
  .anchor {
    position: relative;
    display: inline-flex;
  }
  .menu-anchor {
    display: none;
  }
  .menu-trigger {
    position: relative;
    white-space: nowrap;
  }
  .menu-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dl-color-warm);
  }
  .menu-dot.repo-conflict,
  .menu-dot.repo-error {
    background: var(--dl-color-error);
  }
  .menu-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    min-width: 220px;
  }
  .menu-body :global(.heads) {
    flex-wrap: wrap;
    white-space: normal;
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 13px;
    text-decoration: none;
  }
  .repo {
    font: inherit;
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    min-height: 24px;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border-control);
    background: none;
    color: var(--dl-color-text-muted);
    white-space: nowrap;
    cursor: pointer;
  }
  .repo-clean {
    color: var(--dl-color-success);
  }
  .repo-unpushed,
  .repo-pushing {
    color: var(--dl-color-warm);
  }
  .repo-conflict,
  .repo-error {
    color: var(--dl-color-error);
    border-color: var(--dl-color-error);
  }
  .anchor :global(.repo-panel) {
    width: min(380px, calc(100vw - 32px));
  }
  .menu-body .anchor :global(.repo-panel) {
    left: 0;
    right: auto;
  }
  .repo-line,
  .repo-sub,
  .repo-error {
    margin: 0 0 8px;
  }
  .repo-error {
    color: var(--dl-color-error);
  }
  .repo-facts {
    display: grid;
    gap: 4px;
    margin: 0 0 8px;
    font-size: var(--dl-text-sm);
  }
  .repo-facts div {
    display: flex;
    gap: 8px;
  }
  .repo-facts dt {
    color: var(--dl-color-text-muted);
    min-width: 8em;
  }
  .repo-facts dd {
    margin: 0;
  }
  .repo-errors {
    margin: 0 0 8px;
    padding-left: 18px;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .admin-body {
    flex: 1;
    padding: 24px var(--dl-space-page-x) 80px;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
  }
  @media (max-width: 1099.98px) {
    .cluster {
      display: none;
    }
    .menu-anchor {
      display: inline-flex;
    }
    .sections {
      order: 3;
      flex: 1 1 100%;
    }
  }
</style>
