<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import SiteMapEditor, { type UnderlayOption } from '$lib/components/map/SiteMapEditor.svelte';
  import type { MapRef, Site } from '$lib/core/dive/types';
  import {
    defaultTitle,
    emptySiteMap,
    mapSummary,
    seedDraft,
    siteOrigin,
    type MapKind,
    type SiteMap,
    type SiteMapOut,
    type SiteMapSeedIn,
    type SiteMapSeedOut,
  } from '$lib/core/dive/sitemap';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { announce } from '$lib/core/ui/announce.js';
  import ChangeList from '$lib/components/shell/ChangeList.svelte';

  let {
    site,
    unsavedWork = $bindable(false),
  }: {
    site: Site;
    /** Mirrors whether a map holds unsaved work, so the workspace can ask before a tab switch. */
    unsavedWork?: boolean;
  } = $props();
  const drawn = $derived(
    site.maps.flatMap((m: MapRef) => (m.collection === 'drawn' && m.drawn ? [m.drawn] : [])),
  );
  const origin = $derived(siteOrigin(site));
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

  /** Id of the stored map in the editor, or `NEW` for a draft that has never been saved. */
  const NEW = '';
  let openId = $state<string | null>(null);
  let draft = $state<SiteMap | null>(null);
  let dirty = $state(false);
  let saving = $state(false);
  let seeding = $state(false);
  let editorKey = $state(0);
  let note = $state('');
  let lastSaved = $state<SiteMapOut | null>(null);

  const isNew = $derived(openId === NEW);
  const openMap = $derived(
    openId
      ? (drawn.find((m) => m.id === openId) ?? (lastSaved?.id === openId ? lastSaved : undefined))
      : undefined,
  );
  const shownMap = $derived(
    lastSaved && openMap && lastSaved.id === openMap.id && lastSaved.revision > openMap.revision
      ? lastSaved
      : openMap,
  );
  const shownFirst = $derived(
    site.default_map
      ? site.default_map.startsWith('drawn:')
        ? site.default_map.slice(6)
        : null
      : (drawn[0]?.id ?? null),
  );
  /** A new draft holds unsaved work from the start: it exists nowhere else yet. */
  const unsaved = $derived(dirty || isNew);

  $effect(() => {
    unsavedWork = unsaved;
  });

  async function mayDiscard(): Promise<boolean> {
    if (!unsaved) return true;
    return confirmDialog({
      title: isNew ? 'Discard the new map?' : 'Discard unsaved changes to the open map?',
      body: isNew ? 'It has not been saved yet.' : undefined,
      confirmLabel: 'Discard',
    });
  }

  function show(id: string | null, map: SiteMap | null, changed: boolean) {
    openId = id;
    draft = map;
    dirty = changed;
    note = '';
    lastSaved = null;
    editorKey += 1;
  }

  async function open(map: SiteMapOut) {
    if (unsaved && !(await mayDiscard())) return;
    show(map.id, map, false);
  }

  async function close() {
    if (unsaved && !(await mayDiscard())) return;
    show(null, null, false);
  }

  /** Start a blank map in the editor; nothing is stored until "Save map". */
  async function startBlank(kind: MapKind) {
    if (unsaved && !(await mayDiscard())) return;
    show(NEW, emptySiteMap(kind, origin), false);
    announce(`New ${defaultTitle(kind).toLowerCase()} open in the editor, not saved yet`);
  }

  /** Ask the server for a starter site map from OpenStreetMap and open it as an unsaved draft. */
  async function startFromOsm() {
    if (unsaved && !(await mayDiscard())) return;
    seeding = true;
    try {
      const body: SiteMapSeedIn = { source: 'osm' };
      const seed = await adminJson<SiteMapSeedOut>(
        `/admin/sites/${encodeURIComponent(site.id)}/maps/seed`,
        'POST',
        body,
      );
      show(NEW, seedDraft(seed.map, origin), true);
      toast.show({
        kind: 'info',
        message: `${seed.elements} OpenStreetMap feature${seed.elements === 1 ? '' : 's'} within ${seed.radius_m} m. Check the draft, then Save map.`,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        message:
          err instanceof AdminApiError
            ? `OpenStreetMap starter map: ${err.message}`
            : 'Could not reach the server for a starter map',
      });
    } finally {
      seeding = false;
    }
  }

  async function save() {
    if (!draft || openId === null) return;
    saving = true;
    try {
      if (isNew) {
        const created = await adminJson<SiteMapOut>(
          `/admin/sites/${encodeURIComponent(site.id)}/maps`,
          'POST',
          { data: draft, note: note.trim() || 'Created' },
        );
        openId = created.id;
        lastSaved = created;
        toast.show({ kind: 'success', message: 'Map saved' });
      } else {
        const before = openMap?.revision;
        const saved = await adminJson<SiteMapOut>(`/admin/maps/${openId}`, 'PUT', {
          data: draft,
          note: note.trim(),
        });
        toast.show({
          kind: 'success',
          message: saved.revision === before ? 'Nothing changed' : 'Map saved',
        });
        lastSaved = saved;
      }
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
      !(await confirmDialog({
        title: `Delete “${map.title || defaultTitle(map.kind)}”?`,
        body: 'Dives annotated on it lose their route.',
        danger: true,
      }))
    )
      return;
    try {
      await adminJson(`/admin/maps/${map.id}`, 'DELETE');
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not delete the map',
      });
      return;
    }
    if (openId === map.id) show(null, null, false);
    await invalidateAll();
  }

  async function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= drawn.length) return;
    const order = drawn.map((m) => m.id);
    [order[i], order[j]] = [order[j], order[i]];
    try {
      await adminJson(`/admin/sites/${encodeURIComponent(site.id)}/maps/order`, 'PUT', order);
      announce(`Moved ${delta < 0 ? 'up' : 'down'}`);
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not reorder',
      });
    }
    await invalidateAll();
  }

  async function makeFirst(map: SiteMapOut) {
    try {
      await adminJson(`/admin/sites/${encodeURIComponent(site.id)}`, 'PATCH', {
        default_map: `drawn:${map.id}`,
      });
      toast.show({
        kind: 'success',
        message: `${map.title || defaultTitle(map.kind)} is shown first on the site page`,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not change the first map',
      });
    }
    await invalidateAll();
  }

  function noteKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (unsaved && !saving) save();
  }

  function beforeUnload(e: BeforeUnloadEvent) {
    if (unsaved) e.preventDefault();
  }

  let leaving = false;

  beforeNavigate((nav) => {
    if (!unsaved || leaving || nav.type === 'leave') return;
    nav.cancel();
    const to = nav.to?.url;
    confirmDialog({
      title: 'Leave the map editor with unsaved changes?',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
    }).then(async (ok) => {
      if (!ok || !to) return;
      leaving = true;
      try {
        await goto(to);
      } finally {
        leaving = false;
      }
    });
  });
</script>

<svelte:window onbeforeunload={beforeUnload} />

<section class="editor-page">
  <div class="head">
    <h2>Drawn maps</h2>
    <div class="actions">
      <button
        type="button"
        class="dl-btn dl-btn-solid dl-btn-sm"
        onclick={startFromOsm}
        disabled={seeding || !origin}
        aria-busy={seeding}
        aria-describedby={origin ? undefined : 'dl-maps-no-origin'}
        >{seeding ? 'Fetching from OpenStreetMap…' : 'Start from OpenStreetMap'}</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        onclick={() => startBlank('sitemap')}>Blank site map</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        onclick={() => startBlank('stickmap')}>Blank stick map</button
      >
    </div>
  </div>
  {#if !origin}
    <p class="muted" id="dl-maps-no-origin">
      This site has no coordinates yet: set them under Details to start from OpenStreetMap and place
      new maps on the globe.
    </p>
  {/if}

  {#if drawn.length || isNew}
    <ul class="map-list">
      {#each drawn as m, i (m.id)}
        {@const title = m.title || defaultTitle(m.kind)}
        <li class="map-row" class:open={openId === m.id}>
          <span class="badge">{defaultTitle(m.kind)}</span>
          <span class="map-title">{title}</span>
          <span class="muted dl-num">{mapSummary(m)} · revision {m.revision}</span>
          {#if drawn.length > 1}
            <label class="first">
              <input
                type="radio"
                name="dl-first-map-{site.id}"
                checked={shownFirst === m.id}
                onchange={() => makeFirst(m)}
              />
              Shown first
            </label>
          {/if}
          <span class="row-actions">
            {#if drawn.length > 1}
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                onclick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move {title} up">↑</button
              >
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                onclick={() => move(i, 1)}
                disabled={i === drawn.length - 1}
                aria-label="Move {title} down">↓</button
              >
            {/if}
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              aria-label="{openId === m.id ? 'Close' : 'Edit'} {title}"
              onclick={() => (openId === m.id ? close() : open(m))}
              >{openId === m.id ? 'Close' : 'Edit'}</button
            >
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm danger"
              aria-label="Delete {title}"
              onclick={() => remove(m)}>Delete</button
            >
          </span>
        </li>
      {/each}
      {#if isNew && draft}
        <li class="map-row open">
          <span class="badge">{defaultTitle(draft.kind)}</span>
          <span class="map-title">{draft.title || defaultTitle(draft.kind)}</span>
          <span class="unsaved">new · not saved yet</span>
          <span class="row-actions">
            <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={close}
              >Discard</button
            >
          </span>
        </li>
      {/if}
    </ul>
  {:else}
    <p class="muted">
      No drawn maps yet. A <strong>site map</strong> is a lake, quarry or reef with a shoreline,
      depth contours, dive paths and objects — start it from OpenStreetMap to get the shore for
      free. A <strong>stick map</strong> is a cave line survey: stations, distances, bearings. Both can
      be traced over the locator map or a reference map.
    </p>
  {/if}

  {#if draft && openId !== null}
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
        <span class="muted" role="status"
          >{isNew ? 'New map, not saved yet' : dirty ? 'Unsaved changes' : 'Saved'} · every save is one
          git commit</span
        >
        <span class="save-controls">
          <input
            type="text"
            class="note dl-input"
            aria-label="What changed"
            placeholder={isNew
              ? 'What this map is, e.g. Shore and contours from OSM'
              : 'What changed, e.g. Added the second sump'}
            maxlength="200"
            bind:value={note}
            onkeydown={noteKeydown}
          />
          <button
            type="button"
            class="dl-btn dl-btn-solid dl-btn-sm"
            disabled={!unsaved || saving}
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
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  h2 {
    font-size: var(--dl-text-lg);
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .map-list {
    list-style: none;
    padding: 0;
    margin: 8px 0 16px;
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
    font-size: var(--dl-text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--dl-color-accent-soft);
    color: var(--dl-color-accent);
  }
  .first {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
    cursor: pointer;
  }
  .unsaved {
    color: var(--dl-color-warm);
    font-size: var(--dl-text-sm);
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-sm);
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
    font-size: var(--dl-text-md);
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
  @media (max-width: 700px) {
    .editor {
      padding: 8px;
    }
    .actions .dl-btn,
    .save-controls .dl-btn {
      min-height: 44px;
    }
  }
</style>
