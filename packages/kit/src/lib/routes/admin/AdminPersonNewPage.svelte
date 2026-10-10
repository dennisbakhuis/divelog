<script lang="ts">
  import { goto } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import type { PersonPrivate } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  const empty = () => ({
    first_name: '',
    last_name: '',
    alias: '',
    aliases: '',
    email: '',
    display: 'alias-or-first',
    notes: '',
    bio_md: '',
  });
  let form = $state(empty());
  let error = $state('');

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
      const created = await adminJson<PersonPrivate>('/admin/people', 'POST', body());
      toast.show({ kind: 'success', message: `${created.first_name} added` });
      await goto(urls.admin.person(created.id));
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
    }
  }
</script>

<p class="breadcrumb"><a href={urls.admin.people()}>People</a> › New person</p>
<h1>New person</h1>

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
  {#if error}<p class="error">{error}</p>{/if}
  <div class="actions">
    <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm">Add</button>
  </div>
</form>

<style>
  .breadcrumb {
    font-size: 13.5px;
    color: var(--dl-color-text-muted);
    margin-bottom: 6px;
  }
  .breadcrumb a {
    color: inherit;
  }
  .form {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 16px;
    background: var(--dl-color-bg-elevated);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
</style>
