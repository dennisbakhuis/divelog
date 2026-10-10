<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { adminApi, adminJson, adminUpload, AdminApiError } from '$lib/core/admin/client';
  import { diveToInput } from '$lib/core/admin/dive-input';
  import type { Attachment, DiveAdmin } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';

  let { dive }: { dive: DiveAdmin } = $props();

  const KINDS: Attachment['kind'][] = ['photo', 'scan', 'map', 'video', 'export'];
  let kind = $state<Attachment['kind']>('photo');
  let makePublic = $state(true);
  let uploading = $state(0);
  let dragging = $state(false);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    uploading = list.length;
    for (const file of list) {
      try {
        await adminUpload(adminApi('dives', dive.number, 'attachments'), file, {
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

  async function patch(
    a: Attachment,
    body: Partial<Pick<Attachment, 'caption' | 'kind' | 'sort' | 'public' | 'credit'>>,
  ) {
    await adminJson(adminApi('attachments', a.id), 'PATCH', body);
    await invalidateAll();
  }

  async function remove(a: Attachment) {
    if (!confirm(`Delete ${a.original_name || a.kind}?`)) return;
    await adminJson(adminApi('attachments', a.id), 'DELETE');
    await invalidateAll();
  }

  async function setCover(a: Attachment) {
    await adminJson(adminApi('dives', dive.number), 'PUT', {
      ...diveToInput(dive),
      cover_attachment_id: a.id,
    });
    await invalidateAll();
  }

  async function move(a: Attachment, delta: number) {
    const sorted = [...dive.attachments].sort((x, y) => x.sort - y.sort);
    const i = sorted.findIndex((x) => x.id === a.id);
    const j = i + delta;
    if (j < 0 || j >= sorted.length) return;
    await adminJson(adminApi('attachments', sorted[i].id), 'PATCH', { sort: j });
    await adminJson(adminApi('attachments', sorted[j].id), 'PATCH', { sort: i });
    await invalidateAll();
  }
</script>

<section class="attachments">
  <h2>Photos, scans & files <span class="dl-num muted">{dive.attachments.length}</span></h2>

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

  {#if dive.attachments.length}
    <ul class="list">
      {#each [...dive.attachments].sort((a, b) => a.sort - b.sort) as a (a.id)}
        <li class="row" class:cover={a.id === dive.cover_attachment_id}>
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
              placeholder="Caption"
              value={a.caption}
              onchange={(e) => patch(a, { caption: e.currentTarget.value })}
            />
            <div class="meta">
              <select
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
            {#if a.kind === 'photo'}
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                disabled={a.id === dive.cover_attachment_id}
                onclick={() => setCover(a)}
                >{a.id === dive.cover_attachment_id ? 'Cover' : 'Set cover'}</button
              >
            {/if}
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
