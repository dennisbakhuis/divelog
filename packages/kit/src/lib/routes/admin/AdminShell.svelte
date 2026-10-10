<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { adminJson } from '$lib/core/admin/client';
  import type { RepoStatus } from '$lib/core/dive/types';
  import { escapeRegExp, titleSuffix } from '$lib/core/dive/config';
  import { getDivelog } from '$lib/core/dive/context';
  import type { Snippet } from 'svelte';
  import CommonsStatus from '$lib/components/shell/CommonsStatus.svelte';

  let { owner, children }: { owner: string | null; children: Snippet } = $props();

  const { config, urls } = getDivelog();

  let repo = $state<RepoStatus | null>(null);
  let repoBusy = $state(false);

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
  });

  const admin = escapeRegExp(urls.admin.base);
  const under = (rest: string) => new RegExp(`^${admin}${rest}(\\/|$)`);
  const nav = [
    { href: urls.admin.root(), label: 'Dives', match: under('(\\/dives(?!\\/new))?') },
    { href: urls.admin.sites(), label: 'Sites', match: under('\\/(sites|regions)') },
    { href: urls.admin.people(), label: 'People', match: under('\\/people') },
    { href: urls.admin.trips(), label: 'Trips', match: under('\\/trips') },
    { href: urls.admin.gear(), label: 'Gear', match: under('\\/gear') },
    { href: urls.admin.import(), label: 'Import', match: under('\\/import') },
  ];

  function active(item: { match: RegExp }): boolean {
    return item.match.test(page.url.pathname);
  }

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

<div class="admin">
  {#if owner}
    <header class="bar">
      <a class="brand" href={urls.admin.root()}>dive log admin</a>
      <nav>
        {#each nav as item (item.href)}
          <a href={item.href} aria-current={active(item) ? 'page' : undefined}>{item.label}</a>
        {/each}
      </nav>
      <div class="right">
        <a href={urls.admin.newDive()} class="dl-btn dl-btn-sm new-dive">+ New dive</a>
        {#if repo}
          <span
            class="repo repo-{repo.state}"
            title={repo.last_error ?? (repo.load_errors.length ? repo.load_errors.join('\n') : '')}
          >
            {repo.state}{repo.ahead ? ` ↑${repo.ahead}` : ''}{repo.behind
              ? ` ↓${repo.behind}`
              : ''}{repo.load_errors.length ? ` · ${repo.load_errors.length} file errors` : ''}
          </span>
          <CommonsStatus {repo} />
          {#if repo.state === 'unpushed' || repo.state === 'conflict' || repo.state === 'error'}
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
        <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={logout}
          >Sign out</button
        >
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
    gap: 20px;
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
  }
  nav {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  nav a {
    text-decoration: none;
    color: var(--dl-color-text-muted);
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 14px;
  }
  nav a:hover,
  nav a[aria-current='page'] {
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .new-dive {
    white-space: nowrap;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 13px;
    text-decoration: none;
  }
  .repo {
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border);
    color: var(--dl-color-text-muted);
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
  .admin-body {
    flex: 1;
    padding: 24px var(--dl-space-page-x) 80px;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
  }
</style>
