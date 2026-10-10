<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto, invalidateAll } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import type { TripAdmin, TripIn } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
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

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = '';
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
    }
  }

  async function removeOverride() {
    if (
      !confirm(
        `Remove the override for ${data.trip.name}? The derived trip (built from the logged dives) will show again.`,
      )
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
    <label>Name<input type="text" bind:value={form.name} required /></label>
    <label>Slug<input type="text" value={data.trip.slug} disabled /></label>
  </div>
  <div class="field-row">
    <label>Start date<input type="date" bind:value={form.start_date} /></label>
    <label>End date<input type="date" bind:value={form.end_date} /></label>
  </div>
  <label
    >Description (markdown)<textarea rows="6" bind:value={form.description_md}></textarea></label
  >
  {#if error}<p class="error">{error}</p>{/if}
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
