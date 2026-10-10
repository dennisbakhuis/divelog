<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import {
    applyTemplate,
    emptyTank,
    diveToInput,
    emptyDiveInput,
    formPayload,
    formSnapshot,
    presetsFor,
    type DiveTemplate,
  } from '$lib/core/admin/dive-input';
  import { siteIdFor, slugify } from '$lib/core/admin/slug';
  import type {
    DiveAdmin,
    GearSetup,
    PersonPrivate,
    Region,
    Site,
    Trip,
  } from '$lib/core/dive/types';
  import { toast } from '$lib/components/stores/toast.svelte';
  import DiveRouteEditor from './DiveRouteEditor.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { config, urls } = getDivelog();
  const presets = presetsFor(config);

  export type LastDive = { number: number; label: string; input: DiveTemplate };

  const SITE_TYPES = ['sea', 'lake', 'quarry', 'cave', 'river', 'pool', 'wreck'];

  let {
    dive,
    nextNumber,
    sites,
    trips,
    people,
    setups,
    regions,
    template = null,
  }: {
    dive: DiveAdmin | null;
    nextNumber: number;
    sites: Site[];
    trips: Trip[];
    people: PersonPrivate[];
    setups: GearSetup[];
    regions: Region[];
    /** On a new dive: the most recent dive, for "Copy last dive". */
    template?: LastDive | null;
  } = $props();

  // svelte-ignore state_referenced_locally
  const initial = dive ? diveToInput(dive) : emptyDiveInput(nextNumber);
  let form = $state(initial);
  let computerText = $state(initial.computer.join(', '));
  let saved = $state(formSnapshot(initial, initial.computer.join(', ')));
  let siteQuery = $state('');
  let newBuddy = $state('');
  let busy = $state(false);
  let error = $state('');
  let leaving = false;

  const dirty = $derived(formSnapshot(form, computerText) !== saved);

  const site = $derived(sites.find((s) => s.id === form.site_id));
  const siteMaps = $derived(
    (site?.maps ?? []).flatMap((m) => (m.collection === 'drawn' && m.drawn ? [m.drawn] : [])),
  );
  const siteOptions = $derived(
    siteQuery.trim()
      ? sites
          .filter((s) =>
            `${s.name} ${s.aliases.join(' ')} ${s.area ?? ''} ${s.country_name}`
              .toLowerCase()
              .includes(siteQuery.toLowerCase()),
          )
          .slice(0, 12)
      : [],
  );
  const sectionOptions = $derived(site?.section_vocabulary ?? []);
  const recentSite = $derived(
    sites.reduce<Site | undefined>(
      (latest, s) =>
        s.last_dive && (!latest?.last_dive || s.last_dive > latest.last_dive) ? s : latest,
      undefined,
    ),
  );

  beforeNavigate(({ cancel, to, type }) => {
    if (!dirty || leaving || type === 'leave') return;
    if (to && to.url.pathname === page.url.pathname) return;
    if (!confirm('This dive has unsaved changes. Leave without saving?')) cancel();
  });

  function beforeUnload(e: BeforeUnloadEvent) {
    if (dirty && !leaving) e.preventDefault();
  }

  function markSaved() {
    saved = formSnapshot(form, computerText);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      if (dive) {
        await adminJson(adminApi('dives', dive.number), 'PUT', formPayload(form, computerText));
        markSaved();
        toast.show({ kind: 'success', message: `Dive #${form.number} saved` });
        if (form.number !== dive.number)
          await goto(urls.admin.dive(form.number), { invalidateAll: true });
        else await invalidateAll();
      } else {
        const created = await adminJson<DiveAdmin>(
          adminApi('dives'),
          'POST',
          formPayload(form, computerText),
        );
        markSaved();
        toast.show({ kind: 'success', message: `Dive #${created.number} created` });
        await goto(urls.admin.dive(created.number));
      }
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed';
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!dive || !confirm(`Delete dive #${dive.number} and its attachments?`)) return;
    try {
      await adminJson(adminApi('dives', dive.number), 'DELETE');
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Delete failed';
      return;
    }
    leaving = true;
    toast.show({ kind: 'success', message: 'Dive deleted' });
    await goto(urls.admin.root());
  }

  function copyLast() {
    if (!template) return;
    form = applyTemplate(form, template.input);
    siteQuery = '';
  }

  async function addBuddy() {
    const name = newBuddy.trim();
    if (!name) return;
    const [first, ...rest] = name.split(/\s+/);
    try {
      const person = await adminJson<PersonPrivate>(adminApi('people'), 'POST', {
        first_name: first,
        last_name: rest.join(' ') || null,
      });
      if (!people.some((p) => p.id === person.id)) people = [...people, person];
      if (!form.people_ids.includes(person.id)) form.people_ids = [...form.people_ids, person.id];
      newBuddy = '';
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Could not add person';
    }
  }

  let siteDialog = $state<HTMLDialogElement>();
  let newSite = $state({ name: '', country: '', type: 'sea', region: '' });
  let siteError = $state('');
  let siteBusy = $state(false);
  const regionOptions = $derived(
    [...regions].sort(
      (a, b) =>
        Number(b.country === newSite.country.toUpperCase()) -
          Number(a.country === newSite.country.toUpperCase()) || a.name.localeCompare(b.name),
    ),
  );

  function openSiteDialog() {
    const like = site ?? recentSite;
    newSite = {
      name: siteQuery.trim(),
      country: like?.country ?? '',
      type: 'sea',
      region: like?.region ?? '',
    };
    siteError = '';
    siteDialog?.showModal();
  }

  async function createSite(e: SubmitEvent) {
    e.preventDefault();
    const country = newSite.country.trim().toUpperCase();
    siteBusy = true;
    siteError = '';
    try {
      const created = await adminJson<Site>(adminApi('sites'), 'POST', {
        site_id: siteIdFor(country, newSite.name),
        name: newSite.name.trim(),
        country,
        type: newSite.type.trim() || 'sea',
        region: newSite.region || null,
      });
      sites = [...sites.filter((s) => s.id !== created.id), created];
      form.site_id = created.id;
      siteQuery = '';
      siteDialog?.close();
      toast.show({ kind: 'success', message: `${created.name} created` });
    } catch (err) {
      siteError = err instanceof AdminApiError ? err.message : 'Could not create the site';
    } finally {
      siteBusy = false;
    }
  }

  let tripDialog = $state<HTMLDialogElement>();
  let newTrip = $state({ name: '', start_date: '', end_date: '' });
  let tripError = $state('');
  let tripBusy = $state(false);

  function openTripDialog() {
    newTrip = { name: '', start_date: form.date, end_date: form.date };
    tripError = '';
    tripDialog?.showModal();
  }

  async function createTrip(e: SubmitEvent) {
    e.preventDefault();
    tripBusy = true;
    tripError = '';
    try {
      const created = await adminJson<Trip>(adminApi('trips'), 'POST', {
        slug: slugify(newTrip.name),
        name: newTrip.name.trim(),
        start_date: newTrip.start_date || null,
        end_date: newTrip.end_date || null,
        description_md: '',
      });
      trips = [...trips.filter((t) => t.slug !== created.slug), created];
      form.trip_id = created.slug;
      tripDialog?.close();
      toast.show({ kind: 'success', message: `Trip ${created.name} created` });
    } catch (err) {
      tripError = err instanceof AdminApiError ? err.message : 'Could not create the trip';
    } finally {
      tripBusy = false;
    }
  }

  let refreshing = $state(false);

  async function refreshMaps() {
    if (!site) return;
    refreshing = true;
    try {
      const fresh = await adminJson<Site>(adminApi('sites', site.id));
      sites = sites.map((s) => (s.id === fresh.id ? fresh : s));
      const drawn = fresh.maps.filter((m) => m.collection === 'drawn' && m.drawn).length;
      toast.show({
        kind: 'success',
        message: drawn ? `${drawn} drawn map${drawn === 1 ? '' : 's'}` : 'Still no drawn map',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not refresh the maps',
      });
    } finally {
      refreshing = false;
    }
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function personLabel(p: PersonPrivate): string {
    return p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />

{#if !dive && template}
  <div class="copy-last">
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={copyLast}
      >Copy last dive</button
    >
    <span class="muted"
      >#{template.number} · {template.label}: site, trip, people, gear, gas, suit and weights</span
    >
  </div>
{/if}

<form class="dive-form" onsubmit={save}>
  <fieldset>
    <legend>Basics</legend>
    <div class="field-row">
      <label>Number<input type="number" min="1" bind:value={form.number} required /></label>
      <label>Date<input type="date" bind:value={form.date} required /></label>
      <label>Time in<input type="time" bind:value={form.time_in} /></label>
      <label>Time out<input type="time" bind:value={form.time_out} /></label>
      <label
        >Duration (min)<input
          type="number"
          min="1"
          step="0.5"
          bind:value={form.duration_min}
          required
        /></label
      >
      <label
        >Max depth (m)<input
          type="number"
          step="0.1"
          min="0"
          bind:value={form.max_depth_m}
          required
        /></label
      >
      <label
        >Avg depth (m)<input
          type="number"
          step="0.1"
          min="0"
          bind:value={form.avg_depth_m}
        /></label
      >
    </div>
    <label class="wide"
      >Title<input
        type="text"
        maxlength="200"
        bind:value={form.title}
        placeholder="Optional — defaults to the site name"
      /></label
    >
    <div class="site-pick">
      <label class="grow">
        Site
        <input
          type="search"
          placeholder={site
            ? `${site.name} (${site.country_code}) — type to change`
            : 'Type to find a site…'}
          bind:value={siteQuery}
        />
        {#if siteQuery.trim()}
          <ul class="options" role="listbox">
            {#each siteOptions as option (option.id)}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === form.site_id}
                  onclick={() => {
                    form.site_id = option.id;
                    siteQuery = '';
                  }}
                  >{option.name}
                  <span class="muted"
                    >{option.area ?? option.country_name} · {option.site_type}</span
                  ></button
                >
              </li>
            {/each}
            <li>
              <button type="button" class="new-option" onclick={openSiteDialog}
                >+ New site “{siteQuery.trim()}”</button
              >
            </li>
          </ul>
        {/if}
      </label>
      {#if site}
        <a class="dl-btn dl-btn-ghost dl-btn-sm" href={urls.site(site.slug)} target="_blank"
          >view ↗</a
        >
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm"
          onclick={() => (form.site_id = null)}>clear</button
        >
      {/if}
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={openSiteDialog}
        >+ New site</button
      >
    </div>
    <div class="field-row">
      <label>
        Section / line
        <input
          type="text"
          list="sections"
          bind:value={form.section}
          placeholder="e.g. upstream, E1"
        />
        <datalist id="sections">
          {#each sectionOptions as s (s)}<option value={s}></option>{/each}
        </datalist>
      </label>
      <div class="trip-pick">
        <label class="grow">
          Trip
          <select bind:value={form.trip_id}>
            <option value={null}>— none —</option>
            {#each trips as trip (trip.slug)}<option value={trip.slug}>{trip.name}</option>{/each}
          </select>
        </label>
        <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={openTripDialog}
          >+ New trip</button
        >
      </div>
      <label>
        Visibility
        <select bind:value={form.visibility}>
          <option value="public">public</option>
          <option value="private">private (counts in stats, hidden)</option>
          <option value="draft">draft (not counted)</option>
        </select>
      </label>
      <label>Rating (1–5)<input type="number" min="1" max="5" bind:value={form.rating} /></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Water & conditions</legend>
    <div class="field-row">
      <label>Water (°C)<input type="number" step="0.5" bind:value={form.water_temp_c} /></label>
      <label>Surface (°C)<input type="number" step="0.5" bind:value={form.surface_temp_c} /></label>
      <label>Air (°C)<input type="number" step="0.5" bind:value={form.air_temp_c} /></label>
      <label
        >Thermocline (m)<input type="number" step="0.5" bind:value={form.thermocline_m} /></label
      >
      <label>Visibility (m)<input type="number" step="1" bind:value={form.visibility_m} /></label>
      <label
        >Visibility as written<input
          type="text"
          bind:value={form.visibility_raw}
          placeholder="e.g. 5-15 (upstream)"
        /></label
      >
      <label>Difficulty<input type="text" bind:value={form.difficulty} /></label>
    </div>
    <label class="wide"
      >Conditions<input
        type="text"
        bind:value={form.conditions}
        placeholder="surge, weather, current, tide…"
      /></label
    >
  </fieldset>

  <fieldset>
    <legend>Gas & kit</legend>
    <div class="tanks">
      {#each form.tanks as tank, i (i)}
        <div class="tank field-row">
          <label>
            Role
            <select bind:value={tank.role}>
              <option value="back">back gas</option>
              <option value="stage">stage</option>
              <option value="deco">deco gas</option>
              <option value="bailout">bailout</option>
            </select>
          </label>
          <label>
            Cylinder
            <input
              type="text"
              list="cylinder-presets"
              bind:value={tank.cylinder}
              onchange={() => {
                const preset = presets.cylinders.find(
                  (p) => p.name.toLowerCase() === tank.cylinder.trim().toLowerCase(),
                );
                if (preset) tank.volume_l = preset.volume_l;
              }}
            />
          </label>
          <label>Volume (L)<input type="number" step="0.1" bind:value={tank.volume_l} /></label>
          <label>
            Standard gas
            <select
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
              <option value="">pick…</option>
              {#each presets.gases as g (g.label)}<option value={g.label}>{g.label}</option>{/each}
            </select>
          </label>
          <label>
            Gas
            <select
              bind:value={tank.gas}
              onchange={() => {
                if (tank.gas === 'oxygen') tank.o2_pct = 100;
                if (tank.gas === 'air') tank.o2_pct = null;
                if (tank.gas !== 'trimix') tank.he_pct = null;
              }}
            >
              <option value="air">air</option>
              <option value="nitrox">nitrox</option>
              <option value="trimix">trimix</option>
              <option value="oxygen">oxygen</option>
            </select>
          </label>
          <label>O₂ %<input type="number" min="0" max="100" bind:value={tank.o2_pct} /></label>
          <label
            >Measured %<input
              type="number"
              step="0.1"
              min="0"
              max="100"
              bind:value={tank.o2_measured_pct}
            /></label
          >
          <label>He %<input type="number" min="0" max="100" bind:value={tank.he_pct} /></label>
          <label>In (bar)<input type="number" bind:value={tank.pressure_in_bar} /></label>
          <label>Out (bar)<input type="number" bind:value={tank.pressure_out_bar} /></label>
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            aria-label="Remove tank"
            onclick={() => (form.tanks = form.tanks.filter((_, j) => j !== i))}>×</button
          >
        </div>
      {/each}
      <div class="tank-actions">
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm"
          onclick={() =>
            (form.tanks = [...form.tanks, emptyTank(form.tanks.length ? 'stage' : 'back')])}
          >+ tank</button
        >
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm"
          onclick={() => (form.tanks = [...form.tanks, emptyTank('deco')])}>+ deco gas</button
        >
        <span class="hint"
          >The first back-gas tank is the dive's gas; SAC comes from the back gas.</span
        >
      </div>
      <datalist id="cylinder-presets">
        {#each presets.cylinders as p (p.name)}<option value={p.name}>{p.volume_l} L</option>{/each}
      </datalist>
    </div>
    <div class="field-row">
      <label>Gas as written<input type="text" bind:value={form.gas_raw} /></label>
      <label>
        Mode
        <select bind:value={form.mode}>
          <option value="OC">open circuit</option>
          <option value="sidemount">sidemount</option>
          <option value="CCR">rebreather</option>
        </select>
      </label>
      <label>Suit<input type="text" bind:value={form.suit} /></label>
      <label>Weights (kg)<input type="number" step="0.5" bind:value={form.weights_kg} /></label>
      <label>Safety stop (min)<input type="number" bind:value={form.safety_stop_min} /></label>
      <label>Surface interval<input type="text" bind:value={form.surface_interval} /></label>
      <label>
        Gear setup
        <select bind:value={form.gear_setup_id}>
          <option value={null}>— none —</option>
          {#each setups as setup (setup.id)}<option value={setup.id}>{setup.name}</option>{/each}
        </select>
      </label>
      <label
        >Computer records<input
          type="text"
          bind:value={computerText}
          placeholder="Perdix dive numbers, e.g. 457"
        /></label
      >
    </div>
  </fieldset>

  <fieldset>
    <legend>Tags</legend>
    <div class="chips">
      {#each presets.tags as tag (tag)}
        <button
          type="button"
          class="dl-tag"
          class:active={form.tags.includes(tag)}
          data-tag={tag}
          aria-pressed={form.tags.includes(tag)}
          onclick={() => (form.tags = toggle(form.tags, tag))}>{tag}</button
        >
      {/each}
    </div>
    <label class="wide"
      >As ticked on the page<input
        type="text"
        bind:value={form.types_raw}
        placeholder="Salt Water; Fun; Nitrox"
      /></label
    >
    <label class="wide">Course / purpose<input type="text" bind:value={form.course} /></label>
  </fieldset>

  <fieldset>
    <legend>People</legend>
    <div class="chips">
      {#each people as person (person.id)}
        <button
          type="button"
          class="dl-tag"
          class:active={form.people_ids.includes(person.id)}
          aria-pressed={form.people_ids.includes(person.id)}
          title={personLabel(person)}
          onclick={() => (form.people_ids = toggle(form.people_ids, person.id))}
          >{person.name}</button
        >
      {/each}
    </div>
    <div class="add-buddy">
      <input
        type="text"
        placeholder="New person: First Last"
        bind:value={newBuddy}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void addBuddy();
          }
        }}
      />
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={addBuddy}>Add</button>
    </div>
    <div class="field-row">
      <label>Guide<input type="text" bind:value={form.guide} /></label>
      <label>Operator / centre (private)<input type="text" bind:value={form.operator} /></label>
      <label>Buddy as written (private)<input type="text" bind:value={form.buddy_raw} /></label>
      <label>Buddy role (private)<input type="text" bind:value={form.buddy_role} /></label>
    </div>
  </fieldset>

  <fieldset class="on-map" id="map">
    <legend>On the map</legend>
    {#if site}
      {#if siteMaps.length || form.map_annotation}
        <DiveRouteEditor
          maps={siteMaps}
          value={form.map_annotation}
          onChange={(a) => (form.map_annotation = a)}
        />
      {/if}
      <div class="map-tools">
        {#if !siteMaps.length}
          <p class="muted">No drawn map for {site.name} yet.</p>
          <a
            class="dl-btn dl-btn-ghost dl-btn-sm"
            href={urls.admin.siteMaps(site.id)}
            target="_blank"
            rel="noopener">Draw a map ↗</a
          >
        {/if}
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm"
          disabled={refreshing}
          onclick={refreshMaps}
          title="Fetch the site's maps again, e.g. after drawing one in another tab"
          >{refreshing ? '↻ Refreshing…' : '↻ Refresh maps'}</button
        >
      </div>
    {:else}
      <p class="muted">Pick a site first to mark the route on one of its maps.</p>
    {/if}
  </fieldset>

  <fieldset>
    <legend>Story</legend>
    <label class="wide"
      >Story (markdown)<textarea rows="8" bind:value={form.body_md}></textarea></label
    >
    <label class="wide"
      >Original notes (Dutch, as written)<textarea rows="4" bind:value={form.notes_nl}
      ></textarea></label
    >
    <label class="wide"
      >Sketch on the page (private)<input type="text" bind:value={form.sketch} /></label
    >
  </fieldset>

  <div class="save-bar">
    <button type="submit" class="dl-btn dl-btn-solid" disabled={busy}
      >{busy ? 'Saving…' : 'Save'}</button
    >
    {#if dirty}<span class="unsaved">● unsaved changes</span>{/if}
    {#if error}<span class="error">{error}</span>{/if}
    {#if dive}
      <span class="spacer"></span>
      <a
        class="dl-btn dl-btn-ghost dl-btn-sm"
        href={urls.dive(dive.number)}
        target="_blank"
        rel="noopener">View dive ↗</a
      >
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm danger" onclick={remove}
        >Delete</button
      >
    {/if}
  </div>
</form>

<dialog class="mini" bind:this={siteDialog} aria-labelledby="new-site-title">
  <form onsubmit={createSite}>
    <h2 id="new-site-title">New site</h2>
    <label>Name<input type="text" bind:value={newSite.name} required maxlength="200" /></label>
    <div class="field-row">
      <label
        >Country (ISO3)<input
          type="text"
          bind:value={newSite.country}
          required
          minlength="3"
          maxlength="3"
          placeholder="MEX"
        /></label
      >
      <label>Type<input type="text" list="site-types" bind:value={newSite.type} required /></label>
    </div>
    <datalist id="site-types">
      {#each SITE_TYPES as t (t)}<option value={t}></option>{/each}
    </datalist>
    <label>
      Region
      <select bind:value={newSite.region}>
        <option value="">— none —</option>
        {#each regionOptions as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
    </label>
    {#if newSite.name.trim() && newSite.country.trim().length === 3}
      <p class="muted">id <code>{siteIdFor(newSite.country, newSite.name)}</code></p>
    {/if}
    {#if siteError}<p class="error">{siteError}</p>{/if}
    <div class="mini-actions">
      <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm" disabled={siteBusy}
        >{siteBusy ? 'Creating…' : 'Create site'}</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        onclick={() => siteDialog?.close()}>Cancel</button
      >
    </div>
  </form>
</dialog>

<dialog class="mini" bind:this={tripDialog} aria-labelledby="new-trip-title">
  <form onsubmit={createTrip}>
    <h2 id="new-trip-title">New trip</h2>
    <label>Name<input type="text" bind:value={newTrip.name} required maxlength="200" /></label>
    <div class="field-row">
      <label>Start<input type="date" bind:value={newTrip.start_date} /></label>
      <label>End<input type="date" bind:value={newTrip.end_date} /></label>
    </div>
    {#if slugify(newTrip.name)}<p class="muted">slug <code>{slugify(newTrip.name)}</code></p>{/if}
    {#if tripError}<p class="error">{tripError}</p>{/if}
    <div class="mini-actions">
      <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm" disabled={tripBusy}
        >{tripBusy ? 'Creating…' : 'Create trip'}</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        onclick={() => tripDialog?.close()}>Cancel</button
      >
    </div>
  </form>
</dialog>

<style>
  .tanks {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }
  .tank {
    align-items: end;
    padding: 8px 10px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface);
  }
  .tank label {
    min-width: 0;
  }
  .tank input[type='number'] {
    width: 84px;
  }
  .tank-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .tank-actions .hint {
    font-size: 12px;
    color: var(--dl-color-text-faint);
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 13px;
    margin: 0;
  }
  .dive-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  fieldset {
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--dl-color-bg-elevated);
  }
  legend {
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    padding: 0 6px;
  }
  .site-pick {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  .grow {
    flex: 1;
    position: relative;
  }
  .options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 5;
    list-style: none;
    margin: 4px 0 0;
    padding: 4px;
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius-sm);
    box-shadow: var(--dl-shadow-md);
    max-height: 320px;
    overflow: auto;
  }
  .options button {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 10px;
    color: var(--dl-color-text);
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 14px;
  }
  .options button:hover,
  .options button[aria-selected='true'] {
    background: var(--dl-color-surface-2);
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
  .add-buddy {
    display: flex;
    gap: 8px;
    max-width: 360px;
  }
  .save-bar {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
    position: sticky;
    bottom: 0;
    z-index: 6;
    padding: 10px 14px;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    box-shadow: var(--dl-shadow-md);
  }
  .save-bar .spacer {
    flex: 1;
  }
  .save-bar .error {
    margin: 0;
  }
  .unsaved {
    font-family: var(--dl-font-mono);
    font-size: 12px;
    color: var(--dl-color-warm);
  }
  .danger:hover {
    color: var(--dl-color-error);
  }
  .copy-last {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .trip-pick,
  .map-tools {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .map-tools {
    align-items: center;
  }
  .options .new-option {
    color: var(--dl-color-accent);
    border-top: 1px solid var(--dl-color-border);
    border-radius: 0;
  }
  dialog.mini {
    width: min(460px, calc(100vw - 32px));
    padding: 20px;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    color: var(--dl-color-text);
    box-shadow: var(--dl-shadow-md);
  }
  dialog.mini::backdrop {
    background: rgb(0 0 0 / 0.55);
  }
  dialog.mini form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  dialog.mini h2 {
    margin: 0;
    font-size: 18px;
  }
  .mini-actions {
    display: flex;
    gap: 8px;
  }
  textarea {
    font-family: var(--dl-font-mono);
    font-size: 13.5px;
    line-height: 1.5;
  }
</style>
