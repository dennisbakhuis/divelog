<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { beforeNavigate, invalidateAll } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import SiteMapEditor, { type UnderlayOption } from '$lib/components/map/SiteMapEditor.svelte';
  import type { MapRef } from '$lib/core/dive/types';
  import {
    defaultTitle,
    emptySiteMap,
    mapSummary,
    type MapKind,
    type SiteMap,
    type SiteMapOut,
  } from '$lib/core/dive/sitemap';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';
  import ChangeList from '$lib/components/shell/ChangeList.svelte';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'site-maps'> } = $props();
  const site = $derived(data.site);
  const drawn = $derived(
    site.maps.flatMap((m: MapRef) => (m.collection === 'drawn' && m.drawn ? [m.drawn] : [])),
  );
  const underlays = $derived.by((): UnderlayOption[] => {
    const all = [...site.maps, ...(site.private?.reference_maps ?? [])];
    const fromMaps = all
      .filter((m) => m.collection !== 'drawn' && m.url)
      .map((m) => ({ ref: m.ref, label: `${m.title} (${m.collection})`, href: m.url! }));
    const uploads = site.attachments
      .filter((a) => a.kind === 'map' || a.kind === 'photo')
      .map((a) => ({
        ref: `upload:${a.id}`,
        label: a.caption || a.original_name || a.kind,
        href: a.variants.w1600 ?? a.url,
      }));
    return [...fromMaps, ...uploads];
  });

  let openId = $state<string | null>(null);
  let draft = $state<SiteMap | null>(null);
  let dirty = $state(false);
  let saving = $state(false);
  let editorKey = $state(0);
  let note = $state('');
  let lastSaved = $state<SiteMapOut | null>(null);

  const openMap = $derived(drawn.find((m) => m.id === openId));
  const shownMap = $derived(
    lastSaved && openMap && lastSaved.id === openMap.id && lastSaved.revision > openMap.revision
      ? lastSaved
      : openMap,
  );

  function open(map: SiteMapOut) {
    if (dirty && !confirm('Discard unsaved changes to the open map?')) return;
    openId = map.id;
    draft = map;
    dirty = false;
    note = '';
    lastSaved = null;
    editorKey += 1;
  }

  function close() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    openId = null;
    draft = null;
    dirty = false;
    note = '';
    lastSaved = null;
  }

  async function create(kind: MapKind) {
    try {
      const created = await adminJson<SiteMapOut>(`/admin/sites/${site.id}/maps`, 'POST', {
        data: emptySiteMap(kind),
        note: 'Created',
      });
      await invalidateAll();
      open(created);
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof AdminApiError ? err.message : 'Failed' });
    }
  }

  async function save() {
    if (!openMap || !draft) return;
    saving = true;
    try {
      const saved = await adminJson<SiteMapOut>(`/admin/maps/${openMap.id}`, 'PUT', {
        data: draft,
        note: note.trim(),
      });
      toast.show({
        kind: 'success',
        message: saved.revision === openMap.revision ? 'Nothing changed' : 'Map saved',
      });
      lastSaved = saved;
      dirty = false;
      note = '';
      await invalidateAll();
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not save the map',
      });
    } finally {
      saving = false;
    }
  }

  async function remove(map: SiteMapOut) {
    if (
      !confirm(
        `Delete “${map.title || defaultTitle(map.kind)}”? Dives annotated on it lose their route.`,
      )
    )
      return;
    await adminJson(`/admin/maps/${map.id}`, 'DELETE');
    if (openId === map.id) {
      openId = null;
      draft = null;
      dirty = false;
    }
    await invalidateAll();
  }

  async function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= drawn.length) return;
    const order = drawn.map((m) => m.id);
    [order[i], order[j]] = [order[j], order[i]];
    await adminJson(`/admin/sites/${site.id}/maps/order`, 'PUT', order);
    await invalidateAll();
  }

  async function star(map: SiteMapOut) {
    await adminJson(`/admin/sites/${site.id}`, 'PATCH', { default_map: `drawn:${map.id}` });
    toast.show({ kind: 'success', message: 'Shown first on the site page' });
    await invalidateAll();
  }

  function noteKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (dirty && !saving) save();
  }

  function beforeUnload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault();
  }

  beforeNavigate((nav) => {
    if (dirty && nav.type !== 'leave' && !confirm('Leave the map editor with unsaved changes?')) {
      nav.cancel();
    }
  });
</script>

<svelte:window onbeforeunload={beforeUnload} />

<section class="editor-page">
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href={urls.admin.sites()}>Sites</a> › <a href={urls.admin.site(site.id)}>{site.name}</a> ›
    <span>Maps</span>
  </nav>
  <div class="head">
    <div class="title">
      <h1>Maps of {site.name}</h1>
      <a
        class="dl-btn dl-btn-ghost dl-btn-sm"
        href={urls.site(site.slug)}
        target="_blank"
        rel="noopener">View ↗</a
      >
    </div>
    <div class="actions">
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => create('stickmap')}
        >+ Stick map</button
      >
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => create('sitemap')}
        >+ Site map</button
      >
    </div>
  </div>

  {#if drawn.length}
    <ul class="map-list">
      {#each drawn as m, i (m.id)}
        <li class="map-row" class:open={openId === m.id}>
          <span class="badge">{defaultTitle(m.kind)}</span>
          <span class="map-title">{m.title || defaultTitle(m.kind)}</span>
          <span class="muted dl-num">{mapSummary(m)} · revision {m.revision}</span>
          {#if site.default_map === `drawn:${m.id}`}<span class="star">★ first</span>{/if}
          <span class="row-actions">
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              onclick={() => move(i, -1)}
              aria-label="Move up">↑</button
            >
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              onclick={() => move(i, 1)}
              aria-label="Move down">↓</button
            >
            {#if site.default_map !== `drawn:${m.id}`}
              <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => star(m)}
                >☆ first</button
              >
            {/if}
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              onclick={() => (openId === m.id ? close() : open(m))}
              >{openId === m.id ? 'Close' : 'Edit'}</button
            >
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm danger"
              onclick={() => remove(m)}>Delete</button
            >
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">
      No drawn maps yet. A <strong>stick map</strong> is a cave line survey — stations, distances,
      bearings; a <strong>site map</strong> is a lake, quarry or reef with a shoreline, depth contours,
      dive paths and objects. Both can be traced over the locator map or a reference map.
    </p>
  {/if}

  {#if openMap && draft}
    <div class="editor dl-card">
      {#key editorKey}
        <SiteMapEditor
          value={draft}
          {underlays}
          onChange={(m) => {
            draft = m;
            dirty = true;
          }}
        />
      {/key}
      <div class="save-row">
        <span class="muted"
          >{dirty ? 'Unsaved changes' : 'Saved'} · every save is one git commit</span
        >
        <span class="save-controls">
          <input
            type="text"
            class="note"
            aria-label="What changed"
            placeholder="What changed, e.g. Added the second sump"
            maxlength="200"
            bind:value={note}
            onkeydown={noteKeydown}
          />
          <button
            type="button"
            class="dl-btn dl-btn-solid dl-btn-sm"
            disabled={!dirty || saving}
            onclick={save}>{saving ? 'Saving…' : 'Save map'}</button
          >
        </span>
      </div>
      {#if shownMap}
        <div class="history">
          <p class="dl-num">Revision {shownMap.revision}</p>
          <ChangeList entries={shownMap.changelog} />
        </div>
      {/if}
    </div>
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
  .title {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  h1 {
    margin-bottom: 0;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .map-list {
    list-style: none;
    padding: 0;
    margin: 0 0 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .map-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 10px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  .map-row.open {
    border-color: var(--dl-color-accent);
  }
  .map-title {
    font-weight: 500;
  }
  .row-actions {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }
  .badge {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--dl-color-accent-soft);
    color: var(--dl-color-accent);
  }
  .star {
    color: var(--dl-color-warm);
    font-size: 13px;
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 13.5px;
  }
  .editor {
    padding: 14px;
    background: var(--dl-color-bg-elevated);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .save-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    border-top: 1px solid var(--dl-color-border);
    padding-top: 10px;
  }
  .save-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 320px;
    justify-content: flex-end;
  }
  .note {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 420px;
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .history p {
    margin: 0;
    font-size: 14px;
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
</style>
