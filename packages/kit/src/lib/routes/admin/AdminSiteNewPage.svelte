<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto } from '$app/navigation';
  import SiteForm from './SiteForm.svelte';
  import CommonsSearch from '$lib/components/admin/CommonsSearch.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'site-new'> } = $props();
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={urls.admin.sites()}>Sites</a> › <span>New site</span>
</nav>
<h1>New site</h1>
<section class="dl-card adopt">
  <h2>Adopt a site from the commons</h2>
  <p class="muted">
    The shared commons may already describe this site. Adopting it needs no new file: the editor
    opens the commons record, and what you save there (notes, prices, own maps and photos) is kept
    as your overlay.
  </p>
  <CommonsSearch onUse={(hit) => goto(urls.admin.site(hit.id))} />
</section>
<h2 class="or">Or describe a new site</h2>
<SiteForm regions={data.regions} onSaved={(site) => goto(urls.admin.site(site.id))} />
<p class="muted">Photos, uploaded maps and drawn maps are added after the site is created.</p>

<style>
  .crumbs {
    font-size: 13.5px;
    color: var(--dl-color-text-faint);
    margin-bottom: 6px;
  }
  .crumbs a {
    color: var(--dl-color-text-muted);
  }
  .adopt {
    padding: 16px;
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--dl-color-bg-elevated);
  }
  .adopt h2,
  .or {
    font-size: 18px;
    margin: 0;
  }
  .or {
    margin-bottom: 12px;
  }
  .adopt .muted {
    margin: 0;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 14px;
  }
</style>
