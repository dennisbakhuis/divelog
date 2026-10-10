<script lang="ts">
  import { goto } from '$app/navigation';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import { slugify } from '$lib/core/admin/slug';
  import type { TripAdmin, TripIn } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let name = $state('');
  let slug = $state('');
  let slugTouched = $state(false);
  let start_date = $state('');
  let end_date = $state('');
  let description_md = $state('');
  let error = $state('');

  $effect(() => {
    if (!slugTouched) slug = slugify(name);
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const body: TripIn = {
      slug: slug || slugify(name),
      name: name.trim(),
      start_date: start_date || null,
      end_date: end_date || null,
      description_md,
    };
    try {
      const created = await adminJson<TripAdmin>('/admin/trips', 'POST', body);
      toast.show({ kind: 'success', message: `${created.name} created` });
      await goto(urls.admin.trip(created.slug));
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
    }
  }
</script>

<p class="breadcrumb"><a href={urls.admin.trips()}>Trips</a> › New trip</p>
<h1>New trip</h1>

<form class="dl-card form" onsubmit={save}>
  <div class="field-row">
    <label>Name<input type="text" bind:value={name} required /></label>
    <label
      >Slug<input
        type="text"
        bind:value={slug}
        oninput={() => (slugTouched = true)}
        placeholder="auto"
      /></label
    >
  </div>
  <div class="field-row">
    <label>Start date<input type="date" bind:value={start_date} /></label>
    <label>End date<input type="date" bind:value={end_date} /></label>
  </div>
  <label>Description (markdown)<textarea rows="6" bind:value={description_md}></textarea></label>
  {#if error}<p class="error">{error}</p>{/if}
  <div class="actions">
    <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm">Create</button>
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
