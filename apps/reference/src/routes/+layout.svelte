<script lang="ts">
  import '@divelog/kit/styles/tokens.css';
  import '@divelog/kit/styles/divelog.css';
  import '$lib/theme.css';
  import { page } from '$app/state';
  import { setMapWorkerUrl, Toast } from '@divelog/kit';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

  let { children, data } = $props();

  setMapWorkerUrl(workerUrl);

  const meta = $derived(page.status === 200 ? page.data.meta : undefined);
</script>

<svelte:head>
  {#if meta}
    <title>{meta.title}</title>
    <meta name="description" content={meta.description} />
    <meta property="og:title" content={meta.title} />
    <meta property="og:description" content={meta.description} />
  {/if}
  {#if data.ogImage}
    <meta property="og:image" content={data.ogImage} />
  {/if}
</svelte:head>

<header class="site-header">
  <a class="brand" href="/">{data.divelogConfig.siteName}</a>
  <nav aria-label="Site">
    <a href="/dive">Log</a>
    <a href="/admin">Editor</a>
  </nav>
</header>

<main>
  {@render children()}
</main>

<Toast />

<style>
  .site-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: var(--header-h);
    padding: 0 var(--space-page-x);
    border-bottom: 1px solid var(--color-border);
  }

  .brand {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--color-text);
    text-decoration: none;
  }

  nav {
    display: flex;
    gap: 20px;
  }
</style>
