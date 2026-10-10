<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { invalidateAll } from '$app/navigation';
  import { adminJson, adminUpload, AdminApiError } from '$lib/core/admin/client';
  import type { GearItem, GearSetup } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'gear'> } = $props();

  const CATEGORIES = [
    'regulator',
    'bcd',
    'wing',
    'computer',
    'dpv',
    'light',
    'suit',
    'cylinder',
    'mask',
    'fins',
    'reel',
    'camera',
    'other',
  ];

  const emptyItem = () => ({
    id: '',
    name: '',
    category: 'other',
    brand: '',
    model: '',
    acquired: '',
    retired: '',
    notes_md: '',
    sort: 0,
  });
  const emptySetup = () => ({
    id: '',
    slug: '',
    name: '',
    description_md: '',
    sort: 0,
    item_ids: [] as string[],
  });
  let item = $state(emptyItem());
  let setup = $state(emptySetup());
  let error = $state('');

  function isDirty<T>(a: T, b: T): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  function editItem(i: GearItem) {
    if (isDirty(item, emptyItem()) && !confirm('Discard the item you were typing?')) return;
    item = { ...emptyItem(), ...i, acquired: i.acquired ?? '', retired: i.retired ?? '' };
  }
  function editSetup(s: GearSetup) {
    if (isDirty(setup, emptySetup()) && !confirm('Discard the setup you were typing?')) return;
    setup = {
      id: s.id,
      slug: s.slug,
      name: s.name,
      description_md: s.description_md,
      sort: s.sort,
      item_ids: s.items.map((i) => i.id),
    };
  }

  async function saveItem(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const body = { ...item, acquired: item.acquired || null, retired: item.retired || null };
    try {
      if (item.id) await adminJson(`/admin/gear/items/${item.id}`, 'PUT', body);
      else await adminJson('/admin/gear/items', 'POST', body);
      toast.show({ kind: 'success', message: `${item.name} saved` });
      item = emptyItem();
      await invalidateAll();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
    }
  }

  async function saveSetup(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const body = {
      ...setup,
      slug:
        setup.slug ||
        setup.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
    };
    try {
      if (setup.id) await adminJson(`/admin/gear/setups/${setup.id}`, 'PUT', body);
      else await adminJson('/admin/gear/setups', 'POST', body);
      toast.show({ kind: 'success', message: `${setup.name} saved` });
      setup = emptySetup();
      await invalidateAll();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
    }
  }

  async function removeItem(i: GearItem) {
    if (!confirm(`Delete ${i.name}?`)) return;
    await adminJson(`/admin/gear/items/${i.id}`, 'DELETE');
    await invalidateAll();
  }
  async function removeSetup(s: GearSetup) {
    if (!confirm(`Delete setup ${s.name}?`)) return;
    await adminJson(`/admin/gear/setups/${s.id}`, 'DELETE');
    await invalidateAll();
  }
  async function photo(i: GearItem, files: FileList | null) {
    if (!files?.length) return;
    await adminUpload(`/admin/gear/items/${i.id}/photo`, files[0]);
    await invalidateAll();
  }
  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }
</script>

<div class="head">
  <h1>Gear</h1>
  <a class="dl-btn dl-btn-ghost dl-btn-sm" href={urls.gear()} target="_blank" rel="noopener"
    >View ↗</a
  >
</div>
{#if error}<p class="error">{error}</p>{/if}

<div class="columns">
  <section>
    <h2>Setups</h2>
    <form class="dl-card form" onsubmit={saveSetup}>
      <div class="field-row">
        <label>Name<input type="text" bind:value={setup.name} required /></label>
        <label>Slug<input type="text" bind:value={setup.slug} placeholder="auto" /></label>
        <label>Sort<input type="number" bind:value={setup.sort} /></label>
      </div>
      <label>Description<textarea rows="2" bind:value={setup.description_md}></textarea></label>
      <div class="chips">
        {#each data.items as i (i.id)}
          <button
            type="button"
            class="dl-tag"
            class:active={setup.item_ids.includes(i.id)}
            aria-pressed={setup.item_ids.includes(i.id)}
            onclick={() => (setup.item_ids = toggle(setup.item_ids, i.id))}>{i.name}</button
          >
        {/each}
      </div>
      <div class="actions">
        <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm"
          >{setup.id ? 'Save setup' : 'Create setup'}</button
        >
        {#if setup.id}<button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            onclick={() => (setup = emptySetup())}>Cancel</button
          >{/if}
      </div>
    </form>
    <ul class="list">
      {#each data.setups as s (s.id)}
        <li class="dl-card row">
          <div>
            <strong>{s.name}</strong><br /><span class="muted"
              >{s.items.map((i) => i.name).join(', ') || 'no items'}</span
            >
          </div>
          <div class="row-actions">
            <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => editSetup(s)}
              >Edit</button
            >
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              onclick={() => removeSetup(s)}>Delete</button
            >
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <h2>Items</h2>
    <form class="dl-card form" onsubmit={saveItem}>
      <div class="field-row">
        <label>Name<input type="text" bind:value={item.name} required /></label>
        <label>
          Category
          <select bind:value={item.category}>
            {#each CATEGORIES as c (c)}<option value={c}>{c}</option>{/each}
          </select>
        </label>
        <label>Brand<input type="text" bind:value={item.brand} /></label>
        <label>Model<input type="text" bind:value={item.model} /></label>
        <label>Acquired<input type="date" bind:value={item.acquired} /></label>
        <label>Retired<input type="date" bind:value={item.retired} /></label>
      </div>
      <label>Notes (markdown)<textarea rows="2" bind:value={item.notes_md}></textarea></label>
      <div class="actions">
        <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm"
          >{item.id ? 'Save item' : 'Create item'}</button
        >
        {#if item.id}<button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            onclick={() => (item = emptyItem())}>Cancel</button
          >{/if}
      </div>
    </form>
    <ul class="list">
      {#each data.items as i (i.id)}
        <li class="dl-card row">
          <div class="thumb">
            {#if i.photo_url}<img src={i.photo_url} alt="" />{/if}
          </div>
          <div>
            <strong>{i.name}</strong>
            <span class="muted"
              >{i.category} · {i.brand} {i.model}{i.retired ? ' · retired' : ''}</span
            >
          </div>
          <div class="row-actions">
            <label class="file dl-btn dl-btn-ghost dl-btn-sm"
              >Photo<input
                type="file"
                accept="image/*"
                onchange={(e) => photo(i, e.currentTarget.files)}
              /></label
            >
            <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => editItem(i)}
              >Edit</button
            >
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              onclick={() => removeItem(i)}>Delete</button
            >
          </div>
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .head h1 {
    margin-bottom: 0;
  }
  .columns {
    display: grid;
    gap: 28px;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    align-items: start;
  }
  h2 {
    font-size: 18px;
  }
  .form {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 14px;
    background: var(--dl-color-bg-elevated);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips .dl-tag {
    cursor: pointer;
  }
  .dl-tag.active {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-accent);
  }
  .actions {
    display: flex;
    gap: 8px;
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
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
  }
  .row > div:first-child:not(.thumb) {
    grid-column: 1 / 3;
  }
  .thumb {
    width: 48px;
    height: 36px;
    border-radius: 4px;
    background: var(--dl-color-surface-2);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 13px;
  }
  .row-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .file {
    cursor: pointer;
    flex-direction: row;
    color: var(--dl-color-text);
  }
  .file input {
    display: none;
  }
</style>
