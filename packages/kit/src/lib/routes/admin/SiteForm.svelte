<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import { countryOptions, fetchCountries, fetchSiteFields } from '$lib/core/admin/lookups';
  import { geoSourceText, type PickedPoint } from '$lib/core/admin/site-create';
  import {
    formDirty,
    lockedFields,
    overlayFields,
    siteFormBody,
    siteFormFrom,
    validateSiteForm,
    type SiteFormState,
  } from '$lib/core/admin/site-form';
  import { siteTypeOptions } from '$lib/core/dive/site-types';
  import { countryByIso3 } from '$lib/core/map/countries';
  import type { CountryOut, Region, Site, SiteFieldsOut } from '$lib/core/dive/types';
  import type { ComboOption } from '$lib/core/ui/combobox';
  import { announce } from '$lib/core/ui/announce';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';
  import Field from '$lib/components/ui/Field.svelte';
  import Combobox from '$lib/components/ui/Combobox.svelte';
  import LocationPicker from '$lib/components/admin/LocationPicker.svelte';

  const { urls } = getDivelog();

  let {
    site,
    regions,
    form = $bindable(),
    section = 'details',
    onSaved,
  }: {
    site: Site;
    regions: Region[];
    /** The form state; bind it from the page so it survives switching tabs. */
    form?: SiteFormState;
    /** Which fields to show: the record's description, or where it is. */
    section?: 'details' | 'location';
    onSaved: (site: Site) => void | Promise<void>;
  } = $props();

  // svelte-ignore state_referenced_locally
  if (!form) form = siteFormFrom(site);
  const f = $derived(form!);

  const uid = $props.id();
  const fid = (name: string) => `site-${uid}-${name}`;

  let errors = $state<Record<string, string>>({});
  let formError = $state('');
  let saving = $state(false);
  let siteFields = $state<SiteFieldsOut | null>(null);
  let countries = $state<CountryOut[]>([]);

  const locked = $derived(lockedFields(site, siteFields, f.fork));
  const yours = $derived(overlayFields(site, siteFields));
  const isLocked = (key: keyof SiteFormState) => locked.has(key);
  const lockNote = $derived(locked.size ? fid('lock-note') : '');
  const dirty = $derived(formDirty(f, site));
  const defaultMap = $derived(site.maps.find((m) => m.ref === site.default_map) ?? null);
  const typeOptions = $derived(siteTypeOptions(f.type));
  const countryChoices = $derived(
    countryOptions(
      countries,
      f.country ? [{ iso3: f.country, name: countryByIso3(f.country)?.name ?? f.country }] : [],
    ),
  );
  const regionOptions = $derived.by((): ComboOption[] => {
    const key = f.country.toUpperCase();
    const sorted = [...regions].sort((a, b) => a.name.localeCompare(b.name));
    const own = sorted.filter((r) => key && (r.country ?? '').toUpperCase() === key);
    const rest = sorted.filter((r) => !own.includes(r));
    const name = countryChoices.find((c) => c.iso3 === key)?.name ?? key;
    return [
      ...own.map((r) => ({ value: r.id, label: r.name, group: name })),
      ...rest.map((r) => ({
        value: r.id,
        label: r.name,
        group: key ? 'Other countries' : '',
        hint: r.country ?? undefined,
      })),
    ];
  });
  const point = $derived(f.lat !== null && f.lon !== null ? { lat: f.lat, lon: f.lon } : null);
  const accessPoint = $derived(
    f.access_lat !== null && f.access_lon !== null
      ? { lat: f.access_lat, lon: f.access_lon }
      : null,
  );

  onMount(() => {
    if (site.origin === 'commons')
      fetchSiteFields()
        .then((fields) => (siteFields = fields))
        .catch(() => {
          // no list: nothing is locked and the server still refuses objective changes
        });
    fetchCountries()
      .then((list) => (countries = Array.isArray(list) ? list : []))
      .catch(() => {
        // the site's own code stays selectable
      });
  });

  function startFork() {
    f.fork = true;
    announce('Fork mode: every field is editable; saving makes your own copy');
  }

  function cancelFork() {
    const fresh = siteFormFrom(site);
    const record = f as unknown as Record<string, unknown>;
    for (const key of lockedFields(site, siteFields, false)) record[key] = fresh[key];
    f.fork = false;
  }

  function onPick(picked: PickedPoint) {
    f.lat = picked.lat;
    f.lon = picked.lon;
    f.geo_source = geoSourceText(picked.source);
    delete errors.lat;
    delete errors.lon;
  }

  function onAccess(picked: PickedPoint) {
    f.access_lat = picked.lat;
    f.access_lon = picked.lon;
    delete errors.access;
  }

  async function focusFirstError() {
    await tick();
    const el = document.querySelector<HTMLElement>('.site-form [aria-invalid="true"]');
    el?.focus();
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    formError = '';
    errors = validateSiteForm(f);
    if (Object.keys(errors).length) {
      announce('Not saved: check the marked fields', { assertive: true });
      await focusFirstError();
      return;
    }
    saving = true;
    try {
      const path = `${adminApi('sites', site.id)}${f.fork ? '?fork=true' : ''}`;
      const saved = await adminJson<Site>(path, 'PUT', siteFormBody(f, site));
      toast.show({
        kind: 'success',
        message: f.fork ? `${site.name} forked from the commons` : `${f.name} saved`,
      });
      await onSaved(saved);
    } catch (err) {
      if (err instanceof AdminApiError) {
        errors = err.fieldErrors;
        formError = Object.keys(err.fieldErrors).length
          ? 'Not saved: check the marked fields.'
          : err.message;
        await focusFirstError();
      } else formError = 'Save failed';
    } finally {
      saving = false;
    }
  }

  function addPrice() {
    f.prices = [
      ...f.prices,
      { date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'EUR', note: '' },
    ];
  }

  type TextKey =
    | 'name'
    | 'full_name'
    | 'short_name'
    | 'aliases'
    | 'area'
    | 'system'
    | 'section_vocabulary'
    | 'summary'
    | 'verified'
    | 'geo_source'
    | 'access_note';
</script>

{#snippet lockChip(key: keyof SiteFormState)}
  {#if isLocked(key)}<span class="chip lock"><span aria-hidden="true">🔒</span> commons</span>
  {:else if yours.has(key)}<span class="chip yours">yours</span>{/if}
{/snippet}

{#snippet text(key: TextKey, label: string, hint = '', required = false)}
  <Field
    {label}
    id={fid(key)}
    {hint}
    {required}
    error={errors[key]}
    describedby={isLocked(key) ? lockNote : ''}
  >
    {#snippet extra()}{@render lockChip(key)}{/snippet}
    {#snippet children(control)}
      <input
        {...control}
        class="dl-input"
        type="text"
        bind:value={f[key]}
        readonly={isLocked(key)}
      />
    {/snippet}
  </Field>
{/snippet}

<form class="site-form" onsubmit={save} novalidate aria-label="Site {section}">
  {#if site.origin === 'commons' && locked.size}
    <div class="notice" id={lockNote}>
      <p>
        <span aria-hidden="true">🔒</span> This site comes from the shared commons. The fields
        marked <strong>commons</strong> belong to the shared record; what you change here (notes, prices,
        aliases, summary, maps and photos) is kept as your own overlay. To change the record itself, fork
        it: you get a full personal copy that shadows the commons record.
      </p>
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={startFork}
        >Fork to edit</button
      >
    </div>
  {:else if site.origin === 'commons' && f.fork}
    <div class="notice forking" role="status">
      <p>
        Forking: every field is editable now. <strong>Fork & save</strong> makes your own copy with these
        values; it keeps the commons history and tells you when the commons moves on.
      </p>
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={cancelFork}
        >Cancel fork</button
      >
    </div>
  {/if}

  {#if section === 'details'}
    <fieldset class="group">
      <legend>Basics</legend>
      <div class="grid">
        {@render text('name', 'Name', '', true)}
        <Field label="Site id" id={fid('site_id')} hint="Fixed once the site exists">
          {#snippet children(control)}
            <input {...control} class="dl-input mono" type="text" value={f.site_id} readonly />
          {/snippet}
        </Field>
        <Field
          label="Type"
          id={fid('type')}
          error={errors.type}
          describedby={isLocked('type') ? lockNote : ''}
        >
          {#snippet extra()}{@render lockChip('type')}{/snippet}
          {#snippet children(control)}
            <select {...control} class="dl-select" bind:value={f.type} disabled={isLocked('type')}>
              {#each typeOptions as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
            </select>
          {/snippet}
        </Field>
        <Field
          label="Water"
          id={fid('water')}
          error={errors.water}
          describedby={isLocked('water') ? lockNote : ''}
        >
          {#snippet extra()}{@render lockChip('water')}{/snippet}
          {#snippet children(control)}
            <select
              {...control}
              class="dl-select"
              bind:value={f.water}
              disabled={isLocked('water')}
            >
              <option value="salt">salt</option>
              <option value="fresh">fresh</option>
              <option value="brackish">brackish</option>
            </select>
          {/snippet}
        </Field>
        <Field
          label="Country"
          id={fid('country')}
          error={errors.country}
          describedby={isLocked('country') ? lockNote : ''}
        >
          {#snippet extra()}{@render lockChip('country')}{/snippet}
          {#snippet children(control)}
            <select
              {...control}
              class="dl-select"
              bind:value={f.country}
              disabled={isLocked('country')}
            >
              <option value="">— none —</option>
              {#each countryChoices as c (c.iso3)}<option value={c.iso3}>{c.name}</option>{/each}
            </select>
          {/snippet}
        </Field>
        <Field
          label="Region"
          id={fid('region')}
          error={errors.region}
          describedby={isLocked('region') ? lockNote : ''}
        >
          {#snippet extra()}{@render lockChip('region')}{/snippet}
          {#snippet children(control)}
            <Combobox
              {...control}
              bind:value={() => f.region || null, (v) => (f.region = v ?? '')}
              options={regionOptions}
              placeholder="— none —"
              disabled={isLocked('region')}
            />
          {/snippet}
        </Field>
      </div>
    </fieldset>

    <fieldset class="group">
      <legend>Names</legend>
      <div class="grid">
        {@render text('full_name', 'Full name')}
        {@render text('short_name', 'Short name')}
        {@render text('aliases', 'Also known as', 'Comma separated')}
        {@render text('area', 'Area / town')}
        {@render text('system', 'System (cave / reef)')}
        {@render text('section_vocabulary', 'Lines & sections', 'Comma separated')}
      </div>
      <div class="halocline">
        <label class="check">
          <input type="checkbox" bind:checked={f.halocline} disabled={isLocked('halocline')} />
          Halocline {@render lockChip('halocline')}
        </label>
        {#if f.halocline}
          <Field label="Halocline depth (m)" id={fid('halocline_m')} error={errors.halocline_m}>
            {#snippet children(control)}
              <input
                {...control}
                class="dl-input"
                type="number"
                step="any"
                min="0"
                bind:value={f.halocline_m}
                readonly={isLocked('halocline_m')}
              />
            {/snippet}
          </Field>
        {/if}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend>Description</legend>
      {@render text('summary', 'Summary', 'One sentence, used on cards')}
      <Field label="Story" id={fid('story')} hint="Markdown" error={errors.description_md}>
        {#snippet children(control)}
          <textarea {...control} class="dl-textarea" rows="8" bind:value={f.description_md}
          ></textarea>
        {/snippet}
      </Field>
      <Field label="Sources" id={fid('sources')} hint="One per line, “Title — url”">
        {#snippet children(control)}
          <textarea {...control} class="dl-textarea" rows="3" bind:value={f.sources}></textarea>
        {/snippet}
      </Field>
    </fieldset>

    <fieldset class="group">
      <legend>Entry prices {@render lockChip('prices')}</legend>
      {#each f.prices as price, i (i)}
        <div class="price-row">
          <input
            class="dl-input"
            type="date"
            aria-label="Price {i + 1} date"
            bind:value={price.date}
          />
          <input
            class="dl-input"
            type="number"
            step="0.01"
            min="0"
            aria-label="Price {i + 1} amount"
            bind:value={price.amount}
          />
          <input
            class="dl-input"
            type="text"
            maxlength="3"
            aria-label="Price {i + 1} currency"
            bind:value={price.currency}
          />
          <input
            class="dl-input"
            type="text"
            placeholder="note"
            aria-label="Price {i + 1} note"
            bind:value={price.note}
          />
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            aria-label="Remove price {i + 1}"
            onclick={() => (f.prices = f.prices.filter((_, j) => j !== i))}>×</button
          >
        </div>
      {/each}
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm add" onclick={addPrice}
        >+ Price</button
      >
    </fieldset>

    <fieldset class="group">
      <legend>Provenance</legend>
      <div class="grid">
        <div class="readonly">
          <span class="label">Map shown first</span>
          <span
            >{defaultMap
              ? `${defaultMap.title} (${defaultMap.collection})`
              : 'automatic (drawn → sketch → locator)'}</span
          >
          <a class="hint" href={urls.admin.siteMaps(site.id)}>set on the Maps tab</a>
        </div>
        {@render text('verified', 'Verified', 'web, inferred…')}
        {@render text('geo_source', 'Geo source', 'Filled in when the pin is placed')}
      </div>
      <Field label="Provenance notes (private)" id={fid('notes')}>
        {#snippet extra()}{@render lockChip('notes')}{/snippet}
        {#snippet children(control)}
          <textarea {...control} class="dl-textarea" rows="2" bind:value={f.notes}></textarea>
        {/snippet}
      </Field>
    </fieldset>
  {:else}
    <section class="group" aria-labelledby={fid('pos')}>
      <h3 class="legend" id={fid('pos')}>Position {@render lockChip('lat')}</h3>
      {#if isLocked('lat')}
        <p class="readonly-pos">
          {point ? `${point.lat}, ${point.lon}` : 'Not placed'} — the commons record's position; fork
          the site to move it.
        </p>
      {:else}
        <LocationPicker
          id={fid('picker')}
          value={point}
          onchange={onPick}
          label="Coordinates"
          siteType={f.type}
          country={f.country}
          error={errors.lat || errors.lon || ''}
        />
      {/if}
      <Field
        label="Show location"
        id={fid('visibility')}
        describedby={isLocked('location_visibility') ? lockNote : ''}
      >
        {#snippet extra()}{@render lockChip('location_visibility')}{/snippet}
        {#snippet children(control)}
          <select
            {...control}
            class="dl-select"
            bind:value={f.location_visibility}
            disabled={isLocked('location_visibility')}
          >
            <option value="exact">exact pin</option>
            <option value="region_only">region only (hide coordinates)</option>
          </select>
        {/snippet}
      </Field>
      {#if point}
        <a
          class="dl-btn dl-btn-ghost dl-btn-sm osm"
          href="https://www.openstreetmap.org/?mlat={point.lat}&mlon={point.lon}#map=15/{point.lat}/{point.lon}"
          target="_blank"
          rel="noopener">Check on OpenStreetMap ↗</a
        >
      {/if}
    </section>

    <section class="group" aria-labelledby={fid('entry')}>
      <h3 class="legend" id={fid('entry')}>Entry point {@render lockChip('access_lat')}</h3>
      <p class="hint">Where you get in, when it is not at the pin: a car park, stairs, a jetty.</p>
      {#if isLocked('access_lat')}
        <p class="readonly-pos">
          {accessPoint ? `${accessPoint.lat}, ${accessPoint.lon}` : 'Not set'}{f.access_note
            ? ` — ${f.access_note}`
            : ''}
        </p>
      {:else}
        <LocationPicker
          id={fid('access')}
          value={accessPoint}
          onchange={onAccess}
          label="Entry point coordinates"
          pinLabel="Entry point"
          siteType={f.type}
          near={point}
          markers={point ? [{ ...point, label: f.name || 'Site' }] : []}
          compact
          error={errors.access ?? ''}
        />
        <div class="entry-row">
          {@render text('access_note', 'Getting in', 'Parking, stairs, …')}
          {#if accessPoint || f.access_note}
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              onclick={() => {
                f.access_lat = null;
                f.access_lon = null;
                f.access_note = '';
              }}>Remove entry point</button
            >
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  {#if formError}<p class="error" role="alert">{formError}</p>{/if}
  <div class="save-bar">
    <Field label="What changed" id={fid('note')} hint="Becomes the revision note" class="note">
      {#snippet children(control)}
        <input
          {...control}
          class="dl-input"
          type="text"
          maxlength="200"
          placeholder="e.g. Moved the pin to the entry stairs"
          bind:value={f.note}
        />
      {/snippet}
    </Field>
    <span class="status" aria-live="polite">{dirty ? 'Unsaved changes' : 'All saved'}</span>
    <button type="submit" class="dl-btn dl-btn-solid" disabled={saving}
      >{saving ? 'Saving…' : f.fork ? 'Fork & save' : 'Save'}</button
    >
  </div>
</form>

<style>
  .site-form {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-4);
  }
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--dl-space-2) var(--dl-space-4);
    padding: var(--dl-space-3) var(--dl-space-4);
    border: 1px solid var(--dl-color-border-control);
    border-left: 3px solid var(--dl-color-accent);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
  }
  .notice.forking {
    border-left-color: var(--dl-color-warm);
  }
  .notice p {
    margin: 0;
    max-width: 75ch;
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-muted);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-3);
    margin: 0;
    padding: var(--dl-space-4);
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    min-width: 0;
  }
  .group legend,
  .legend {
    display: flex;
    align-items: center;
    gap: var(--dl-space-2);
    margin: 0;
    padding: 0 6px;
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-sm);
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .legend {
    padding: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--dl-space-3);
  }
  .chip {
    font-size: var(--dl-text-xs);
    letter-spacing: 0;
    text-transform: none;
    padding: 0 6px;
    border-radius: 999px;
  }
  .chip.lock {
    border: 1px solid var(--dl-color-border-control);
    color: var(--dl-color-text-muted);
  }
  .chip.yours {
    background: var(--dl-color-accent-soft);
    color: var(--dl-color-accent);
  }
  .mono {
    font-family: var(--dl-font-mono);
  }
  input[readonly] {
    color: var(--dl-color-text-muted);
  }
  .halocline,
  .entry-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--dl-space-3);
  }
  .entry-row :global(.dl-field) {
    flex: 1 1 260px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: var(--dl-space-2);
    min-height: 32px;
  }
  .check input {
    width: auto;
  }
  .price-row {
    display: grid;
    grid-template-columns: 150px 110px 64px 1fr auto;
    gap: var(--dl-space-2);
  }
  .add {
    align-self: flex-start;
  }
  .readonly {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--dl-text-md);
  }
  .readonly .label {
    color: var(--dl-color-text-muted);
  }
  .hint {
    margin: 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
  }
  .readonly-pos {
    margin: 0;
    font-family: var(--dl-font-mono);
    color: var(--dl-color-text-muted);
  }
  .osm {
    align-self: flex-start;
  }
  .error {
    margin: 0;
    color: var(--dl-color-danger);
  }
  .save-bar {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--dl-space-2) var(--dl-space-3);
    padding: var(--dl-space-3);
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
  }
  .save-bar :global(.note) {
    flex: 1 1 280px;
  }
  .status {
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
    padding-bottom: 10px;
  }
  .save-bar .dl-btn {
    min-height: 44px;
  }
  @media (max-width: 720px) {
    .price-row {
      grid-template-columns: 1fr 1fr;
    }
    .group {
      padding: var(--dl-space-3);
    }
    .save-bar .dl-btn {
      flex: 1 1 100%;
    }
  }
</style>
