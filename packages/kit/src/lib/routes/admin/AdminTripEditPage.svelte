<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto, invalidateAll } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import type { TripAdmin, TripIn } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'trip-edit'> } = $props();

  function fromTrip(t: TripAdmin) {
    return {
      name: t.name,
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      description_md: t.description_md,
    };
  }

  // Initialised once from the load data; the slug in the URL never changes under us, and our own
  // save already knows what it just sent.
  // svelte-ignore state_referenced_locally
  let form = $state(fromTrip(data.trip));
  let error = $state('');
  let fieldErrors = $state<Record<string, string>>({});

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    fieldErrors = {};
    const body: TripIn = {
      slug: data.trip.slug,
      name: form.name.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      description_md: form.description_md,
    };
    try {
      if (data.trip.custom) {
        await adminJson(`/admin/trips/${data.trip.slug}`, 'PUT', body);
      } else {
        await adminJson('/admin/trips', 'POST', body);
      }
      toast.show({ kind: 'success', message: `${form.name} saved` });
      await invalidateAll();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
      fieldErrors = err instanceof AdminApiError ? err.fieldErrors : {};
    }
  }

  async function removeOverride() {
    if (
      !(await confirmDialog({
        title: `Remove the override for ${data.trip.name}?`,
        body: 'The derived trip (built from the logged dives) will show again.',
        confirmLabel: 'Remove override',
        danger: true,
      }))
    )
      return;
    error = '';
    try {
      await adminJson(`/admin/trips/${data.trip.slug}`, 'DELETE');
      await goto(urls.admin.trips());
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Could not remove override';
    }
  }
</script>

<p class="breadcrumb"><a href={urls.admin.trips()}>Trips</a> › {data.trip.name}</p>
<div class="head">
  <h1>
    {data.trip.name}
    {#if data.trip.custom}<span class="badge">custom</span>{/if}
  </h1>
  <a
    class="dl-btn dl-btn-ghost dl-btn-sm"
    href={urls.trip(data.trip.slug)}
    target="_blank"
    rel="noopener">View ↗</a
  >
</div>

<form class="dl-card form" onsubmit={save}>
  <div class="field-row">
    <Field label="Name" error={fieldErrors.name} required>
      {#snippet children(c)}<input {...c} type="text" bind:value={form.name} />{/snippet}
    </Field>
    <Field label="Slug" hint="Fixed: it is the trip's address.">
      {#snippet children(c)}<input {...c} type="text" value={data.trip.slug} readonly />{/snippet}
    </Field>
  </div>
  <div class="field-row">
    <Field label="Start date" error={fieldErrors.start_date}>
      {#snippet children(c)}<input {...c} type="date" bind:value={form.start_date} />{/snippet}
    </Field>
    <Field label="End date" error={fieldErrors.end_date}>
      {#snippet children(c)}<input {...c} type="date" bind:value={form.end_date} />{/snippet}
    </Field>
  </div>
  <Field label="Description (markdown)" error={fieldErrors.description_md}>
    {#snippet children(c)}
      <textarea {...c} rows="6" bind:value={form.description_md}></textarea>
    {/snippet}
  </Field>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="actions">
    <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm">Save</button>
  </div>
</form>

{#if data.trip.custom}
  <section class="dl-card danger-zone">
    <h2>Remove override</h2>
    <p class="muted">
      The derived trip stays — built automatically from the logged dives — only this name, dates and
      description go away.
    </p>
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm danger" onclick={removeOverride}
      >Remove override</button
    >
  </section>
{/if}

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
  .badge {
    font-family: var(--dl-font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--dl-color-accent-soft);
    color: var(--dl-color-accent);
    vertical-align: middle;
  }
  .form {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 16px 0 24px;
    background: var(--dl-color-bg-elevated);
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
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 13.5px;
    max-width: 68ch;
  }
  .danger {
    align-self: flex-start;
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
</style>
