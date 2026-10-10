<script lang="ts">
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import { SITE_ID, siteIdFor, slugify } from '$lib/core/admin/slug';
  import type { Price, Region, Site } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { getDivelog } from '$lib/core/dive/context';
  import { pinMessage } from '$lib/core/dive/revision';
  import ChangeList from '$lib/components/shell/ChangeList.svelte';

  const { urls } = getDivelog();

  let {
    site = null,
    regions,
    onSaved,
  }: {
    /** The site being edited; null creates a new one. */
    site?: Site | null;
    regions: Region[];
    onSaved: (site: Site) => void | Promise<void>;
  } = $props();

  const SITE_TYPES = [
    'sea',
    'lake',
    'quarry lake',
    'cave',
    'cavern',
    'wreck',
    'reef with wrecks',
    'mine',
    'reservoir',
    'pool',
    'indoor dive tower',
    'river',
  ];

  const AVAILABILITY_DELAY_MS = 350;

  const empty = () => ({
    site_id: '',
    name: '',
    full_name: '',
    short_name: '',
    aliases: '',
    region: '',
    country: 'NLD',
    area: '',
    system: '',
    type: 'sea',
    section_vocabulary: '',
    lat: '' as string | number,
    lon: '' as string | number,
    access_lat: '' as string | number,
    access_lon: '' as string | number,
    access_note: '',
    location_visibility: 'exact',
    water: 'salt' as 'salt' | 'fresh' | 'brackish',
    halocline: false,
    halocline_m: '' as string | number,
    summary: '',
    description_md: '',
    prices: [] as Price[],
    sources: '',
    verified: '',
    geo_source: '',
    notes: '',
  });

  function fromSite(s: Site): ReturnType<typeof empty> {
    return {
      site_id: s.id,
      name: s.name,
      full_name: s.full_name ?? '',
      short_name: s.short_name ?? '',
      aliases: s.aliases.join(', '),
      region: s.region ?? '',
      country: s.country ?? '',
      area: s.area ?? '',
      system: s.system ?? '',
      type: s.site_type,
      section_vocabulary: s.section_vocabulary.join(', '),
      lat: s.lat ?? '',
      lon: s.lon ?? '',
      access_lat: s.access?.lat ?? '',
      access_lon: s.access?.lon ?? '',
      access_note: s.access?.note ?? '',
      location_visibility: s.location_visibility,
      water: s.water ?? 'salt',
      halocline: s.halocline,
      halocline_m: s.halocline_m ?? '',
      summary: s.summary ?? '',
      description_md: s.description_md,
      prices: s.prices.map((p) => ({ ...p })),
      sources: s.sources.join('\n'),
      verified: s.verified ?? '',
      geo_source: s.geo_source ?? '',
      notes: s.private?.notes ?? '',
    };
  }

  // svelte-ignore state_referenced_locally
  let form = $state(site ? fromSite(site) : empty());
  let error = $state('');
  let saving = $state(false);

  const defaultMap = $derived(site?.maps.find((m) => m.ref === site?.default_map) ?? null);

  const list = (value: string) =>
    value
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  const num = (value: string | number) => (value === '' ? null : Number(value));

  /** The id a new site will get: what was typed, else derived from country and name. */
  const newId = $derived(
    site ? site.id : form.site_id || (form.name.trim() ? siteIdFor(form.country, form.name) : ''),
  );
  let availability = $state<'checking' | 'free' | 'taken' | null>(null);

  $effect(() => {
    const id = newId;
    availability = null;
    if (site || !SITE_ID.test(id)) return;
    let stale = false;
    const timer = setTimeout(async () => {
      availability = 'checking';
      try {
        await adminJson<Site>(adminApi('sites', id));
        if (!stale) availability = 'taken';
      } catch (err) {
        if (!stale)
          availability = err instanceof AdminApiError && err.status === 404 ? 'free' : null;
      }
    }, AVAILABILITY_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  function body() {
    const siteId = newId;
    const access =
      form.access_lat !== '' || form.access_lon !== '' || form.access_note
        ? { lat: num(form.access_lat), lon: num(form.access_lon), note: form.access_note || null }
        : null;
    return {
      site_id: siteId,
      name: form.name,
      full_name: form.full_name || null,
      short_name: form.short_name || null,
      aliases: list(form.aliases),
      region: form.region || null,
      country: form.country || null,
      area: form.area || null,
      system: form.system || null,
      type: form.type,
      section_vocabulary: list(form.section_vocabulary),
      lat: num(form.lat),
      lon: num(form.lon),
      access,
      location_visibility: form.location_visibility,
      water: form.water,
      halocline: form.halocline,
      halocline_m: form.halocline ? num(form.halocline_m) : null,
      summary: form.summary || null,
      description_md: form.description_md,
      default_map: site?.default_map ?? null,
      prices: form.prices.filter((p) => p.date),
      sources: form.sources
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      verified: form.verified || null,
      geo_source: form.geo_source || null,
      notes: form.notes || null,
    };
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    saving = true;
    try {
      const saved = site
        ? await adminJson<Site>(`/admin/sites/${site.id}`, 'PUT', body())
        : await adminJson<Site>('/admin/sites', 'POST', body());
      toast.show({ kind: 'success', message: `${form.name} ${site ? 'saved' : 'created'}` });
      await onSaved(saved);
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
    } finally {
      saving = false;
    }
  }

  let pinning = $state(false);
  const pin = $derived(site?.private?.pin ?? null);

  async function markReviewed() {
    if (!site || !pin) return;
    pinning = true;
    try {
      const pinned = await adminJson<Site>(adminApi('sites', site.id, 'pin'), 'POST');
      toast.show({
        kind: 'success',
        message: `${site.name} reviewed against commons revision ${pin.current_revision}`,
      });
      await onSaved(pinned);
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not mark as reviewed',
      });
    } finally {
      pinning = false;
    }
  }

  let sharing = $state(false);

  async function fork() {
    if (!site) return;
    sharing = true;
    error = '';
    try {
      const forked = await adminJson<Site>(
        `${adminApi('sites', site.id)}?fork=true`,
        'PUT',
        body(),
      );
      toast.show({ kind: 'success', message: `${site.name} forked from the commons` });
      await onSaved(forked);
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Could not fork the site';
    } finally {
      sharing = false;
    }
  }

  async function dropFork() {
    if (!site) return;
    if (!confirm(`Drop your fork of ${site.name}? The commons record takes its place again.`))
      return;
    sharing = true;
    error = '';
    try {
      await adminJson(adminApi('sites', site.id), 'DELETE');
      const restored = await adminJson<Site>(adminApi('sites', site.id));
      toast.show({ kind: 'success', message: `${site.name} is back on the commons record` });
      await onSaved(restored);
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Could not drop the fork';
    } finally {
      sharing = false;
    }
  }

  function pasteCoords(e: ClipboardEvent, target: 'site' | 'access') {
    const text = e.clipboardData?.getData('text') ?? '';
    const m = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/.exec(text);
    if (!m) return;
    e.preventDefault();
    if (target === 'site') {
      form.lat = Number(m[1]);
      form.lon = Number(m[2]);
    } else {
      form.access_lat = Number(m[1]);
      form.access_lon = Number(m[2]);
    }
  }

  function addPrice() {
    form.prices = [
      ...form.prices,
      { date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'EUR', note: '' },
    ];
  }
</script>

<form class="dl-card form" onsubmit={save}>
  <div class="field-row">
    <label>Name<input type="text" bind:value={form.name} required /></label>
    <div class="id-field">
      <label for="site-id">Site id</label>
      <input
        id="site-id"
        type="text"
        bind:value={form.site_id}
        readonly={!!site}
        placeholder="auto: country-name"
        aria-describedby={site ? undefined : 'site-id-hint'}
        aria-invalid={!site && availability === 'taken' ? true : undefined}
        onblur={() => {
          if (!site) form.site_id = slugify(form.site_id);
        }}
      />
      {#if !site && newId}
        <p class="hint" id="site-id-hint" aria-live="polite">
          {#if !form.site_id}Will be <code>{newId}</code>.{/if}
          {#if !SITE_ID.test(newId)}
            Needs a country prefix, like <code>nld-{slugify(form.name) || 'name'}</code>.
          {:else if availability === 'checking'}
            Checking…
          {:else if availability === 'free'}
            <span class="free">Available.</span>
          {:else if availability === 'taken'}
            <span class="taken">Already in use; pick another id.</span>
          {/if}
        </p>
      {/if}
    </div>
    <label>
      Type
      <input type="text" list="site-types" bind:value={form.type} required />
      <datalist id="site-types">
        {#each SITE_TYPES as t (t)}<option value={t}></option>{/each}
      </datalist>
    </label>
    <label
      >Country (ISO3)<input type="text" maxlength="3" bind:value={form.country} required /></label
    >
    <label>
      Region
      <select bind:value={form.region}>
        <option value="">— none —</option>
        {#each regions as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
    </label>
  </div>
  <div class="field-row">
    <label>Full name<input type="text" bind:value={form.full_name} /></label>
    <label>Short name<input type="text" bind:value={form.short_name} /></label>
    <label>Area / town<input type="text" bind:value={form.area} /></label>
    <label>System (cave / reef)<input type="text" bind:value={form.system} /></label>
  </div>
  <div class="field-row">
    <label>Also known as (comma separated)<input type="text" bind:value={form.aliases} /></label>
    <label
      >Lines & sections (comma separated)<input
        type="text"
        bind:value={form.section_vocabulary}
      /></label
    >
  </div>
  <div class="field-row">
    <label
      >Latitude<input
        type="number"
        step="any"
        bind:value={form.lat}
        onpaste={(e) => pasteCoords(e, 'site')}
        placeholder="paste “lat, lon”"
      /></label
    >
    <label>Longitude<input type="number" step="any" bind:value={form.lon} /></label>
    <label>
      Show location
      <select bind:value={form.location_visibility}>
        <option value="exact">exact pin</option>
        <option value="region_only">region only (hide coordinates)</option>
      </select>
    </label>
    <label>
      Water
      <select bind:value={form.water}>
        <option value="salt">salt</option>
        <option value="fresh">fresh</option>
        <option value="brackish">brackish</option>
      </select>
    </label>
    <label><input type="checkbox" bind:checked={form.halocline} /> Halocline</label>
    {#if form.halocline}
      <label
        >Halocline depth (m)<input type="number" step="any" bind:value={form.halocline_m} /></label
      >
    {/if}
  </div>
  <div class="field-row">
    <label
      >Entry point lat<input
        type="number"
        step="any"
        bind:value={form.access_lat}
        onpaste={(e) => pasteCoords(e, 'access')}
      /></label
    >
    <label>Entry point lon<input type="number" step="any" bind:value={form.access_lon} /></label>
    <label
      >Getting in<input
        type="text"
        bind:value={form.access_note}
        placeholder="parking, stairs, …"
      /></label
    >
  </div>
  <label>Summary (one sentence, used on cards)<input type="text" bind:value={form.summary} /></label
  >
  <label>Story (markdown)<textarea rows="8" bind:value={form.description_md}></textarea></label>
  <label
    >Sources (one per line, “Title — url”)<textarea rows="3" bind:value={form.sources}
    ></textarea></label
  >

  <fieldset class="sub">
    <legend>Entry prices</legend>
    {#each form.prices as price, i (i)}
      <div class="price-row">
        <input type="date" bind:value={price.date} />
        <input type="number" step="0.01" min="0" bind:value={price.amount} />
        <input type="text" maxlength="3" bind:value={price.currency} />
        <input type="text" placeholder="note" bind:value={price.note} />
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm danger"
          onclick={() => (form.prices = form.prices.filter((_, j) => j !== i))}>×</button
        >
      </div>
    {/each}
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={addPrice}>+ price</button>
  </fieldset>

  {#if site}
    <div class="field-row">
      <div class="readonly">
        <span class="label">Map shown first</span>
        <span
          >{defaultMap
            ? `${defaultMap.title} (${defaultMap.collection})`
            : 'automatic (drawn → sketch → locator)'}</span
        >
        <a class="hint" href={urls.admin.siteMaps(site.id)}>set in the map editor</a>
      </div>
      <label
        >Verified<input
          type="text"
          bind:value={form.verified}
          placeholder="web, inferred…"
        /></label
      >
      <label>Geo source<input type="text" bind:value={form.geo_source} /></label>
    </div>
    <label>Provenance notes (private)<textarea rows="2" bind:value={form.notes}></textarea></label>

    <fieldset class="sub versioning">
      <legend>Revision</legend>
      <p class="dl-num">
        Revision {site.revision}{site.forked_from ? ` · forked from ${site.forked_from}` : ''}
      </p>
      {#if pin}
        <div class="pin" class:stale={pin.stale}>
          <span>{pinMessage(pin)}</span>
          {#if pin.stale}
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm"
              disabled={pinning}
              onclick={markReviewed}
              >{pinning
                ? 'Marking…'
                : `Mark as reviewed against revision ${pin.current_revision}`}</button
            >
          {/if}
        </div>
      {/if}
      {#if site.origin === 'commons'}
        <div class="share">
          <p class="hint">
            This site comes from the shared commons. Saving keeps your notes, prices, own maps and
            photos as a personal overlay; the record itself (name, position, type, story) stays the
            commons'. A <strong>fork</strong> is a full personal copy of the record with the values above:
            it shadows the commons record on your site, keeps its history, and the admin tells you when
            the commons moves on.
          </p>
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            disabled={sharing}
            onclick={fork}>{sharing ? 'Forking…' : 'Fork this site'}</button
          >
        </div>
      {:else if site.origin === 'fork'}
        <div class="share">
          <p class="hint">
            Your fork shadows the commons record. Dropping it deletes your copy and the commons
            record takes its place again.
          </p>
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm danger"
            disabled={sharing}
            onclick={dropFork}
            >{sharing ? 'Dropping…' : 'Drop fork, back to the commons record'}</button
          >
        </div>
      {/if}
      <ChangeList entries={site.changelog} />
      <p class="hint">Revisions move on the server when an objective field changes.</p>
    </fieldset>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
  <div class="actions">
    <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm" disabled={saving}
      >{saving ? 'Saving…' : site ? 'Save' : 'Create'}</button
    >
    {#if form.lat !== '' && form.lon !== ''}
      <a
        class="dl-btn dl-btn-ghost dl-btn-sm"
        href="https://www.openstreetmap.org/?mlat={form.lat}&mlon={form.lon}#map=15/{form.lat}/{form.lon}"
        target="_blank"
        rel="noopener">Check on OSM ↗</a
      >
    {/if}
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
  .sub {
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sub legend {
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    padding: 0 6px;
  }
  .price-row {
    display: grid;
    grid-template-columns: 150px 110px 64px 1fr auto;
    gap: 8px;
  }
  .readonly {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
  }
  .readonly .label {
    font-size: 12.5px;
    color: var(--dl-color-text-muted);
  }
  .id-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .id-field .hint {
    margin: 0;
  }
  .free {
    color: var(--dl-color-success);
  }
  .taken {
    color: var(--dl-color-error);
  }
  .hint {
    font-size: 12.5px;
    color: var(--dl-color-text-faint);
  }
  input[readonly] {
    color: var(--dl-color-text-muted);
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
  .versioning p {
    margin: 0;
    font-size: 14px;
  }
  .pin {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--dl-color-text-muted);
  }
  .pin.stale {
    color: var(--dl-color-warm);
  }
  .share {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .share .hint {
    max-width: 70ch;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  @media (max-width: 720px) {
    .price-row {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
