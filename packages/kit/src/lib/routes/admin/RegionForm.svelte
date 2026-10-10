<script lang="ts">
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import { slugify } from '$lib/core/admin/slug';
  import type { Region, RegionIn } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  let {
    region = null,
    initial = {},
    onSaved,
  }: {
    /** The region being edited; null creates a new one. */
    region?: Region | null;
    /** Starting values for a new region (the country of the site being created). */
    initial?: { name?: string; country?: string };
    onSaved: (region: Region) => void | Promise<void>;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  let form = $state({
    id: region?.id ?? '',
    name: region?.name ?? initial.name ?? '',
    country: region?.country ?? initial.country ?? '',
    waters: region?.waters.join(', ') ?? '',
    body_md: region?.body_md ?? '',
  });
  let error = $state('');
  let fieldErrors = $state<Record<string, string>>({});
  let saving = $state(false);

  function body(): RegionIn {
    return {
      id: form.id || slugify(form.name),
      name: form.name.trim(),
      country: form.country.trim().toUpperCase() || null,
      waters: form.waters
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
      body_md: form.body_md,
    };
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    fieldErrors = {};
    saving = true;
    try {
      const saved = region
        ? await adminJson<Region>(`/admin/regions/${region.id}`, 'PUT', body())
        : await adminJson<Region>('/admin/regions', 'POST', body());
      toast.show({ kind: 'success', message: `${saved.name} ${region ? 'saved' : 'created'}` });
      await onSaved(saved);
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
      fieldErrors = err instanceof AdminApiError ? err.fieldErrors : {};
    } finally {
      saving = false;
    }
  }
</script>

<form class="dl-card form" onsubmit={save}>
  <div class="field-row">
    <Field label="Name" error={fieldErrors.name} required>
      {#snippet children(c)}<input {...c} type="text" bind:value={form.name} />{/snippet}
    </Field>
    <Field label="Id" error={fieldErrors.id} hint={region ? 'Fixed once created.' : ''}>
      {#snippet children(c)}
        <input
          {...c}
          type="text"
          bind:value={form.id}
          readonly={!!region}
          pattern="[a-z0-9-]+"
          placeholder="auto from name"
        />
      {/snippet}
    </Field>
    <Field label="Country (ISO3)" error={fieldErrors.country}>
      {#snippet children(c)}
        <input {...c} type="text" maxlength="3" pattern="[A-Za-z]{3}" bind:value={form.country} />
      {/snippet}
    </Field>
  </div>
  <Field label="Waters (comma separated)" error={fieldErrors.waters}>
    {#snippet children(c)}
      <input {...c} type="text" bind:value={form.waters} placeholder="North Sea, Oosterschelde" />
    {/snippet}
  </Field>
  <Field label="Description (markdown)" error={fieldErrors.body_md}>
    {#snippet children(c)}<textarea {...c} rows="12" bind:value={form.body_md}></textarea>{/snippet}
  </Field>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="actions">
    <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm" disabled={saving}
      >{saving ? 'Saving…' : region ? 'Save' : 'Create'}</button
    >
  </div>
</form>

<style>
  .form {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
    background: var(--dl-color-bg-elevated);
  }
  input[readonly] {
    color: var(--dl-color-text-muted);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
</style>
