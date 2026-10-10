<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto } from '$app/navigation';
  import SiteCreate, { type SiteCreateAction } from '$lib/components/admin/SiteCreate.svelte';
  import CommonsSearch from '$lib/components/admin/CommonsSearch.svelte';
  import Disclosure from '$lib/components/ui/Disclosure.svelte';
  import type { Site } from '$lib/core/dive/types';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'site-new'> } = $props();

  /** Where each create button leads: the site, a new dive at it, or its Maps tab. */
  function after(site: Site, action: SiteCreateAction): Promise<void> {
    const id = encodeURIComponent(site.id);
    if (action === 'log') return goto(urls.admin.newDive({ site: site.id }));
    if (action === 'map') return goto(urls.admin.siteMaps(id));
    return goto(urls.admin.site(id));
  }
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={urls.admin.sites()}>Sites</a> › <span>New site</span>
</nav>
<h1>New site</h1>
<p class="lead">
  Name it and tap the map. The country, region and id follow from the pin; sites that look the same,
  in your log or the shared commons, show up as you go.
</p>

<section class="dl-card panel">
  <SiteCreate
    regions={data.regions}
    onCreated={after}
    onUse={(site) => goto(urls.admin.site(encodeURIComponent(site.id)))}
  />
</section>

<Disclosure summary="Search the commons by name instead" persistKey="site-new-commons">
  <p class="muted">
    Adopting a commons site needs no new file: the editor opens the commons record, and what you
    save there (notes, prices, own maps and photos) is kept as your overlay.
  </p>
  <CommonsSearch onUse={(hit) => goto(urls.admin.site(encodeURIComponent(hit.id)))} />
</Disclosure>

<style>
  .crumbs {
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
    margin-bottom: 6px;
  }
  .crumbs a {
    color: var(--dl-color-text-muted);
  }
  .lead {
    margin: 0 0 var(--dl-space-4);
    color: var(--dl-color-text-muted);
    max-width: 70ch;
  }
  .panel {
    padding: var(--dl-space-4);
    margin-bottom: var(--dl-space-5);
    background: var(--dl-color-bg-elevated);
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-md);
    margin: 0 0 var(--dl-space-3);
  }
  @media (max-width: 560px) {
    .panel {
      padding: var(--dl-space-3);
    }
  }
</style>
