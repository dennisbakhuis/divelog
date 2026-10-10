<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto, invalidateAll } from '$app/navigation';
  import { adminJson, adminUpload, AdminApiError } from '$lib/core/admin/client';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import type { PersonPrivate } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'person-edit'> } = $props();

  function fromPerson(p: PersonPrivate) {
    return {
      first_name: p.first_name,
      last_name: p.last_name ?? '',
      alias: p.alias ?? '',
      aliases: p.aliases.join(', '),
      email: p.email ?? '',
      display: p.display,
      notes: p.notes ?? '',
      bio_md: '',
    };
  }

  // Initialised once from the load data; the id in the URL never changes under us, and our own
  // actions (save, avatar upload) already know what they just sent.
  // svelte-ignore state_referenced_locally
  let form = $state(fromPerson(data.person));
  let error = $state('');
  let deleteError = $state('');

  function body() {
    return {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      alias: form.alias.trim() || null,
      aliases: form.aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      email: form.email.trim() || null,
      display: form.display,
      notes: form.notes.trim() || null,
      bio_md: form.bio_md,
    };
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    try {
      await adminJson(`/admin/people/${data.person.id}`, 'PUT', body());
      toast.show({ kind: 'success', message: `${form.first_name} saved` });
      await invalidateAll();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
    }
  }

  async function uploadAvatar(files: FileList | null) {
    if (!files?.length) return;
    try {
      await adminUpload(`/admin/people/${data.person.id}/avatar`, files[0]);
      toast.show({ kind: 'success', message: 'Avatar updated' });
      await invalidateAll();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Upload failed';
    }
  }

  async function remove() {
    if (data.person.dives) return;
    if (!(await confirmDialog({ title: `Delete ${data.person.name}?`, danger: true }))) return;
    deleteError = '';
    try {
      await adminJson(`/admin/people/${data.person.id}`, 'DELETE');
      await goto(urls.admin.people());
    } catch (err) {
      deleteError = err instanceof AdminApiError ? err.message : 'Could not delete';
    }
  }
</script>

<p class="breadcrumb"><a href={urls.admin.people()}>People</a> › {data.person.name}</p>
<div class="head">
  <h1>{data.person.name}</h1>
  <a
    class="dl-btn dl-btn-ghost dl-btn-sm"
    href={urls.person(data.person.slug)}
    target="_blank"
    rel="noopener">View ↗</a
  >
</div>

<form class="dl-card form" onsubmit={save}>
  <div class="field-row">
    <label>First name<input type="text" bind:value={form.first_name} required /></label>
    <label>Last name (private)<input type="text" bind:value={form.last_name} /></label>
    <label>Alias (shown instead of first name)<input type="text" bind:value={form.alias} /></label>
    <label>
      Shown as
      <select bind:value={form.display}>
        <option value="alias-or-first">alias, else first name</option>
        <option value="full">full name</option>
        <option value="hidden">hidden everywhere</option>
      </select>
    </label>
  </div>
  <div class="field-row">
    <label
      >Other / former names (comma separated)<input
        type="text"
        bind:value={form.aliases}
        placeholder="Kim Jansen, K. Jansen"
      /></label
    >
    <label>E-mail (private)<input type="email" bind:value={form.email} /></label>
  </div>
  <label>Notes (private)<textarea rows="2" bind:value={form.notes}></textarea></label>

  <div class="avatar-row">
    <span class="avatar">
      {#if data.person.avatar_url}<img src={data.person.avatar_url} alt="" />{:else}{data.person
          .first_name[0]}{/if}
    </span>
    <label class="file">
      <span class="dl-btn dl-btn-ghost dl-btn-sm">Upload avatar</span>
      <input
        type="file"
        accept="image/*"
        onchange={(e) => {
          void uploadAvatar(e.currentTarget.files);
          e.currentTarget.value = '';
        }}
      />
    </label>
    <span class="muted">Square-cropped to 256 px, EXIF stripped.</span>
  </div>

  {#if error}<p class="error">{error}</p>{/if}
  <div class="actions">
    <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm">Save</button>
  </div>
</form>

<section class="dl-card danger-zone">
  <h2>Delete person</h2>
  <p class="muted">
    {#if data.person.dives}
      Named on {data.person.dives} dive{data.person.dives === 1 ? '' : 's'} — remove them from those dives
      first.
    {:else}
      Not named on any dive — safe to delete.
    {/if}
  </p>
  {#if deleteError}<p class="error">{deleteError}</p>{/if}
  <button
    type="button"
    class="dl-btn dl-btn-ghost dl-btn-sm danger"
    disabled={data.person.dives > 0}
    title={data.person.dives
      ? `Named on ${data.person.dives} ${data.person.dives === 1 ? 'dive' : 'dives'}`
      : ''}
    onclick={remove}
    >{data.person.dives
      ? `Named on ${data.person.dives} ${data.person.dives === 1 ? 'dive' : 'dives'}`
      : 'Delete'}</button
  >
</section>

<style>
  .breadcrumb {
    font-size: 13.5px;
    color: var(--dl-color-text-muted);
    margin-bottom: 6px;
  }
  .breadcrumb a {
    color: inherit;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 13.5px;
  }
  .form {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 16px 0 24px;
    background: var(--dl-color-bg-elevated);
  }
  .avatar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--dl-color-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--dl-font-display);
    font-weight: 600;
    color: var(--dl-color-accent);
    overflow: hidden;
    flex: none;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .file input {
    display: none;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .danger-zone {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px dashed var(--dl-color-border-strong);
  }
  .danger-zone h2 {
    font-size: 15px;
    margin: 0;
  }
  .danger-zone .danger {
    align-self: flex-start;
  }
  .danger:not(:disabled):hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
  .danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
