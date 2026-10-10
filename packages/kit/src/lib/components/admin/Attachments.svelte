<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { adminApi, adminJson, adminUpload, AdminApiError } from '$lib/core/admin/client';
  import { fetchLicences } from '$lib/core/admin/lookups';
  import type {
    Attachment,
    AttachmentPatch,
    DiveAdmin,
    LicenceOut,
    Site,
  } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { confirmDialog } from '$lib/core/ui/confirm.js';

  let { dive = null, site = null }: { dive?: DiveAdmin | null; site?: Site | null } = $props();

  const KINDS: Attachment['kind'][] = $derived(
    site ? ['photo', 'map'] : ['photo', 'scan', 'map', 'video', 'export'],
  );
  const items = $derived(dive?.attachments ?? site?.attachments ?? []);
  const sorted = $derived([...items].sort((a, b) => a.sort - b.sort));
  const coverId = $derived(dive?.cover_attachment_id ?? null);
  const base = $derived(
    dive
      ? adminApi('dives', dive.number, 'attachments')
      : adminApi('sites', site?.id ?? '', 'attachments'),
  );
  /** Site photos are often someone else's: credit them with a licence, author and source. */
  const credits = $derived(!!site);

  let kind = $state<Attachment['kind']>('photo');
  let makePublic = $state(true);
  let uploading = $state(0);
  let dragging = $state(false);
  let licences = $state<LicenceOut[]>([]);

  onMount(() => {
    if (!site) return;
    fetchLicences()
      .then((list) => (licences = Array.isArray(list) ? list : []))
      .catch(() => {
        // no list: a set licence still shows by its id
      });
  });

  const nameOf = (a: Attachment) => a.original_name || a.kind;

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    uploading = list.length;
    for (const file of list) {
      try {
        await adminUpload(base, file, {
          kind,
          public: String(kind === 'scan' ? false : makePublic),
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

  function fail(what: string, err: unknown) {
    toast.show({
      kind: 'error',
      message: `${what}: ${err instanceof AdminApiError ? err.message : 'request failed'}`,
    });
  }

  /** Run one attachment request, then reload; a failure becomes an error toast. */
  async function attempt(what: string, request: () => Promise<unknown>): Promise<boolean> {
    try {
      await request();
    } catch (err) {
      fail(what, err);
      return false;
    }
    await invalidateAll();
    return true;
  }

  async function patch(a: Attachment, body: AttachmentPatch) {
    await attempt(`Could not update ${nameOf(a)}`, () =>
      adminJson(adminApi('attachments', a.id), 'PATCH', body),
    );
  }

  async function remove(a: Attachment) {
    const name = a.original_name || a.kind;
    if (!(await confirmDialog({ title: `Delete ${name}?`, danger: true }))) return;
    await attempt(`Could not delete ${a.original_name || a.kind}`, () =>
      adminJson(adminApi('attachments', a.id), 'DELETE'),
    );
  }

  async function setCover(a: Attachment) {
    if (!dive) return;
    const number = dive.number;
    await attempt('Could not set the cover', () =>
      adminJson(adminApi('dives', number), 'PATCH', { cover_attachment_id: a.id }),
    );
  }

  async function move(a: Attachment, delta: number) {
    if (!dive) return;
    const order = [...sorted];
    const i = order.findIndex((x) => x.id === a.id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await attempt('Could not reorder', () =>
      adminJson(
        `${base}/order`,
        'PUT',
        order.map((x) => x.id),
      ),
    );
  }
</script>

<section class="attachments">
  <h2>
    {site ? 'Photos & uploaded maps' : 'Photos, scans & files'}
    <span class="dl-num muted">{items.length}</span>
  </h2>

  <div
    class="dropzone"
    class:dragging
    role="group"
    aria-label="Upload files"
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault();
      dragging = false;
      if (e.dataTransfer?.files.length) void upload(e.dataTransfer.files);
    }}
  >
    <label class="kind">
      Upload as
      <select bind:value={kind}>
        {#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
      </select>
    </label>
    <label class="kind">
      <input type="checkbox" bind:checked={makePublic} disabled={kind === 'scan'} />
      {kind === 'scan' ? 'scans start private' : 'public'}
    </label>
    <label class="file">
      <span class="dl-btn dl-btn-ghost dl-btn-sm"
        >{uploading ? `Uploading ${uploading}…` : 'Choose files'}</span
      >
      <input
        type="file"
        multiple
        accept={kind === 'photo' ? 'image/*' : undefined}
        capture={kind === 'photo' ? 'environment' : undefined}
        onchange={(e) => {
          const f = e.currentTarget.files;
          if (f?.length) void upload(f);
          e.currentTarget.value = '';
        }}
      />
    </label>
    <span class="muted"
      >or drop them here. Photos get resized variants and stripped EXIF; scans keep full size.</span
    >
  </div>

  {#if sorted.length}
    <ul class="list">
      {#each sorted as a (a.id)}
        <li class="row" class:cover={a.id === coverId} class:private={!a.public}>
          <div class="preview">
            {#if a.mime.startsWith('image/')}
              <img src={a.variants.thumb ?? a.url} alt="" />
            {:else}
              <span class="muted">{a.mime}</span>
            {/if}
          </div>
          <div class="fields">
            <input
              type="text"
              class="dl-input"
              placeholder="Caption"
              aria-label="Caption of {nameOf(a)}"
              value={a.caption}
              onchange={(e) => patch(a, { caption: e.currentTarget.value })}
            />
            {#if credits}
              <div class="credit">
                <label>
                  <span>Licence</span>
                  <select
                    class="dl-select"
                    value={a.licence ?? ''}
                    onchange={(e) => patch(a, { licence: e.currentTarget.value })}
                  >
                    <option value="">own photo / no licence</option>
                    {#each licences as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
                    {#if a.licence && !licences.some((l) => l.id === a.licence)}
                      <option value={a.licence}>{a.licence}</option>
                    {/if}
                  </select>
                </label>
                <label>
                  <span>Author</span>
                  <input
                    type="text"
                    class="dl-input"
                    value={a.author ?? ''}
                    onchange={(e) => patch(a, { author: e.currentTarget.value })}
                  />
                </label>
                <label class="wide">
                  <span>Source URL</span>
                  <input
                    type="url"
                    class="dl-input"
                    placeholder="https://…"
                    value={a.source ?? ''}
                    onchange={(e) => patch(a, { source: e.currentTarget.value })}
                  />
                </label>
                {#if a.credit}
                  <label class="wide">
                    <span>Credit line (free text)</span>
                    <input
                      type="text"
                      class="dl-input"
                      value={a.credit}
                      onchange={(e) => patch(a, { credit: e.currentTarget.value })}
                    />
                  </label>
                {/if}
              </div>
            {/if}
            <div class="meta">
              <select
                aria-label="Kind of {nameOf(a)}"
                value={a.kind}
                onchange={(e) => patch(a, { kind: e.currentTarget.value as Attachment['kind'] })}
              >
                {#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
              </select>
              <label class="pub">
                <input
                  type="checkbox"
                  checked={a.public}
                  onchange={(e) => patch(a, { public: e.currentTarget.checked })}
                />
                public
              </label>
              <span class="muted dl-num"
                >{a.width ? `${a.width}×${a.height} · ` : ''}{Math.round(a.bytes / 1024)} kB</span
              >
              <a href={a.url} target="_blank" rel="noopener" class="muted">open</a>
            </div>
          </div>
          <div class="buttons">
            {#if dive && a.kind === 'photo'}
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                disabled={a.id === coverId}
                onclick={() => setCover(a)}>{a.id === coverId ? 'Cover' : 'Set cover'}</button
              >
            {/if}
            {#if dive}
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                onclick={() => move(a, -1)}
                aria-label="Move up">↑</button
              >
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                onclick={() => move(a, 1)}
                aria-label="Move down">↓</button
              >
            {/if}
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm danger"
              onclick={() => remove(a)}>Delete</button
            >
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .attachments {
    margin-top: 32px;
  }
  h2 {
    font-size: 20px;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 13px;
    font-weight: 400;
  }
  .dropzone {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border: 1px dashed var(--dl-color-border-strong);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    margin-bottom: 16px;
  }
  .dropzone.dragging {
    border-color: var(--dl-color-accent);
    background: var(--dl-color-accent-soft);
  }
  .kind {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .kind select {
    width: auto;
  }
  .kind input[type='checkbox'],
  .pub input[type='checkbox'] {
    width: auto;
  }
  .pub {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .file input {
    display: none;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: grid;
    grid-template-columns: 96px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 10px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  .row.cover {
    border-color: var(--dl-color-warm);
  }
  .row.private {
    border-style: dashed;
  }
  .credit {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 6px 10px;
  }
  .credit label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .credit .wide {
    grid-column: 1 / -1;
  }
  .preview {
    width: 96px;
    height: 72px;
    border-radius: var(--dl-radius-sm);
    overflow: hidden;
    background: var(--dl-color-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .meta select {
    width: auto;
    padding: 4px 8px;
  }
  .buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
  @media (max-width: 720px) {
    .row {
      grid-template-columns: 72px 1fr;
    }
    .buttons {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }
</style>
