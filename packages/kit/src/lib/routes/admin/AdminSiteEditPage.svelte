<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { onMount } from 'svelte';
  import { beforeNavigate, goto, invalidateAll, replaceState } from '$app/navigation';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import { formDirty, siteFormFrom, type SiteFormState } from '$lib/core/admin/site-form';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import type { Site } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import SiteForm from './SiteForm.svelte';
  import SiteHeader from './SiteHeader.svelte';
  import SiteDives from './SiteDives.svelte';
  import AdminSiteMapsPage from './AdminSiteMapsPage.svelte';
  import Attachments from '$lib/components/admin/Attachments.svelte';
  import Tabs, { type TabItem } from '$lib/components/ui/Tabs.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'site-edit'> | AdminDataFor<'site-maps'> } = $props();
  const site = $derived(data.site);

  const drawnCount = $derived(site.maps.filter((m) => m.collection === 'drawn').length);

  const TABS = $derived<TabItem[]>([
    { id: 'details', label: 'Details' },
    { id: 'location', label: site.lat === null ? 'Location (not placed)' : 'Location' },
    { id: 'maps', label: `Maps${drawnCount ? ` (${drawnCount})` : ''}` },
    {
      id: 'photos',
      label: `Photos${site.attachments.length ? ` (${site.attachments.length})` : ''}`,
    },
    { id: 'dives', label: `Dives${site.dives ? ` (${site.dives})` : ''}` },
  ]);

  // svelte-ignore state_referenced_locally
  let tab = $state(data.page === 'site-maps' ? 'maps' : 'details');

  // svelte-ignore state_referenced_locally
  let formFor: Site = data.site;
  // svelte-ignore state_referenced_locally
  let form = $state<SiteFormState>(siteFormFrom(data.site));

  $effect.pre(() => {
    const fresh = data.site;
    if (fresh === formFor) return;
    formFor = fresh;
    form = siteFormFrom(fresh);
  });

  const dirty = $derived(formDirty(form, site));

  /** The URL a tab lives at: the Maps tab keeps its own path, the others a hash. */
  function tabUrl(id: string): string {
    if (id === 'maps') return urls.admin.siteMaps(site.id);
    return id === 'details' ? urls.admin.site(site.id) : `${urls.admin.site(site.id)}#${id}`;
  }

  function onTab(id: string) {
    try {
      replaceState(tabUrl(id), {});
    } catch {
      // the router is not ready (tests, early clicks): the tab still switches
    }
  }

  onMount(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== 'maps' && TABS.some((t) => t.id === id)) tab = id;
  });

  let leaving = false;

  beforeNavigate((nav) => {
    if (!dirty || leaving || nav.type === 'leave' || !nav.to) return;
    if (nav.to.url.pathname === location.pathname) return;
    nav.cancel();
    const to = nav.to.url;
    confirmDialog({
      title: 'Leave with unsaved changes to the site?',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
    }).then(async (ok) => {
      if (!ok) return;
      leaving = true;
      try {
        await goto(to);
      } finally {
        leaving = false;
      }
    });
  });

  function beforeUnload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault();
  }

  async function removeSite() {
    if (
      !(await confirmDialog({
        title: `Delete ${site.name}?`,
        body: 'This cannot be undone.',
        danger: true,
      }))
    )
      return;
    try {
      await adminJson(adminApi('sites', site.id), 'DELETE');
      toast.show({ kind: 'success', message: `${site.name} deleted` });
      leaving = true;
      await goto(urls.admin.sites());
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not delete',
      });
    } finally {
      leaving = false;
    }
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={urls.admin.sites()}>Sites</a> › <span>{site.name}</span>
</nav>
<SiteHeader {site} onChanged={() => invalidateAll()} />

<Tabs
  tabs={TABS}
  bind:active={tab}
  label="Site workspace"
  idPrefix="site"
  listClass="site-tabs"
  onchange={onTab}
>
  {#snippet panel(id)}
    {#if id === 'details' || id === 'location'}
      {#key site.id}
        <SiteForm
          {site}
          regions={data.regions}
          bind:form
          section={id === 'location' ? 'location' : 'details'}
          onSaved={() => invalidateAll()}
        />
      {/key}
      {#if id === 'details'}
        <section class="danger-zone">
          {#if site.dives}
            <p class="muted">
              {site.dives} dive{site.dives === 1 ? '' : 's'} point{site.dives === 1 ? 's' : ''} at this
              site, so it cannot be deleted.
            </p>
          {:else}
            <button type="button" class="dl-btn dl-btn-danger dl-btn-sm" onclick={removeSite}
              >Delete site</button
            >
          {/if}
        </section>
      {/if}
    {:else if id === 'maps'}
      <AdminSiteMapsPage {site} />
    {:else if id === 'photos'}
      <Attachments {site} />
    {:else if id === 'dives'}
      <SiteDives {site} />
    {/if}
  {/snippet}
</Tabs>

<style>
  .crumbs {
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
    margin-bottom: 6px;
  }
  .crumbs a {
    color: var(--dl-color-text-muted);
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-md);
    margin: 0;
  }
  .danger-zone {
    margin-top: var(--dl-space-5);
    border-top: 1px solid var(--dl-color-border);
    padding-top: var(--dl-space-4);
  }
  :global(.site-tabs) {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--dl-color-bg);
  }
</style>
