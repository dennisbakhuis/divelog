<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { invalidateAll } from '$app/navigation';
  import { adminJson, adminUpload, AdminApiError } from '$lib/core/admin/client';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import type { GearItem, GearSetup, Tank } from '$lib/core/dive/types';
  import { emptyTank, presetsFor } from '$lib/core/admin/dive-input';
  import Field from '$lib/components/ui/Field.svelte';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { config, urls } = getDivelog();
  const presets = presetsFor(config);

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
    tanks: [] as Tank[],
    suit: '',
    weights_kg: null as number | null,
  });
  let item = $state(emptyItem());
  let setup = $state(emptySetup());
  let error = $state('');

  function isDirty<T>(a: T, b: T): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  async function editItem(i: GearItem) {
    if (
      isDirty(item, emptyItem()) &&
      !(await confirmDialog({
        title: 'Discard the item you were typing?',
        confirmLabel: 'Discard',
      }))
    )
      return;
    item = { ...emptyItem(), ...i, acquired: i.acquired ?? '', retired: i.retired ?? '' };
  }
  async function editSetup(s: GearSetup) {
    if (
      isDirty(setup, emptySetup()) &&
      !(await confirmDialog({
        title: 'Discard the setup you were typing?',
        confirmLabel: 'Discard',
      }))
    )
      return;
    setup = {
      id: s.id,
      slug: s.slug,
      name: s.name,
      description_md: s.description_md,
      sort: s.sort,
      item_ids: s.items.map((i) => i.id),
      tanks: (s.tanks ?? []).map((t) => ({ ...t })),
      suit: s.suit ?? '',
      weights_kg: s.weights_kg ?? null,
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
      suit: setup.suit.trim() || null,
      weights_kg:
        setup.weights_kg === null || String(setup.weights_kg) === ''
          ? null
          : Number(setup.weights_kg),
      tanks: setup.tanks.filter((t) => t.cylinder.trim()),
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
    if (!(await confirmDialog({ title: `Delete ${i.name}?`, danger: true }))) return;
    await adminJson(`/admin/gear/items/${i.id}`, 'DELETE');
    await invalidateAll();
  }
  async function removeSetup(s: GearSetup) {
    if (!(await confirmDialog({ title: `Delete setup ${s.name}?`, danger: true }))) return;
    await adminJson(`/admin/gear/setups/${s.id}`, 'DELETE');
    await invalidateAll();
  }
  async function photo(i: GearItem, files: FileList | null) {
    if (!files?.length) return;
    await adminUpload(`/admin/gear/items/${i.id}/photo`, files[0]);
    await invalidateAll();
  }
  function mixLabel(t: Tank): string {
    if (t.gas === 'air') return 'air';
    if (t.gas === 'oxygen') return 'oxygen';
    if (t.gas === 'trimix') return `${t.o2_pct ?? '?'}/${t.he_pct ?? '?'}`;
    return `EAN${t.o2_pct ?? '?'}`;
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
{#if error}<p class="error" role="alert">{error}</p>{/if}

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
      <fieldset class="template">
        <legend>Dived with</legend>
        <p class="muted">"Use gear setup" in the dive editor fills these in.</p>
        {#each setup.tanks as tank, i (i)}
          <div class="tank-row">
            <Field label="Role" id="dl-setup-tank-{i}-role">
              {#snippet children(c)}
                <select {...c} bind:value={tank.role}>
                  <option value="back">back gas</option>
                  <option value="stage">stage</option>
                  <option value="deco">deco gas</option>
                  <option value="bailout">bailout</option>
                </select>
              {/snippet}
            </Field>
            <Field label="Cylinder" id="dl-setup-tank-{i}-cylinder">
              {#snippet children(c)}
                <input
                  {...c}
                  type="text"
                  list="dl-setup-cylinders"
                  bind:value={tank.cylinder}
                  onchange={() => {
                    const preset = presets.cylinders.find(
                      (p) => p.name.toLowerCase() === tank.cylinder.trim().toLowerCase(),
                    );
                    if (preset) tank.volume_l = preset.volume_l;
                  }}
                />
              {/snippet}
            </Field>
            <Field label="Gas ({mixLabel(tank)})" id="dl-setup-tank-{i}-gas">
              {#snippet children(c)}
                <select
                  {...c}
                  value=""
                  onchange={(e) => {
                    const std = presets.gases.find((g) => g.label === e.currentTarget.value);
                    if (!std) return;
                    tank.gas = std.gas;
                    tank.o2_pct = std.o2;
                    tank.he_pct = std.he;
                    e.currentTarget.value = '';
                  }}
                >
                  <option value="">change…</option>
                  {#each presets.gases as g (g.label)}<option value={g.label}>{g.label}</option
                    >{/each}
                </select>
              {/snippet}
            </Field>
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              onclick={() => (setup.tanks = setup.tanks.filter((_, j) => j !== i))}
              ><span aria-hidden="true">×</span> Remove tank<span class="dl-visually-hidden">
                {i + 1}</span
              ></button
            >
          </div>
        {/each}
        <datalist id="dl-setup-cylinders">
          {#each presets.cylinders as p (p.name)}<option value={p.name}>{p.volume_l} L</option
            >{/each}
        </datalist>
        <div class="actions">
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            onclick={() =>
              (setup.tanks = [...setup.tanks, emptyTank(setup.tanks.length ? 'stage' : 'back')])}
            >+ Tank</button
          >
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            onclick={() => (setup.tanks = [...setup.tanks, emptyTank('deco')])}>+ Deco gas</button
          >
        </div>
        <div class="field-row">
          <Field label="Suit" id="dl-setup-suit">
            {#snippet children(c)}<input {...c} type="text" bind:value={setup.suit} />{/snippet}
          </Field>
          <Field label="Weights (kg)" id="dl-setup-weights">
            {#snippet children(c)}
              <input {...c} type="number" step="0.5" min="0" bind:value={setup.weights_kg} />
            {/snippet}
          </Field>
        </div>
      </fieldset>
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
            >{#if s.tanks?.length || s.suit || s.weights_kg != null}<br /><span class="muted"
                >{[
                  s.tanks?.map((t) => `${t.cylinder} ${mixLabel(t)}`).join(' + '),
                  s.suit,
                  s.weights_kg != null ? `${s.weights_kg} kg` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}</span
              >{/if}
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
    grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr));
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
    flex-wrap: wrap;
    gap: 8px;
  }
  .template {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 10px 12px 12px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius-sm);
  }
  .template legend {
    padding: 0 4px;
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-muted);
  }
  .template p {
    margin: 0;
  }
  .tank-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
    align-items: end;
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
