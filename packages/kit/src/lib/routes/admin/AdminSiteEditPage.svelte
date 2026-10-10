<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { onMount } from 'svelte';
  import { goto, invalidateAll, replaceState } from '$app/navigation';
  import { adminJson, adminUpload, AdminApiError } from '$lib/core/admin/client';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import type { Attachment } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import SiteForm from './SiteForm.svelte';
  import AdminSiteMapsPage from './AdminSiteMapsPage.svelte';
  import Tabs, { type TabItem } from '$lib/components/ui/Tabs.svelte';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'site-edit'> | AdminDataFor<'site-maps'> } = $props();
  const site = $derived(data.site);

  const TABS: TabItem[] = [
    { id: 'details', label: 'Details' },
    { id: 'maps', label: 'Maps' },
    { id: 'photos', label: 'Photos' },
  ];

  // svelte-ignore state_referenced_locally
  let tab = $state(data.page === 'site-maps' ? 'maps' : 'details');

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

  let mediaKind = $state<'photo' | 'map'>('photo');
  let mediaPublic = $state(true);
  let uploading = $state(0);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const items = Array.from(files);
    uploading = items.length;
    for (const file of items) {
      try {
        await adminUpload(`/admin/sites/${site.id}/attachments`, file, {
          kind: mediaKind,
          public: String(mediaPublic),
        });
      } catch (err) {
        toast.show({
          kind: 'error',
          message: `${file.name}: ${err instanceof AdminApiError ? err.message : 'upload failed'}`,
        });
      }
      uploading -= 1;
    }
    await invalidateAll();
  }

  async function patchMedia(a: Attachment, patch: Partial<Attachment>) {
    await adminJson(`/admin/attachments/${a.id}`, 'PATCH', patch);
    await invalidateAll();
  }

  async function removeMedia(a: Attachment) {
    if (!(await confirmDialog({ title: `Delete ${a.original_name || a.kind}?`, danger: true })))
      return;
    await adminJson(`/admin/attachments/${a.id}`, 'DELETE');
    await invalidateAll();
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
      await adminJson(`/admin/sites/${site.id}`, 'DELETE');
      toast.show({ kind: 'success', message: `${site.name} deleted` });
      await goto(urls.admin.sites());
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not delete',
      });
    }
  }
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={urls.admin.sites()}>Sites</a> › <span>{site.name}</span>
</nav>
<header class="head">
  <h1>{site.name}</h1>
  <OriginBadge
    origin={site.origin}
    title={site.forked_from ? `forked from ${site.forked_from}` : undefined}
  />
  <a
    class="dl-btn dl-btn-ghost dl-btn-sm"
    href={urls.site(site.slug)}
    target="_blank"
    rel="noopener">View ↗</a
  >
</header>

<Tabs tabs={TABS} bind:active={tab} label="Site workspace" idPrefix="site" onchange={onTab}>
  {#snippet panel(id)}
    {#if id === 'details'}
      {#key site.id}
        <SiteForm {site} regions={data.regions} onSaved={() => invalidateAll()} />
      {/key}
    {:else if id === 'maps'}
      <AdminSiteMapsPage {site} />
    {:else if id === 'photos'}
      <section class="dl-card panel">
        <h2>Photos & uploaded maps</h2>
        <div class="dropzone">
          <label class="kind">
            Upload as
            <select bind:value={mediaKind}>
              <option value="photo">site photo</option>
              <option value="map">map image (scan, screenshot)</option>
            </select>
          </label>
          <label class="kind"><input type="checkbox" bind:checked={mediaPublic} /> public</label>
          <label class="file">
            <span class="dl-btn dl-btn-ghost dl-btn-sm"
              >{uploading ? `Uploading ${uploading}…` : 'Choose images'}</span
            >
            <input
              type="file"
              multiple
              accept="image/*"
              onchange={(e) => {
                void upload(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>
        {#if site.attachments.length}
          <ul class="media">
            {#each site.attachments as a (a.id)}
              <li class="media-row" class:private={!a.public}>
                <img src={a.variants.thumb ?? a.url} alt="" />
                <div class="media-fields">
                  <input
                    type="text"
                    placeholder="Caption"
                    value={a.caption}
                    onchange={(e) => patchMedia(a, { caption: e.currentTarget.value })}
                  />
                  <input
                    type="text"
                    placeholder="Credit (author, licence)"
                    value={a.credit}
                    onchange={(e) => patchMedia(a, { credit: e.currentTarget.value })}
                  />
                  <div class="media-meta">
                    <select
                      value={a.kind}
                      onchange={(e) =>
                        patchMedia(a, { kind: e.currentTarget.value as Attachment['kind'] })}
                    >
                      <option value="map">map</option>
                      <option value="photo">photo</option>
                    </select>
                    <label class="kind"
                      ><input
                        type="checkbox"
                        checked={a.public}
                        onchange={(e) => patchMedia(a, { public: e.currentTarget.checked })}
                      /> public</label
                    >
                    <a href={a.url} target="_blank" rel="noopener" class="muted">open</a>
                    <button
                      type="button"
                      class="dl-btn dl-btn-ghost dl-btn-sm danger"
                      onclick={() => removeMedia(a)}>Delete</button
                    >
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  {/snippet}
</Tabs>

<section class="danger-zone">
  {#if site.dives}
    <p class="muted">
      {site.dives} dive{site.dives === 1 ? '' : 's'} point{site.dives === 1 ? 's' : ''} at this site,
      so it cannot be deleted.
    </p>
  {:else}
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm danger" onclick={removeSite}
      >Delete site</button
    >
  {/if}
</section>

<style>
  .crumbs {
    font-size: 13.5px;
    color: var(--dl-color-text-faint);
    margin-bottom: 6px;
  }
  .crumbs a {
    color: var(--dl-color-text-muted);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 14px;
    margin: 0;
  }
  .panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
    background: var(--dl-color-bg-elevated);
  }
  .panel h2 {
    font-size: 15px;
    margin: 0;
  }
  .dropzone {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding: 12px;
    border: 1px dashed var(--dl-color-border-strong);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  .kind {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .kind select {
    width: auto;
  }
  .kind input[type='checkbox'] {
    width: auto;
  }
  .file input {
    display: none;
  }
  .media {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .media-row {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 12px;
    align-items: center;
    padding: 8px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  .media-row.private {
    border-style: dashed;
    border-color: var(--dl-color-warm);
  }
  .media-row img {
    width: 96px;
    height: 72px;
    object-fit: cover;
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface-2);
  }
  .media-fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .media-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .media-meta select {
    width: auto;
    padding: 4px 8px;
  }
  .danger-zone {
    border-top: 1px solid var(--dl-color-border);
    padding-top: 16px;
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
</style>
