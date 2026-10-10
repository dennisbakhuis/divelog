<script lang="ts">
  import { page } from '$app/state';
  import { escapeRegExp } from '$lib/core/dive/config';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();
  const base = escapeRegExp(urls.base);
  const DIVE = new RegExp(`^${base}\\/\\d+`);
  const under = (path: string) => (p: string) => p.startsWith(path);

  const items = [
    { href: urls.log(), label: 'Log', match: (p: string) => p === urls.log() || DIVE.test(p) },
    {
      href: urls.sites(),
      label: 'Sites',
      match: (p: string) => p.startsWith(urls.sites()) || p.startsWith(`${urls.base}/regions`),
    },
    { href: urls.trips(), label: 'Trips', match: under(urls.trips()) },
    { href: urls.people(), label: 'People', match: under(urls.people()) },
    { href: urls.gear(), label: 'Gear', match: under(urls.gear()) },
  ];

  const DETAIL = new RegExp(`^${base}\\/(\\d+|(sites|people|trips|regions)\\/[^/]+)\\/?$`);
  const detail = $derived(DETAIL.test(page.url.pathname));
</script>

<nav class="dive-nav dl-container" class:detail aria-label="Dive log sections">
  {#each items as item (item.href)}
    <a
      href={item.href}
      class:active={item.match(page.url.pathname)}
      aria-current={item.match(page.url.pathname) ? 'page' : undefined}>{item.label}</a
    >
  {/each}
</nav>

<style>
  .dive-nav {
    display: flex;
    gap: 4px;
    padding-top: 20px;
    margin-bottom: -28px;
  }
  .dive-nav.detail {
    max-width: var(--dl-container-detail);
  }
  .dive-nav a {
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--dl-color-border);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--dl-color-text-muted);
    background: var(--dl-color-bg-elevated);
  }
  .dive-nav a:hover {
    color: var(--dl-color-text);
    border-color: var(--dl-color-border-strong);
  }
  .dive-nav a.active {
    background: var(--dl-color-text);
    border-color: var(--dl-color-text);
    color: var(--dl-color-bg);
  }
</style>
