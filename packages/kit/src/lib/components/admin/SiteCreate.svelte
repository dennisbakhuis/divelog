<script lang="ts" module>
  /** What the owner asked for with the create button they pressed. */
  export type SiteCreateAction = 'create' | 'log' | 'map' | 'use';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import { SITE_ID } from '$lib/core/admin/slug';
  import {
    draftSiteId,
    emptySiteDraft,
    fetchNearby,
    geoSourceText,
    nearbyPath,
    nearbyReason,
    siteCreateBody,
    siteIdStatus,
    validateDraft,
    type PickedPoint,
    type SiteDraft,
  } from '$lib/core/admin/site-create';
  import { countryOptions, fetchCountries } from '$lib/core/admin/lookups';
  import { siteTypeOptions, waterDefault } from '$lib/core/dive/site-types';
  import { countryAt, countryByIso3, regionNearest } from '$lib/core/map/countries';
  import type { LatLon } from '$lib/core/map/coords';
  import type { CountryOut, NearbySitesOut, Region, Site } from '$lib/core/dive/types';
  import type { ComboOption } from '$lib/core/ui/combobox';
  import { announce } from '$lib/core/ui/announce';
  import { toast } from '$lib/components/stores/toast.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import Combobox from '$lib/components/ui/Combobox.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Disclosure from '$lib/components/ui/Disclosure.svelte';
  import OriginBadge from '$lib/components/shell/OriginBadge.svelte';
  import LocationPicker, { type PickerMarker } from './LocationPicker.svelte';
  import RegionForm from '$lib/routes/admin/RegionForm.svelte';

  const ID_DELAY_MS = 350;
  const NEARBY_DELAY_MS = 400;

  let {
    regions,
    initial = {},
    near = null,
    compact = false,
    autofocus = true,
    onCreated,
    onUse,
    onCancel,
  }: {
    regions: Region[];
    /** Values to start from: a name typed in a search, the country of the last site. */
    initial?: Partial<SiteDraft>;
    /** Where the map looks first while nothing is placed. */
    near?: LatLon | null;
    /** The dive editor's dialog: one "Create & use" action and a Cancel. */
    compact?: boolean;
    autofocus?: boolean;
    /** The site was created; `action` is the button pressed. */
    onCreated: (site: Site, action: SiteCreateAction) => void | Promise<void>;
    /** An existing or commons site was chosen from the nearby list instead. */
    onUse?: (site: Site) => void | Promise<void>;
    /** Shown as a Cancel button when given (the dialog). */
    onCancel?: () => void;
  } = $props();

  const uid = $props.id();
  const fid = (name: string) => `site-create-${uid}-${name}`;

  // svelte-ignore state_referenced_locally
  let draft = $state<SiteDraft>(emptySiteDraft(initial));
  // svelte-ignore state_referenced_locally
  let touched = $state({ country: !!initial.country, region: !!initial.region, water: false });
  let errors = $state<Record<string, string>>({});
  let formError = $state('');
  let busy = $state<SiteCreateAction | null>(null);
  let nameInput = $state<HTMLInputElement>();

  // svelte-ignore state_referenced_locally
  let localRegions = $state<Region[]>([...regions]);
  let countries = $state<CountryOut[]>([]);
  let pinCountry = $state<{ iso3: string; name: string; inside: boolean } | null>(null);
  let regionFromPin = $state(false);
  let regionDialog = $state(false);

  const point = $derived<LatLon | null>(
    draft.lat !== null && draft.lon !== null ? { lat: draft.lat, lon: draft.lon } : null,
  );
  const newId = $derived(draftSiteId(draft));
  let availability = $state<'checking' | 'free' | 'taken' | null>(null);
  let nearby = $state<NearbySitesOut>({ log: [], commons: [] });
  const nearbyCount = $derived(nearby.log.length + nearby.commons.length);
  let usingId = $state('');

  const typeOptions = $derived(siteTypeOptions(draft.type));
  const countryChoices = $derived(
    countryOptions(countries, [
      ...(pinCountry ? [pinCountry] : []),
      ...(draft.country
        ? [
            {
              iso3: draft.country,
              name: countryByIso3(draft.country)?.name ?? draft.country,
            },
          ]
        : []),
    ]),
  );
  const regionOptions = $derived.by((): ComboOption[] => {
    const key = draft.country.toUpperCase();
    const countryName = countryChoices.find((c) => c.iso3 === key)?.name ?? key;
    const sorted = [...localRegions].sort((a, b) => a.name.localeCompare(b.name));
    const own = sorted.filter((r) => key && (r.country ?? '').toUpperCase() === key);
    const rest = sorted.filter((r) => !own.includes(r));
    return [
      ...own.map((r) => ({ value: r.id, label: r.name, group: countryName })),
      ...rest.map((r) => ({
        value: r.id,
        label: r.name,
        group: key ? 'Other countries' : '',
        hint: r.country ?? undefined,
      })),
    ];
  });
  const nearbyMarkers = $derived<PickerMarker[]>(
    [...nearby.log, ...nearby.commons].flatMap((s) =>
      s.lat !== null && s.lon !== null ? [{ lat: s.lat, lon: s.lon, label: s.name }] : [],
    ),
  );

  onMount(() => {
    if (autofocus) nameInput?.focus();
    fetchCountries()
      .then((list) => (countries = list))
      .catch(() => {
        // no list: the pin and the site's own code still fill the select
      });
  });

  $effect(() => {
    const id = newId;
    availability = null;
    if (!SITE_ID.test(id)) return;
    let stale = false;
    const timer = setTimeout(async () => {
      availability = 'checking';
      const status = await siteIdStatus(id);
      if (!stale) availability = status;
    }, ID_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  $effect(() => {
    const path = nearbyPath({ name: draft.name, lat: draft.lat, lon: draft.lon });
    if (!path) {
      nearby = { log: [], commons: [] };
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      const found = await fetchNearby(path);
      if (stale) return;
      nearby = found;
      const count = found.log.length + found.commons.length;
      if (count) announce(`${count} similar site${count === 1 ? '' : 's'} found`);
    }, NEARBY_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  let pickSeq = 0;

  async function onPick(picked: PickedPoint) {
    draft.lat = picked.lat;
    draft.lon = picked.lon;
    draft.geo_source = geoSourceText(picked.source);
    delete errors.lat;
    delete errors.lon;
    const mine = ++pickSeq;
    const hit = await countryAt(picked.lat, picked.lon);
    if (mine !== pickSeq) return;
    pinCountry = hit ? { iso3: hit.iso3, name: hit.name, inside: hit.inside } : null;
    if (hit && !touched.country) {
      draft.country = hit.iso3;
      delete errors.country;
    }
    if (!touched.region) {
      const region = regionNearest(localRegions, draft.country, picked.lat, picked.lon);
      draft.region = region?.id ?? '';
      regionFromPin = !!region;
    }
  }

  function onType(type: string) {
    draft.type = type;
    const water = waterDefault(type);
    if (water && !touched.water) draft.water = water;
  }

  function onCountry(iso3: string) {
    draft.country = iso3;
    touched.country = true;
    delete errors.country;
    if (!touched.region) {
      const region = point ? regionNearest(localRegions, iso3, point.lat, point.lon) : null;
      draft.region = region?.id ?? '';
      regionFromPin = !!region;
    }
  }

  async function regionCreated(region: Region) {
    localRegions = [...localRegions.filter((r) => r.id !== region.id), region];
    draft.region = region.id;
    touched.region = true;
    regionFromPin = false;
    regionDialog = false;
  }

  async function use(siteId: string) {
    if (!onUse) return;
    usingId = siteId;
    try {
      const site = await adminJson<Site>(adminApi('sites', siteId));
      await onUse(site);
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not open that site',
      });
    } finally {
      usingId = '';
    }
  }

  function focusFirstError() {
    const first = ['name', 'country', 'lat', 'lon', 'type', 'region'].find((k) => errors[k]);
    if (!first) return;
    const el = document.getElementById(
      first === 'lat' || first === 'lon' ? `${fid('picker')}-coords` : fid(first),
    );
    el?.focus();
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  async function submit(action: SiteCreateAction) {
    formError = '';
    errors = validateDraft(draft);
    if (availability === 'taken')
      errors.name = `The id ${newId} is already in use; change the name.`;
    if (Object.keys(errors).length) {
      announce('The site was not created: check the marked fields', { assertive: true });
      focusFirstError();
      return;
    }
    busy = action;
    try {
      const site = await adminJson<Site>(adminApi('sites'), 'POST', siteCreateBody(draft));
      toast.show({ kind: 'success', message: `${site.name} created` });
      await onCreated(site, action);
    } catch (err) {
      if (err instanceof AdminApiError) {
        const fields = { ...err.fieldErrors };
        if (fields.site_id) fields.name = `Id ${newId}: ${fields.site_id}`;
        if (err.status === 409) fields.name = `The id ${newId} is already in use; change the name.`;
        errors = fields;
        formError = Object.keys(fields).length ? '' : err.message;
        focusFirstError();
      } else formError = 'Could not create the site';
    } finally {
      busy = null;
    }
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    void submit(compact ? 'use' : 'create');
  }

  /** Enter in a text field does not create the site half-filled; the buttons do. */
  function guardEnter(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing) return;
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type !== 'checkbox') e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
  class="dl-site-create"
  class:compact
  onsubmit={onSubmit}
  onkeydown={guardEnter}
  novalidate
  aria-label="New site"
>
  <Field label="Name" id={fid('name')} required error={errors.name}>
    {#snippet children(control)}
      <input
        {...control}
        bind:this={nameInput}
        class="dl-input"
        type="text"
        maxlength="200"
        autocomplete="off"
        bind:value={draft.name}
        oninput={() => delete errors.name}
      />
    {/snippet}
  </Field>
  <p class="id-line" aria-live="polite">
    {#if newId}
      Id <code>{newId}</code>
      {#if availability === 'checking'}· checking…
      {:else if availability === 'free'}· <span class="free">available</span>
      {:else if availability === 'taken'}· <span class="taken">already in use</span>
      {/if}
      {#if !draft.country}<span class="muted">· the country prefix comes from the pin</span>{/if}
    {:else}
      <span class="muted">The id is made from the country and the name.</span>
    {/if}
  </p>

  <div class="where">
    <section class="picker" aria-labelledby={fid('where')}>
      <h3 id={fid('where')} class="sub">Where is it?</h3>
      <LocationPicker
        id={fid('picker')}
        value={point}
        onchange={onPick}
        label="Coordinates"
        siteType={draft.type}
        country={draft.country}
        {near}
        markers={nearbyMarkers}
        {compact}
        error={errors.lat || errors.lon || ''}
      />
      {#if pinCountry}
        <p class="from-pin">
          {pinCountry.inside ? 'In' : 'Off the coast of'}
          {pinCountry.name}{#if draft.region && regionFromPin}, region
            {localRegions.find((r) => r.id === draft.region)?.name}{/if}.
        </p>
      {/if}
    </section>

    <section class="nearby" aria-labelledby={fid('nearby')}>
      <h3 id={fid('nearby')} class="sub">
        Already known?{#if nearbyCount}<span class="count">{nearbyCount}</span>{/if}
      </h3>
      {#if nearbyCount}
        <ul>
          {#each nearby.log as hit (hit.site_id)}
            <li class="hit">
              <div class="hit-text">
                <strong>{hit.name}</strong>
                <OriginBadge origin={hit.origin} />
                <span class="muted"
                  >{nearbyReason(hit)}{hit.dives
                    ? ` · ${hit.dives} dive${hit.dives === 1 ? '' : 's'}`
                    : ''}</span
                >
              </div>
              {#if onUse}
                <button
                  type="button"
                  class="dl-btn dl-btn-ghost dl-btn-sm"
                  disabled={!!usingId}
                  onclick={() => use(hit.site_id)}
                  aria-label="Use {hit.name} instead"
                  >{usingId === hit.site_id ? 'Opening…' : 'Use this site'}</button
                >
              {/if}
            </li>
          {/each}
          {#each nearby.commons as hit (hit.site_id)}
            <li class="hit">
              <div class="hit-text">
                <strong>{hit.name}</strong>
                <OriginBadge origin="commons" />
                <span class="muted">{nearbyReason(hit)}{hit.area ? ` · ${hit.area}` : ''}</span>
              </div>
              {#if onUse}
                <button
                  type="button"
                  class="dl-btn dl-btn-ghost dl-btn-sm"
                  disabled={!!usingId}
                  onclick={() => use(hit.site_id)}
                  aria-label="Adopt {hit.name} from the commons"
                  >{usingId === hit.site_id ? 'Opening…' : 'Adopt'}</button
                >
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">
          Sites with the same name or within 300 m of the pin, in your log and the commons, show up
          here.
        </p>
      {/if}
    </section>
  </div>

  <div class="grid">
    <Field label="Type" id={fid('type')} error={errors.type}>
      {#snippet children(control)}
        <select
          {...control}
          class="dl-select"
          value={draft.type}
          onchange={(e) => onType(e.currentTarget.value)}
        >
          {#each typeOptions as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
        </select>
      {/snippet}
    </Field>
    <Field label="Water" id={fid('water')}>
      {#snippet children(control)}
        <select
          {...control}
          class="dl-select"
          bind:value={draft.water}
          onchange={() => (touched.water = true)}
        >
          <option value="salt">salt</option>
          <option value="fresh">fresh</option>
          <option value="brackish">brackish</option>
        </select>
      {/snippet}
    </Field>
    <Field label="Country" id={fid('country')} required error={errors.country}>
      {#snippet extra()}
        {#if pinCountry && draft.country === pinCountry.iso3 && !touched.country}
          <span class="chip">from the pin</span>
        {/if}
      {/snippet}
      {#snippet children(control)}
        <select
          {...control}
          class="dl-select"
          value={draft.country}
          onchange={(e) => onCountry(e.currentTarget.value)}
        >
          <option value="">— pick or place the pin —</option>
          {#each countryChoices as c (c.iso3)}<option value={c.iso3}>{c.name}</option>{/each}
        </select>
      {/snippet}
    </Field>
    <Field label="Region" id={fid('region')} error={errors.region}>
      {#snippet extra()}
        {#if draft.region && regionFromPin && !touched.region}
          <span class="chip">nearest</span>
        {/if}
      {/snippet}
      {#snippet children(control)}
        <Combobox
          {...control}
          bind:value={
            () => draft.region || null,
            (v) => {
              draft.region = v ?? '';
              touched.region = true;
              regionFromPin = false;
            }
          }
          options={regionOptions}
          placeholder="— none —"
          emptyText="No region yet"
        />
      {/snippet}
    </Field>
  </div>
  <button
    type="button"
    class="dl-btn dl-btn-ghost dl-btn-sm new-region"
    onclick={() => (regionDialog = true)}>+ New region</button
  >

  <Disclosure summary="More details" persistKey="site-create-more">
    <div class="grid">
      <Field label="Full name" id={fid('full_name')}>
        {#snippet children(control)}
          <input {...control} class="dl-input" type="text" bind:value={draft.full_name} />
        {/snippet}
      </Field>
      <Field label="Short name" id={fid('short_name')}>
        {#snippet children(control)}
          <input {...control} class="dl-input" type="text" bind:value={draft.short_name} />
        {/snippet}
      </Field>
      <Field label="Also known as" id={fid('aliases')} hint="Comma separated">
        {#snippet children(control)}
          <input {...control} class="dl-input" type="text" bind:value={draft.aliases} />
        {/snippet}
      </Field>
      <Field label="Area / town" id={fid('area')}>
        {#snippet children(control)}
          <input {...control} class="dl-input" type="text" bind:value={draft.area} />
        {/snippet}
      </Field>
      <Field label="System (cave / reef)" id={fid('system')}>
        {#snippet children(control)}
          <input {...control} class="dl-input" type="text" bind:value={draft.system} />
        {/snippet}
      </Field>
      <Field label="Show location" id={fid('visibility')}>
        {#snippet children(control)}
          <select {...control} class="dl-select" bind:value={draft.location_visibility}>
            <option value="exact">exact pin</option>
            <option value="region_only">region only (hide coordinates)</option>
          </select>
        {/snippet}
      </Field>
    </div>
    <Field label="Summary" id={fid('summary')} hint="One sentence, used on cards">
      {#snippet children(control)}
        <input {...control} class="dl-input" type="text" bind:value={draft.summary} />
      {/snippet}
    </Field>
    <div class="halocline">
      <label class="check"><input type="checkbox" bind:checked={draft.halocline} /> Halocline</label
      >
      {#if draft.halocline}
        <Field label="Halocline depth (m)" id={fid('halocline_m')} error={errors.halocline_m}>
          {#snippet children(control)}
            <input
              {...control}
              class="dl-input"
              type="number"
              step="any"
              min="0"
              bind:value={draft.halocline_m}
            />
          {/snippet}
        </Field>
      {/if}
    </div>
    <p class="muted">
      Story, sources, prices and the entry point are on the site page after create.
    </p>
  </Disclosure>

  {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}

  <div class="actions">
    {#if compact}
      <button type="submit" class="dl-btn dl-btn-solid" disabled={!!busy}
        >{busy ? 'Creating…' : 'Create & use'}</button
      >
    {:else}
      <button type="submit" class="dl-btn dl-btn-solid" disabled={!!busy}
        >{busy === 'create' ? 'Creating…' : 'Create'}</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost"
        disabled={!!busy}
        onclick={() => submit('log')}
        >{busy === 'log' ? 'Creating…' : 'Create & log a dive here'}</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost"
        disabled={!!busy}
        onclick={() => submit('map')}>{busy === 'map' ? 'Creating…' : 'Create & draw a map'}</button
      >
    {/if}
    {#if onCancel}
      <button type="button" class="dl-btn dl-btn-ghost" onclick={onCancel}>Cancel</button>
    {/if}
  </div>
</form>

<Dialog bind:open={regionDialog} title="New region" size="lg">
  <RegionForm initial={{ country: draft.country }} onSaved={regionCreated} />
</Dialog>

<style>
  .dl-site-create {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-4);
  }
  .id-line {
    margin: calc(-1 * var(--dl-space-2)) 0 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .free {
    color: var(--dl-color-success);
  }
  .taken {
    color: var(--dl-color-danger);
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-sm);
    margin: 0;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: var(--dl-space-2);
    margin: 0 0 var(--dl-space-2);
    font-size: var(--dl-text-md);
    font-family: var(--dl-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .count {
    min-width: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--dl-color-warm-soft);
    color: var(--dl-color-warm);
    font-size: var(--dl-text-xs);
    text-align: center;
  }
  .where {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr);
    gap: var(--dl-space-4);
    align-items: start;
  }
  .compact .where {
    grid-template-columns: 1fr;
  }
  .from-pin {
    margin: var(--dl-space-1) 0 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .nearby ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-2);
  }
  .hit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--dl-space-2);
    padding: var(--dl-space-2) var(--dl-space-3);
    border: 1px solid var(--dl-color-border);
    border-left: 3px solid var(--dl-color-warm);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  .hit-text {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px var(--dl-space-2);
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--dl-space-3);
  }
  .compact .grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  .chip {
    font-size: var(--dl-text-xs);
    padding: 0 6px;
    border-radius: 999px;
    background: var(--dl-color-accent-soft);
    color: var(--dl-color-accent);
  }
  .new-region {
    align-self: flex-start;
    margin-top: calc(-1 * var(--dl-space-2));
  }
  .halocline {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--dl-space-3);
    margin-top: var(--dl-space-3);
  }
  .check {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: var(--dl-space-2);
    min-height: 32px;
  }
  .check input {
    width: auto;
  }
  .form-error {
    margin: 0;
    color: var(--dl-color-danger);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dl-space-2);
  }
  .actions .dl-btn {
    min-height: 44px;
  }
  @media (max-width: 760px) {
    .where {
      grid-template-columns: 1fr;
    }
    .actions .dl-btn {
      flex: 1 1 100%;
    }
  }
</style>
