<script lang="ts">
  import { goto } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import type { PersonPrivate } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import Field from '$lib/components/ui/Field.svelte';
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
  let fieldErrors = $state<Record<string, string>>({});

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
    fieldErrors = {};
    try {
      const created = await adminJson<PersonPrivate>('/admin/people', 'POST', body());
      toast.show({ kind: 'success', message: `${created.first_name} added` });
      await goto(urls.admin.person(created.id));
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
      fieldErrors = err instanceof AdminApiError ? err.fieldErrors : {};
    }
  }
</script>

<p class="breadcrumb"><a href={urls.admin.people()}>People</a> › New person</p>
<h1>New person</h1>

<form class="dl-card form" onsubmit={save}>
  <div class="field-row">
    <Field label="First name" error={fieldErrors.first_name} required>
      {#snippet children(c)}<input {...c} type="text" bind:value={form.first_name} />{/snippet}
    </Field>
    <Field label="Last name (private)" error={fieldErrors.last_name}>
      {#snippet children(c)}<input {...c} type="text" bind:value={form.last_name} />{/snippet}
    </Field>
    <Field label="Alias (shown instead of first name)" error={fieldErrors.alias}>
      {#snippet children(c)}<input {...c} type="text" bind:value={form.alias} />{/snippet}
    </Field>
    <Field label="Shown as" error={fieldErrors.display}>
      {#snippet children(c)}
        <select {...c} bind:value={form.display}>
          <option value="alias-or-first">alias, else first name</option>
          <option value="full">full name</option>
          <option value="hidden">hidden everywhere</option>
        </select>
      {/snippet}
    </Field>
  </div>
  <div class="field-row">
    <Field label="Other / former names (comma separated)" error={fieldErrors.aliases}>
      {#snippet children(c)}
        <input {...c} type="text" bind:value={form.aliases} placeholder="Kim Jansen, K. Jansen" />
      {/snippet}
    </Field>
    <Field label="E-mail (private)" error={fieldErrors.email}>
      {#snippet children(c)}<input {...c} type="email" bind:value={form.email} />{/snippet}
    </Field>
  </div>
  <Field label="Notes (private)" error={fieldErrors.notes}>
    {#snippet children(c)}<textarea {...c} rows="2" bind:value={form.notes}></textarea>{/snippet}
  </Field>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
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
