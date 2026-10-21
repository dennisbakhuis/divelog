<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { adminApi, adminJson, adminUpload, AdminApiError } from '$lib/core/admin/client';
  import {
    TEMPLATE_GROUPS,
    TEMPLATE_FIELDS,
    applyGearSetup,
    applyTemplate,
    backupKey,
    clearBackup,
    diveToInput,
    durationFromTimes,
    emptyDiveInput,
    emptyTank,
    fieldId,
    filledCount,
    formSnapshot,
    isBlankTank,
    normalizeInterval,
    orderedErrors,
    presetsFor,
    previousDive,
    readBackup,
    savePayload,
    sectionOf,
    setupHasTemplate,
    surfaceIntervalFrom,
    templateFills,
    templatePath,
    validateEssentials,
    writeBackup,
    type DiveInput,
    type DiveSection,
    type TemplateField,
    type TemplateGroup,
  } from '$lib/core/admin/dive-input';
  import { draftNeighbours } from '$lib/core/admin/dive-list';
  import { slugify } from '$lib/core/admin/slug';
  import type { SiteDraft } from '$lib/core/admin/site-create';
  import { DEFAULT_SITE_TYPE, waterDefault } from '$lib/core/dive/site-types';
  import type {
    Attachment,
    CommonsSiteHit,
    DiveAdmin,
    DiveTemplateOut,
    GearSetup,
    MarkdownPreviewOut,
    PersonPrivate,
    Region,
    Site,
    Trip,
  } from '$lib/core/dive/types';
  import type { NewDiveParams } from '$lib/core/dive/config';
  import { formatDate } from '$lib/core/dive/format';
  import { toast } from '$lib/components/stores/toast.svelte';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import { announce } from '$lib/core/ui/announce.js';
  import type { ComboOption } from '$lib/core/ui/combobox.js';
  import Combobox from '$lib/components/ui/Combobox.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Disclosure from '$lib/components/ui/Disclosure.svelte';
  import Field from '$lib/components/ui/Field.svelte';
  import DiveRouteEditor from './DiveRouteEditor.svelte';
  import AnnotationStale from './AnnotationStale.svelte';
  import CommonsSearch from './CommonsSearch.svelte';
  import SiteCreate from './SiteCreate.svelte';
  import { legLabel } from '$lib/core/dive/sharing';
  import type { DiveMapAnnotation, MapEdgeRef } from '$lib/core/dive/sitemap';
  import { getDivelog } from '$lib/core/dive/context';

  const { config, urls } = getDivelog();
  const presets = presetsFor(config);

  const UPLOAD_KINDS: Attachment['kind'][] = ['photo', 'scan', 'map', 'video', 'export'];

  let {
    dive,
    nextNumber,
    sites,
    trips,
    people,
    setups,
    regions,
    template = null,
    prefill = null,
    drafts = [],
    attachments,
    onSavedNew,
  }: {
    dive: DiveAdmin | null;
    nextNumber: number;
    sites: Site[];
    trips: Trip[];
    people: PersonPrivate[];
    setups: GearSetup[];
    regions: Region[];
    /** `GET /admin/dives/template` for this dive: previous dive, last dive at the site, recents. */
    template?: DiveTemplateOut | null;
    /** On a new dive: the `?site=&trip=&person=&date=` the form starts from. */
    prefill?: NewDiveParams | null;
    /** Every draft's number in date order, for "Save & next draft" on a draft. */
    drafts?: number[];
    /** The attachments panel of a saved dive, shown as the "Photos & files" section. */
    attachments?: Snippet;
    /** Save & new reached the new-dive page; the page starts a blank form for the next dive. */
    onSavedNew?: () => void;
  } = $props();

  /** A new dive: today (or the prefilled day), the prefilled site, trip and buddy. */
  function startForm(): DiveInput {
    const form = emptyDiveInput(nextNumber);
    if (prefill?.date) form.date = prefill.date;
    if (prefill?.site && sites.some((s) => s.id === prefill.site)) form.site_id = prefill.site;
    const trip = prefill?.trip ?? template?.trip_for_date?.slug ?? null;
    if (trip && trips.some((t) => t.slug === trip)) form.trip_id = trip;
    const person = people.find((p) => p.id === prefill?.person || p.slug === prefill?.person);
    if (person) form.people_ids = [person.id];
    return form;
  }

  const initial = untrack(() => (dive ? diveToInput(dive) : startForm()));
  const isNew = untrack(() => !dive);
  const isDraft = $derived(dive?.visibility === 'draft');
  const live = untrack(() => !dive || dive.visibility === 'draft');
  let storageKey = $state(untrack(() => backupKey(dive ? dive.number : null)));

  let form = $state(structuredClone(initial));
  let computerText = $state(initial.computer.join(', '));
  let saved = $state(formSnapshot(initial, initial.computer.join(', ')));
  let busy = $state(false);
  let error = $state('');
  let fieldErrors = $state<Record<string, string>>({});
  let savedAt = $state<Date | null>(null);
  let restoredAt = $state<string | null>(null);
  let leaving = false;

  type Queued = { file: File; kind: Attachment['kind']; public: boolean };
  let queue = $state<Queued[]>([]);
  let queueKind = $state<Attachment['kind']>('photo');
  let queuePublic = $state(true);

  const dirty = $derived(formSnapshot(form, computerText) !== saved || queue.length > 0);

  function queueFiles(e: Event & { currentTarget: HTMLInputElement }) {
    const files = Array.from(e.currentTarget.files ?? []);
    queue = [...queue, ...files.map((file) => ({ file, kind: queueKind, public: queuePublic }))];
    e.currentTarget.value = '';
  }

  let numberFrom = untrack(() => nextNumber);
  $effect(() => {
    const next = nextNumber;
    untrack(() => {
      if (!isNew || next === numberFrom) return;
      if (Number(form.number) === numberFrom) {
        const clean = !dirty;
        form.number = next;
        if (clean) saved = formSnapshot(form, computerText);
      }
      numberFrom = next;
    });
  });

  let open = $state<Record<DiveSection, boolean>>({
    essentials: true,
    gas: true,
    conditions: false,
    map: false,
    story: false,
    transcription: false,
    private: false,
    publishing: false,
  });

  // ── The template: previous dive, last dive at the site, recent sites and people ──

  let tpl = $state<DiveTemplateOut | null>(untrack(() => template));
  let tplSite = $state<string | null>(untrack(() => initial.site_id));
  const previous = $derived(tpl?.previous ? previousDive(tpl.previous) : null);
  const atSite = $derived(
    tpl?.at_site && tplSite === form.site_id && tpl.at_site.number !== dive?.number
      ? tpl.at_site
      : null,
  );

  let lastKey = untrack(() => `${initial.site_id ?? ''}|${initial.date}`);
  let tplRequest = 0;
  $effect(() => {
    const site = form.site_id;
    const date = form.date;
    const key = `${site ?? ''}|${date}`;
    if (!live || key === lastKey || !date) return;
    const request = tplRequest;
    const timer = setTimeout(async () => {
      try {
        const self = dive?.number ?? null;
        const next = await adminJson<DiveTemplateOut>(templatePath(site, date, self));
        if (request !== tplRequest) return;
        lastKey = key;
        tpl = {
          ...next,
          previous: next.previous?.number === self ? (tpl?.previous ?? null) : next.previous,
        };
        tplSite = site;
      } catch {
        // the form works without the template; derivations just stay empty
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      tplRequest++;
    };
  });

  // ── Derivations: shown with a "from …" hint, overridden by typing ──

  const derivedDuration = $derived(durationFromTimes(form.time_in, form.time_out));
  const derivedInterval = $derived(
    previous ? surfaceIntervalFrom(previous, { date: form.date, time_in: form.time_in }) : null,
  );
  const derivedWater = $derived(atSite?.water_temp_c ?? null);

  type AutoFlags = { duration: boolean; interval: boolean; water: boolean; trip: boolean };

  /**
   * Which derived fields of `input` still follow their derivation: the empty ones, and a
   * duration equal to the times. Only a new dive or a draft derives; a published dive is
   * shown as stored. `tripFromDate` says the trip was filled from the date, not chosen.
   */
  function autoFlags(input: DiveInput, tripFromDate: boolean): AutoFlags {
    return {
      duration:
        live &&
        (input.duration_min === null ||
          input.duration_min === durationFromTimes(input.time_in, input.time_out)),
      interval: live && !input.surface_interval,
      water: live && input.water_temp_c === null,
      trip: live && (!input.trip_id || tripFromDate),
    };
  }

  const initialAuto = untrack(() =>
    autoFlags(initial, isNew && !!initial.trip_id && initial.trip_id !== prefill?.trip),
  );
  let durationAuto = $state(initialAuto.duration);
  let intervalAuto = $state(initialAuto.interval);
  let waterAuto = $state(initialAuto.water);
  let tripAuto = $state(initialAuto.trip);

  function useAutoFlags(flags: AutoFlags) {
    durationAuto = flags.duration;
    intervalAuto = flags.interval;
    waterAuto = flags.water;
    tripAuto = flags.trip;
  }

  /**
   * A derived field follows its derivation while its auto flag is on: a value is written, and
   * the field is emptied only when the derivation itself goes away. A derivation that was
   * already empty leaves the field alone, so typing into it is never undone by the effect
   * that runs between the binding and the input handler.
   */
  function follow<T>(
    auto: boolean,
    derived: T | null,
    last: { value: T | null },
    current: T | null,
    set: (value: T | null) => void,
  ) {
    const gone = last.value !== null && derived === null;
    last.value = derived;
    if (!auto) return;
    if (derived !== null ? current !== derived : gone) set(derived);
  }

  const lastDuration = { value: untrack(() => derivedDuration) };
  const lastInterval = { value: untrack(() => derivedInterval) };
  const lastWater = { value: untrack(() => derivedWater) };
  const derivedTrip = $derived.by(() => {
    const slug = tpl?.trip_for_date?.slug;
    return slug && trips.some((t) => t.slug === slug) ? slug : null;
  });
  const lastTrip = { value: untrack(() => derivedTrip) };

  $effect(() => {
    follow(durationAuto, derivedDuration, lastDuration, form.duration_min, (v) => {
      form.duration_min = v;
    });
  });
  $effect(() => {
    follow(intervalAuto, derivedInterval, lastInterval, form.surface_interval || null, (v) => {
      form.surface_interval = v;
    });
  });
  $effect(() => {
    follow(waterAuto, derivedWater, lastWater, form.water_temp_c, (v) => {
      form.water_temp_c = v;
    });
  });
  $effect(() => {
    follow(tripAuto, derivedTrip, lastTrip, form.trip_id || null, (v) => {
      form.trip_id = v;
    });
  });

  /** Typing in a derived field takes it over; emptying it hands it back to the derivation. */
  function takeOver(e: Event & { currentTarget: HTMLInputElement }): boolean {
    return e.currentTarget.value.trim() === '';
  }

  // ── "Same as previous dive" ──

  const showSame = $derived(!!previous && (isNew || isDraft));
  const groupFills = $derived(
    previous
      ? (Object.keys(TEMPLATE_GROUPS) as TemplateGroup[]).map((g) => ({
          group: g,
          fills: templateFills(form, previous.template, TEMPLATE_GROUPS[g].fields),
        }))
      : [],
  );
  const allFills = $derived(previous ? templateFills(form, previous.template) : []);

  function sameAsPrevious(fields: readonly TemplateField[] = TEMPLATE_FIELDS) {
    if (!previous) return;
    const fills = templateFills(form, previous.template, fields);
    form = applyTemplate(form, previous.template, fields);
    if (fills.includes('trip_id')) tripAuto = false;
    announce(
      fills.length
        ? `Filled ${fills.length} field${fills.length === 1 ? '' : 's'} from dive #${previous.number}`
        : 'Nothing to fill: those fields are already set',
    );
  }

  const previousLabel = $derived.by(() => {
    if (!previous) return '';
    const site = sites.find((s) => s.id === previous.site_id)?.name;
    const what = previous.title || site || 'untitled';
    return `#${previous.number} · ${what}, ${formatDate(previous.date)}`;
  });

  // ── Pickers: site, buddies, trip ──

  const site = $derived(sites.find((s) => s.id === form.site_id));
  const siteMaps = $derived(
    (site?.maps ?? []).flatMap((m) => (m.collection === 'drawn' && m.drawn ? [m.drawn] : [])),
  );
  const siteOptions = $derived.by<ComboOption[]>(() => {
    const byId = new Map(sites.map((s) => [s.id, s]));
    const hintOf = (s: Site) => [s.area ?? s.country_name, s.site_type].filter(Boolean).join(' · ');
    const recent = (tpl?.recent_sites ?? []).flatMap((r) => {
      const s = byId.get(r.site_id);
      return s
        ? [
            {
              value: s.id,
              label: s.name,
              hint: hintOf(s),
              group: 'Recent',
              keywords: s.aliases.join(' '),
            },
          ]
        : [];
    });
    const all = [...sites]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        value: s.id,
        label: s.name,
        hint: hintOf(s),
        group: 'All sites',
        keywords: `${s.aliases.join(' ')} ${s.country_name} ${s.area ?? ''}`,
      }));
    return [...recent, ...all];
  });
  const sectionOptions = $derived([
    ...new Set([atSite?.section, ...(site?.section_vocabulary ?? [])].filter(Boolean)),
  ] as string[]);

  const personLabel = (p: PersonPrivate) =>
    p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
  const peopleOptions = $derived.by<ComboOption[]>(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const frequent = (tpl?.frequent_people ?? []).flatMap((f) => {
      const p = byId.get(f.id);
      return p
        ? [
            {
              value: p.id,
              label: p.name,
              hint: `${f.dives} together`,
              group: 'Frequent',
              keywords: personLabel(p),
            },
          ]
        : [];
    });
    const all = [...people]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        value: p.id,
        label: p.name,
        group: 'Everyone',
        keywords: `${personLabel(p)} ${p.aliases.join(' ')}`,
      }));
    return [...frequent, ...all];
  });

  const tripOptions = $derived<ComboOption[]>(
    [...trips]
      .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
      .map((t) => ({
        value: t.slug,
        label: t.name,
        hint: t.start_date ? formatDate(t.start_date) : undefined,
      })),
  );

  let addingPerson = $state(false);

  async function addPerson(name: string, close: () => void) {
    const text = name.trim();
    if (!text || addingPerson) return;
    const [first, ...rest] = text.split(/\s+/);
    addingPerson = true;
    try {
      const person = await adminJson<PersonPrivate>(adminApi('people'), 'POST', {
        first_name: first,
        last_name: rest.join(' ') || null,
      });
      if (!people.some((p) => p.id === person.id)) people = [...people, person];
      if (!form.people_ids.includes(person.id)) form.people_ids = [...form.people_ids, person.id];
      close();
      announce(`${person.name} added`);
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not add the person',
      });
    } finally {
      addingPerson = false;
    }
  }

  let siteBefore = untrack(() => initial.site_id);
  $effect(() => {
    siteBefore = form.site_id;
  });

  /**
   * The owner picked another site: the section and a route drawn on the old site's map
   * belong to that site, so they go (a section the new site also knows stays).
   */
  function siteChanged() {
    const from = siteBefore;
    siteBefore = form.site_id;
    if (from === null || from === form.site_id) return;
    const next = sites.find((s) => s.id === form.site_id);
    const cleared: string[] = [];
    if (form.section && !(next?.section_vocabulary ?? []).includes(form.section)) {
      form.section = null;
      cleared.push('section');
    }
    const maps = (next?.maps ?? []).flatMap((m) => (m.drawn ? [m.drawn.id] : []));
    if (form.map_annotation && !maps.includes(form.map_annotation.map_id)) {
      form.map_annotation = null;
      cleared.push('route on the map');
    }
    if (cleared.length) announce(`Cleared the ${cleared.join(' and ')} of the previous site`);
  }

  // ── Gear setup ──

  const setup = $derived(setups.find((s) => s.id === form.gear_setup_id));

  function useSetup() {
    if (!setup) return;
    form = applyGearSetup(form, setup);
    announce(`Tanks, suit and weights from ${setup.name}`);
  }

  function pickSetup() {
    if (setup && setupHasTemplate(setup) && !form.tanks.length && !form.suit) useSetup();
  }

  // ── Story preview ──

  let previewing = $state(false);
  let previewHtml = $state('');
  let previewError = $state('');

  $effect(() => {
    if (!previewing) return;
    const md = form.body_md;
    const timer = setTimeout(async () => {
      try {
        const out = await adminJson<MarkdownPreviewOut>(adminApi('preview', 'markdown'), 'POST', {
          md,
        });
        previewHtml = out.html;
        previewError = '';
      } catch (err) {
        previewError = err instanceof AdminApiError ? err.message : 'Preview failed';
      }
    }, 300);
    return () => clearTimeout(timer);
  });

  // ── Saving ──

  const neighbours = $derived(dive && isDraft ? draftNeighbours(drafts, dive.number) : null);

  function markSaved(snapshot = formSnapshot(form, computerText)) {
    saved = snapshot;
    clearBackup(storageKey);
    restoredAt = null;
  }

  /** Keep what was typed but not saved in the session backup, at once. */
  function flushBackup(): boolean {
    if (leaving || formSnapshot(form, computerText) === saved) return false;
    writeBackup(storageKey, form, computerText);
    return true;
  }

  /** The summary of a section, to focus when an error has no control of its own. */
  function sectionSummary(section: DiveSection): HTMLElement | null {
    const body = formEl?.querySelector(`[data-section="${section}"]`);
    return body?.closest('details')?.querySelector<HTMLElement>(':scope > summary') ?? null;
  }

  async function showErrors(errors: Record<string, string>) {
    fieldErrors = errors;
    const order = orderedErrors(errors);
    const first = order[0];
    if (!first) return;
    const section = sectionOf(first);
    open[section] = true;
    if (section === 'transcription') open.story = true;
    await tick();
    unplaced = order
      .filter((path) => !document.getElementById(fieldId(path)))
      .map((path) => [path, errors[path]]);
    const control = document.getElementById(fieldId(first)) ?? sectionSummary(section);
    control?.scrollIntoView?.({ block: 'center' });
    control?.focus();
    announce(
      `${order.length} field${order.length === 1 ? '' : 's'} need${order.length === 1 ? 's' : ''} attention: ${errors[first]}`,
      { assertive: true },
    );
  }

  /** Errors on paths without a control of their own (tags, the map, a whole tank). */
  let unplaced = $state<[string, string][]>([]);

  type After = 'stay' | 'new' | 'next';

  async function persist(after: After = 'stay'): Promise<boolean> {
    unplaced = [];
    if (form.tanks.some(isBlankTank)) form.tanks = form.tanks.filter((t) => !isBlankTank(t));
    const missing = validateEssentials(form);
    if (Object.keys(missing).length) {
      error = '';
      await showErrors(missing);
      return false;
    }
    busy = true;
    error = '';
    fieldErrors = {};
    const sent = formSnapshot(form, computerText);
    try {
      let number: number;
      if (dive) {
        await adminJson(
          adminApi('dives', dive.number),
          'PUT',
          savePayload(form, computerText, dive),
        );
        number = Number(form.number);
      } else {
        const created = await adminJson<DiveAdmin>(
          adminApi('dives'),
          'POST',
          savePayload(form, computerText, null),
        );
        number = created.number;
      }
      const uploads = queue;
      queue = [];
      markSaved(sent);
      if (!dive) storageKey = backupKey(number);
      savedAt = new Date();
      announce(`Dive #${number} ${dive ? 'saved' : 'created'}`);
      if (uploads.length) await uploadQueued(number, uploads);
      const date = form.date;
      if (after === 'new') {
        if (flushBackup())
          toast.show({
            kind: 'info',
            message: `Changes made while saving are kept as unsaved changes on dive #${number}`,
          });
        leaving = true;
        await goto(urls.admin.newDive({ date }), { invalidateAll: true });
        onSavedNew?.();
      } else if (after === 'next' && neighbours?.next) {
        flushBackup();
        leaving = true;
        await goto(urls.admin.dive(neighbours.next));
      } else if (!dive || number !== dive.number) {
        flushBackup();
        leaving = true;
        await goto(urls.admin.dive(number), { invalidateAll: true });
      } else await invalidateAll();
      leaving = false;
      return true;
    } catch (err) {
      if (err instanceof AdminApiError && Object.keys(err.fieldErrors).length) {
        error = 'The server did not accept some fields.';
        await showErrors(err.fieldErrors);
      } else {
        error = err instanceof AdminApiError ? err.message : 'Save failed';
        announce(`Save failed: ${error}`, { assertive: true });
      }
      return false;
    } finally {
      busy = false;
    }
  }

  async function uploadQueued(number: number, files: Queued[]) {
    for (const q of files) {
      try {
        await adminUpload(adminApi('dives', number, 'attachments'), q.file, {
          kind: q.kind,
          public: String(q.kind === 'scan' ? false : q.public),
        });
      } catch (err) {
        toast.show({
          kind: 'error',
          message: `${q.file.name}: ${err instanceof AdminApiError ? err.message : 'upload failed'}`,
        });
      }
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    await persist();
  }

  /** Save as a draft; a save that does not go through keeps the visibility it had. */
  async function saveAsDraft() {
    const before = form.visibility;
    form.visibility = 'draft';
    if (!(await persist())) form.visibility = before;
  }

  async function repin(annotation: DiveMapAnnotation, dropped: MapEdgeRef[]) {
    const map = siteMaps.find((m) => m.id === annotation.map_id);
    const pending = formSnapshot(form, computerText) !== saved;
    form.map_annotation = annotation;
    if (!dive) return;
    if (pending) {
      announce(`Route re-pinned to map revision ${annotation.revision}; save the dive to keep it`);
      return;
    }
    const legs = dropped.map((leg) => legLabel(leg, map)).join(', ');
    if (await persist())
      toast.show({
        kind: 'success',
        message: `Route re-pinned to map revision ${annotation.revision}${
          legs ? `; dropped ${legs}` : ''
        }`,
      });
  }

  async function remove() {
    if (!dive) return;
    const ok = await confirmDialog({
      title: `Delete dive #${dive.number}?`,
      body: 'The dive and its photos, scans and files are deleted. This cannot be undone here.',
      danger: true,
    });
    if (!ok) return;
    busy = true;
    try {
      await adminJson(adminApi('dives', dive.number), 'DELETE');
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Delete failed';
      return;
    } finally {
      busy = false;
    }
    leaving = true;
    clearBackup(storageKey);
    toast.show({ kind: 'success', message: `Dive #${dive.number} deleted` });
    await goto(urls.admin.dives());
  }

  // ── Unsaved changes: guard and session backup ──

  beforeNavigate((nav) => {
    if (!dirty || leaving || nav.type === 'leave') return;
    const to = nav.to?.url;
    if (to && to.pathname === page.url.pathname && to.search === page.url.search) return;
    nav.cancel();
    void confirmDialog({
      title: 'Leave without saving?',
      body: 'This dive has unsaved changes; they are lost when you leave.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      danger: true,
    }).then((ok) => {
      if (!ok || !to) return;
      leaving = true;
      clearBackup(storageKey);
      if (nav.type === 'popstate' && nav.delta) history.go(nav.delta);
      else void goto(to);
    });
  });

  function beforeUnload(e: BeforeUnloadEvent) {
    if (dirty && !leaving) e.preventDefault();
  }

  onMount(() => {
    const backup = readBackup(storageKey);
    if (backup && formSnapshot(backup.form, backup.computerText) !== saved) {
      useAutoFlags(autoFlags(backup.form, tripAuto && backup.form.trip_id === initial.trip_id));
      form = backup.form;
      computerText = backup.computerText;
      restoredAt = backup.savedAt;
    } else if (backup) clearBackup(storageKey);
  });

  $effect(() => {
    const snapshot = formSnapshot(form, computerText);
    const key = storageKey;
    if (snapshot === saved) return;
    const timer = setTimeout(() => writeBackup(key, form, computerText), 400);
    return () => clearTimeout(timer);
  });

  function onVisibility() {
    if (document.visibilityState === 'hidden') flushBackup();
  }

  function discardRestored() {
    form = { ...structuredClone(initial), number: isNew ? numberFrom : initial.number };
    computerText = initial.computer.join(', ');
    useAutoFlags(initialAuto);
    saved = formSnapshot(form, computerText);
    clearBackup(storageKey);
    restoredAt = null;
    announce('Restored changes discarded');
  }

  // ── New site, commons, new trip, map refresh ──

  let newSite = $state<Partial<SiteDraft>>({});
  let siteDialogOpen = $state(false);
  const recentSite = $derived(
    sites.reduce<Site | undefined>(
      (latest, s) =>
        s.last_dive && (!latest?.last_dive || s.last_dive > latest.last_dive) ? s : latest,
      undefined,
    ),
  );
  /**
   * The new-site dialog starts like the site in the form (or the last one dived): its
   * country and region as a suggestion the pin may override, its type and water.
   */
  function openSiteDialog(name = '') {
    const like = site ?? recentSite;
    const type = like?.site_type || DEFAULT_SITE_TYPE;
    newSite = {
      name: name.trim(),
      country: like?.country ?? '',
      region: like?.region ?? '',
      type,
      water: like?.water ?? waterDefault(type) ?? 'salt',
    };
    siteDialogOpen = true;
  }

  function useNewSite(created: Site) {
    sites = [...sites.filter((s) => s.id !== created.id), created];
    form.site_id = created.id;
    siteChanged();
    siteDialogOpen = false;
  }

  let adopting = $state(false);
  let commonsQuery = $state('');
  const nearSite = $derived.by(() => {
    const like = site ?? recentSite;
    return like && like.lat !== null && like.lon !== null ? { lat: like.lat, lon: like.lon } : null;
  });

  function openCommons(query = '') {
    commonsQuery = query.trim();
    adopting = true;
  }

  async function adoptSite(hit: CommonsSiteHit) {
    try {
      const adopted = await adminJson<Site>(adminApi('sites', hit.id));
      sites = [...sites.filter((s) => s.id !== adopted.id), adopted];
      form.site_id = adopted.id;
      siteChanged();
      adopting = false;
      toast.show({ kind: 'success', message: `${adopted.name} from the commons` });
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not load the site',
      });
    }
  }

  let tripDialogOpen = $state(false);
  let newTrip = $state({ name: '', start_date: '', end_date: '' });
  let tripError = $state('');
  let tripBusy = $state(false);

  function openTripDialog(name = '') {
    newTrip = { name: name.trim(), start_date: form.date, end_date: form.date };
    tripError = '';
    tripDialogOpen = true;
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
      tripAuto = false;
      tripDialogOpen = false;
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
      announce(drawn ? `${drawn} drawn map${drawn === 1 ? '' : 's'}` : 'Still no drawn map');
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof AdminApiError ? err.message : 'Could not refresh the maps',
      });
    } finally {
      refreshing = false;
    }
  }

  // ── Keys ──

  let formEl = $state<HTMLFormElement>();

  /** Enter in a one-line field never submits the dive; only the Save button (or Ctrl/⌘-S) does. */
  function guardEnter(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const target = e.target;
    if (target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)) e.preventDefault();
  }

  const NON_TEXT_INPUTS = new Set(['submit', 'button', 'reset', 'image']);

  /** Ctrl/⌘-S saves the dive, unless a dialog (new site, new trip, a confirm) is open. */
  function saveShortcut(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    if (busy || document.querySelector('dialog[open]')) return;
    formEl?.requestSubmit();
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const err = (path: string) => fieldErrors[path] ?? '';

  const VISIBILITY_HELP = {
    public: 'Shown on the public log and counted in the statistics.',
    private: 'Counted in the statistics, but not shown on its own page or in lists.',
    draft: 'Not shown and not counted: for dives still to be completed.',
  } as const;

  const savedLabel = $derived(
    savedAt
      ? `Saved ${String(savedAt.getHours()).padStart(2, '0')}:${String(savedAt.getMinutes()).padStart(2, '0')}`
      : '',
  );
</script>

<svelte:window onbeforeunload={beforeUnload} onpagehide={flushBackup} onkeydown={saveShortcut} />
<svelte:document onvisibilitychange={onVisibility} />

{#if restoredAt}
  <div class="notice" role="status">
    <span
      >Unsaved changes from {new Date(restoredAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })} were restored.</span
    >
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={discardRestored}
      >Discard them</button
    >
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => (restoredAt = null)}
      >Keep</button
    >
  </div>
{/if}

{#if showSame && previous}
  <div class="same" role="group" aria-labelledby="dl-dive-same-label">
    <span id="dl-dive-same-label" class="same-label">Same as previous dive</span>
    <span class="muted">{previousLabel}</span>
    <div class="same-chips">
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        disabled={!allFills.length}
        onclick={() => sameAsPrevious()}>Same as previous dive</button
      >
      {#each groupFills as g (g.group)}
        <button
          type="button"
          class="dl-tag chip"
          disabled={!g.fills.length}
          onclick={() => sameAsPrevious(TEMPLATE_GROUPS[g.group].fields)}
          >{TEMPLATE_GROUPS[g.group].label}</button
        >
      {/each}
    </div>
  </div>
{/if}

<!-- Keys bubble up from the fields; the form only cancels Enter, it is not a widget. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
  class="dive-form"
  bind:this={formEl}
  onsubmit={save}
  onkeydown={guardEnter}
  novalidate
  aria-label={dive ? `Dive #${dive.number}` : 'New dive'}
>
  <Disclosure
    summary="Essentials"
    bind:open={open.essentials}
    persistKey="dive-form-essentials"
    class="section"
  >
    <div class="grid" data-section="essentials">
      <Field label="Number" id={fieldId('number')} error={err('number')} required>
        {#snippet children(c)}
          <input {...c} type="number" min="1" inputmode="numeric" bind:value={form.number} />
        {/snippet}
      </Field>
      <Field label="Date" id={fieldId('date')} error={err('date')} required>
        {#snippet children(c)}<input {...c} type="date" bind:value={form.date} />{/snippet}
      </Field>
      <Field label="Time in" id={fieldId('time_in')} error={err('time_in')}>
        {#snippet children(c)}<input {...c} type="time" bind:value={form.time_in} />{/snippet}
      </Field>
      <Field label="Time out" id={fieldId('time_out')} error={err('time_out')}>
        {#snippet children(c)}<input {...c} type="time" bind:value={form.time_out} />{/snippet}
      </Field>
      <Field
        label="Duration (min)"
        id={fieldId('duration_min')}
        error={err('duration_min')}
        required
        hint={durationAuto && derivedDuration !== null ? 'from time in and out' : ''}
      >
        {#snippet children(c)}
          <input
            {...c}
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            bind:value={form.duration_min}
            oninput={(e) => (durationAuto = takeOver(e))}
          />
        {/snippet}
        {#snippet extra()}
          {#if !durationAuto && derivedDuration !== null && derivedDuration !== form.duration_min}
            <button
              type="button"
              class="derive"
              onclick={() => {
                durationAuto = true;
                form.duration_min = derivedDuration;
              }}>Use {derivedDuration} from times</button
            >
          {/if}
        {/snippet}
      </Field>
      <Field label="Max depth (m)" id={fieldId('max_depth_m')} error={err('max_depth_m')} required>
        {#snippet children(c)}
          <input
            {...c}
            type="number"
            min="0"
            step="0.1"
            inputmode="decimal"
            bind:value={form.max_depth_m}
          />
        {/snippet}
      </Field>
      <Field label="Avg depth (m)" id={fieldId('avg_depth_m')} error={err('avg_depth_m')}>
        {#snippet children(c)}
          <input
            {...c}
            type="number"
            min="0"
            step="0.1"
            inputmode="decimal"
            bind:value={form.avg_depth_m}
          />
        {/snippet}
      </Field>

      <Field label="Site" id={fieldId('site_id')} error={err('site_id')} class="wide">
        {#snippet children(c)}
          <div class="picker">
            <Combobox
              {...c}
              bind:value={form.site_id}
              options={siteOptions}
              placeholder="Type to find a site…"
              onchange={siteChanged}
            >
              {#snippet footer({ query, close })}
                <button
                  type="button"
                  class="dl-btn dl-btn-ghost dl-btn-sm"
                  onclick={() => {
                    close();
                    openSiteDialog(query);
                  }}>+ New site{query.trim() ? ` “${query.trim()}”` : ''}</button
                >
                <button
                  type="button"
                  class="dl-btn dl-btn-ghost dl-btn-sm"
                  onclick={() => {
                    close();
                    openCommons(query);
                  }}>From the commons</button
                >
              {/snippet}
            </Combobox>
            {#if site}
              <a
                class="dl-btn dl-btn-ghost dl-btn-sm"
                href={urls.site(site.slug)}
                target="_blank"
                rel="noopener"
                >View {site.name}<span class="dl-visually-hidden"> (new tab)</span> ↗</a
              >
            {/if}
          </div>
        {/snippet}
      </Field>
      {#if adopting}
        <div class="commons-pick wide">
          <CommonsSearch bind:query={commonsQuery} near={nearSite} onUse={adoptSite} />
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            onclick={() => (adopting = false)}>Close the commons search</button
          >
        </div>
      {/if}
      <Field
        label="Section / line"
        id={fieldId('section')}
        error={err('section')}
        hint={atSite?.section ? `last time: ${atSite.section}` : ''}
      >
        {#snippet children(c)}
          <input
            {...c}
            type="text"
            list="dl-dive-sections"
            bind:value={form.section}
            placeholder="e.g. upstream, E1"
          />
          <datalist id="dl-dive-sections">
            {#each sectionOptions as s (s)}<option value={s}></option>{/each}
          </datalist>
        {/snippet}
      </Field>
      <Field label="Buddies" id={fieldId('people_ids')} error={err('people_ids')} class="wide">
        {#snippet children(c)}
          <Combobox
            {...c}
            multiple
            bind:values={form.people_ids}
            options={peopleOptions}
            placeholder="Type a name…"
          >
            {#snippet footer({ query, close })}
              {#if query.trim()}
                <button
                  type="button"
                  class="dl-btn dl-btn-ghost dl-btn-sm"
                  disabled={addingPerson}
                  onclick={() => addPerson(query, close)}>Add person “{query.trim()}”</button
                >
              {:else}
                <span class="muted">Type a new name to add a person.</span>
              {/if}
            {/snippet}
          </Combobox>
        {/snippet}
      </Field>
      <Field
        label="Trip"
        id={fieldId('trip_id')}
        error={err('trip_id')}
        class="wide"
        hint={tripAuto && form.trip_id && tpl?.trip_for_date?.slug === form.trip_id
          ? 'from the date'
          : ''}
      >
        {#snippet children(c)}
          <Combobox
            {...c}
            bind:value={form.trip_id}
            options={tripOptions}
            placeholder="No trip"
            onchange={() => (tripAuto = false)}
          >
            {#snippet footer({ query, close })}
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                onclick={() => {
                  close();
                  openTripDialog(query);
                }}>+ New trip</button
              >
            {/snippet}
          </Combobox>
        {/snippet}
      </Field>
    </div>
  </Disclosure>

  <Disclosure summary="Gas & kit" bind:open={open.gas} persistKey="dive-form-gas" class="section">
    <div class="stack" data-section="gas">
      <div class="setup-row">
        <Field label="Gear setup" id={fieldId('gear_setup_id')} error={err('gear_setup_id')}>
          {#snippet children(c)}
            <select {...c} bind:value={form.gear_setup_id} onchange={pickSetup}>
              <option value={null}>— none —</option>
              {#each setups as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            </select>
          {/snippet}
        </Field>
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm"
          disabled={!setupHasTemplate(setup)}
          onclick={useSetup}>Use gear setup</button
        >
      </div>
      <div class="tanks">
        {#each form.tanks as tank, i (i)}
          {@const p = `tanks.${i}`}
          <fieldset class="tank">
            <legend>Tank {i + 1}</legend>
            <Field label="Role" id={fieldId(`${p}.role`)} error={err(`${p}.role`)}>
              {#snippet children(c)}
                <select {...c} bind:value={tank.role}>
                  <option value="back">back gas</option>
                  <option value="stage">stage</option>
                  <option value="deco">deco gas</option>
                  <option value="bailout">bailout</option>
                </select>
              {/snippet}
            </Field>
            <Field label="Cylinder" id={fieldId(`${p}.cylinder`)} error={err(`${p}.cylinder`)}>
              {#snippet children(c)}
                <input
                  {...c}
                  type="text"
                  list="dl-dive-cylinders"
                  bind:value={tank.cylinder}
                  onchange={() => {
                    const preset = presets.cylinders.find(
                      (x) => x.name.toLowerCase() === tank.cylinder.trim().toLowerCase(),
                    );
                    if (preset) tank.volume_l = preset.volume_l;
                  }}
                />
              {/snippet}
            </Field>
            <Field label="Volume (L)" id={fieldId(`${p}.volume_l`)} error={err(`${p}.volume_l`)}>
              {#snippet children(c)}
                <input
                  {...c}
                  type="number"
                  step="0.1"
                  inputmode="decimal"
                  bind:value={tank.volume_l}
                />
              {/snippet}
            </Field>
            <Field label="Standard gas" id={fieldId(`${p}.standard`)}>
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
                  <option value="">pick…</option>
                  {#each presets.gases as g (g.label)}<option value={g.label}>{g.label}</option
                    >{/each}
                </select>
              {/snippet}
            </Field>
            <Field label="Gas" id={fieldId(`${p}.gas`)} error={err(`${p}.gas`)}>
              {#snippet children(c)}
                <select
                  {...c}
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
              {/snippet}
            </Field>
            <Field label="O₂ %" id={fieldId(`${p}.o2_pct`)} error={err(`${p}.o2_pct`)}>
              {#snippet children(c)}
                <input
                  {...c}
                  type="number"
                  min="0"
                  max="100"
                  inputmode="numeric"
                  bind:value={tank.o2_pct}
                />
              {/snippet}
            </Field>
            <Field label="He %" id={fieldId(`${p}.he_pct`)} error={err(`${p}.he_pct`)}>
              {#snippet children(c)}
                <input
                  {...c}
                  type="number"
                  min="0"
                  max="100"
                  inputmode="numeric"
                  bind:value={tank.he_pct}
                />
              {/snippet}
            </Field>
            <Field
              label="Measured O₂ %"
              id={fieldId(`${p}.o2_measured_pct`)}
              error={err(`${p}.o2_measured_pct`)}
            >
              {#snippet children(c)}
                <input
                  {...c}
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  inputmode="decimal"
                  bind:value={tank.o2_measured_pct}
                />
              {/snippet}
            </Field>
            <Field
              label="In (bar)"
              id={fieldId(`${p}.pressure_in_bar`)}
              error={err(`${p}.pressure_in_bar`)}
            >
              {#snippet children(c)}
                <input {...c} type="number" inputmode="numeric" bind:value={tank.pressure_in_bar} />
              {/snippet}
            </Field>
            <Field
              label="Out (bar)"
              id={fieldId(`${p}.pressure_out_bar`)}
              error={err(`${p}.pressure_out_bar`)}
            >
              {#snippet children(c)}
                <input
                  {...c}
                  type="number"
                  inputmode="numeric"
                  bind:value={tank.pressure_out_bar}
                />
              {/snippet}
            </Field>
            <button
              type="button"
              class="dl-btn dl-btn-ghost dl-btn-sm remove-tank"
              onclick={() => (form.tanks = form.tanks.filter((_, j) => j !== i))}
              ><span aria-hidden="true">×</span><span class="label">Remove tank</span><span
                class="dl-visually-hidden"
              >
                {i + 1}</span
              ></button
            >
          </fieldset>
        {/each}
        <div class="tank-actions">
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            onclick={() =>
              (form.tanks = [...form.tanks, emptyTank(form.tanks.length ? 'stage' : 'back')])}
            >+ Tank</button
          >
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            onclick={() => (form.tanks = [...form.tanks, emptyTank('deco')])}>+ Deco gas</button
          >
          <span class="muted"
            >The first back-gas tank is the dive's gas; SAC comes from the back gas.</span
          >
        </div>
        <datalist id="dl-dive-cylinders">
          {#each presets.cylinders as cyl (cyl.name)}<option value={cyl.name}
              >{cyl.volume_l} L</option
            >{/each}
        </datalist>
      </div>
      <div class="grid">
        <Field label="Mode" id={fieldId('mode')} error={err('mode')}>
          {#snippet children(c)}
            <select {...c} bind:value={form.mode}>
              <option value="OC">open circuit</option>
              <option value="sidemount">sidemount</option>
              <option value="CCR">rebreather</option>
            </select>
          {/snippet}
        </Field>
        <Field label="Suit" id={fieldId('suit')} error={err('suit')}>
          {#snippet children(c)}<input {...c} type="text" bind:value={form.suit} />{/snippet}
        </Field>
        <Field label="Weights (kg)" id={fieldId('weights_kg')} error={err('weights_kg')}>
          {#snippet children(c)}
            <input
              {...c}
              type="number"
              step="0.5"
              min="0"
              inputmode="decimal"
              bind:value={form.weights_kg}
            />
          {/snippet}
        </Field>
        <Field
          label="Surface interval"
          id={fieldId('surface_interval')}
          error={err('surface_interval')}
          hint={intervalAuto && derivedInterval && previous
            ? `from #${previous.number}'s time out`
            : 'h:mm'}
        >
          {#snippet children(c)}
            <input
              {...c}
              type="text"
              autocomplete="off"
              bind:value={form.surface_interval}
              oninput={(e) => (intervalAuto = takeOver(e))}
              onchange={() => (form.surface_interval = normalizeInterval(form.surface_interval))}
            />
          {/snippet}
          {#snippet extra()}
            {#if !intervalAuto && derivedInterval && derivedInterval !== form.surface_interval}
              <button
                type="button"
                class="derive"
                onclick={() => {
                  intervalAuto = true;
                  form.surface_interval = derivedInterval;
                }}>Use {derivedInterval}</button
              >
            {/if}
          {/snippet}
        </Field>
        <Field
          label="Safety stop (min)"
          id={fieldId('safety_stop_min')}
          error={err('safety_stop_min')}
        >
          {#snippet children(c)}
            <input
              {...c}
              type="number"
              min="0"
              inputmode="numeric"
              bind:value={form.safety_stop_min}
            />
          {/snippet}
        </Field>
      </div>
    </div>
  </Disclosure>

  <Disclosure
    summary="Conditions"
    bind:open={open.conditions}
    persistKey="dive-form-conditions"
    count={filledCount(form, 'conditions') || null}
    class="section"
  >
    <div class="grid" data-section="conditions">
      <Field
        label="Water temp (°C)"
        id={fieldId('water_temp_c')}
        error={err('water_temp_c')}
        hint={waterAuto && derivedWater !== null && atSite
          ? `from #${atSite.number}, the last dive here`
          : ''}
      >
        {#snippet children(c)}
          <input
            {...c}
            type="number"
            step="0.5"
            bind:value={form.water_temp_c}
            oninput={(e) => (waterAuto = takeOver(e))}
          />
        {/snippet}
      </Field>
      <Field
        label="Surface water (°C)"
        id={fieldId('surface_temp_c')}
        error={err('surface_temp_c')}
      >
        {#snippet children(c)}
          <input {...c} type="number" step="0.5" bind:value={form.surface_temp_c} />
        {/snippet}
      </Field>
      <Field label="Air temp (°C)" id={fieldId('air_temp_c')} error={err('air_temp_c')}>
        {#snippet children(c)}
          <input {...c} type="number" step="0.5" bind:value={form.air_temp_c} />
        {/snippet}
      </Field>
      <Field label="Thermocline (m)" id={fieldId('thermocline_m')} error={err('thermocline_m')}>
        {#snippet children(c)}
          <input
            {...c}
            type="number"
            step="0.5"
            inputmode="decimal"
            bind:value={form.thermocline_m}
          />
        {/snippet}
      </Field>
      <Field label="Visibility (m)" id={fieldId('visibility_m')} error={err('visibility_m')}>
        {#snippet children(c)}
          <input
            {...c}
            type="number"
            step="1"
            min="0"
            inputmode="numeric"
            bind:value={form.visibility_m}
          />
        {/snippet}
      </Field>
      <Field label="Difficulty" id={fieldId('difficulty')} error={err('difficulty')}>
        {#snippet children(c)}<input {...c} type="text" bind:value={form.difficulty} />{/snippet}
      </Field>
      <Field label="Rating (1–5)" id={fieldId('rating')} error={err('rating')}>
        {#snippet children(c)}
          <input
            {...c}
            type="number"
            min="1"
            max="5"
            inputmode="numeric"
            bind:value={form.rating}
          />
        {/snippet}
      </Field>
      <Field label="Conditions" id={fieldId('conditions')} error={err('conditions')} class="wide">
        {#snippet children(c)}
          <input
            {...c}
            type="text"
            bind:value={form.conditions}
            placeholder="surge, weather, current, tide…"
          />
        {/snippet}
      </Field>
      <div class="wide" role="group" aria-labelledby="dl-dive-tags-label">
        <span class="group-label" id="dl-dive-tags-label">Tags</span>
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
      </div>
    </div>
  </Disclosure>

  <Disclosure
    summary="On the map"
    bind:open={open.map}
    persistKey="dive-form-map"
    count={form.map_annotation ? '✓' : null}
    class="section"
  >
    <div class="stack on-map" id="map" data-section="map">
      {#if site}
        <AnnotationStale annotation={form.map_annotation} maps={siteMaps} {busy} onRepin={repin} />
        {#if siteMaps.length || form.map_annotation}
          <DiveRouteEditor
            maps={siteMaps}
            value={form.map_annotation}
            onChange={(a) => (form.map_annotation = a)}
          />
        {/if}
        <div class="row">
          {#if !siteMaps.length}
            <p class="muted">No drawn map for {site.name} yet.</p>
            <a
              class="dl-btn dl-btn-ghost dl-btn-sm"
              href={urls.admin.siteMaps(site.id)}
              target="_blank"
              rel="noopener">Draw a map<span class="dl-visually-hidden"> (new tab)</span> ↗</a
            >
          {/if}
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            disabled={refreshing}
            onclick={refreshMaps}>{refreshing ? '↻ Refreshing…' : '↻ Refresh maps'}</button
          >
          <span class="muted">after drawing one in another tab</span>
        </div>
      {:else}
        <p class="muted">Pick a site first to mark the route on one of its maps.</p>
      {/if}
    </div>
  </Disclosure>

  <Disclosure
    summary="Story"
    bind:open={open.story}
    persistKey="dive-form-story"
    count={filledCount(form, 'story') || null}
    class="section"
  >
    <div class="stack" data-section="story">
      <div class="grid">
        <Field label="Title" id={fieldId('title')} error={err('title')} class="wide">
          {#snippet children(c)}
            <input
              {...c}
              type="text"
              maxlength="200"
              bind:value={form.title}
              placeholder="Optional — defaults to the site name"
            />
          {/snippet}
        </Field>
        <Field label="Course / purpose" id={fieldId('course')} error={err('course')} class="wide">
          {#snippet children(c)}<input {...c} type="text" bind:value={form.course} />{/snippet}
        </Field>
      </div>
      <Field label="Story (markdown)" id={fieldId('body_md')} error={err('body_md')}>
        {#snippet children(c)}
          {#if previewing}
            <div class="preview dl-prose" aria-live="polite">
              {#if previewError}<p class="error" role="alert">{previewError}</p>
              {:else}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by the server's renderer -->
                {@html previewHtml}
              {/if}
            </div>
            <textarea {...c} hidden rows="8" bind:value={form.body_md}></textarea>
          {:else}
            <textarea {...c} rows="8" bind:value={form.body_md}></textarea>
          {/if}
        {/snippet}
        {#snippet extra()}
          <button
            type="button"
            class="derive"
            aria-pressed={previewing}
            onclick={() => (previewing = !previewing)}>Preview</button
          >
        {/snippet}
      </Field>
      <Disclosure
        summary="Transcription"
        bind:open={open.transcription}
        persistKey="dive-form-transcription"
        count={filledCount(form, 'transcription') || null}
        class="nested"
      >
        <div class="grid" data-section="transcription">
          <p class="muted wide">What the paper log says, word for word.</p>
          <Field
            label="Original notes"
            id={fieldId('notes_nl')}
            error={err('notes_nl')}
            class="wide"
          >
            {#snippet children(c)}<textarea {...c} rows="4" bind:value={form.notes_nl}
              ></textarea>{/snippet}
          </Field>
          <Field
            label="Visibility as written"
            id={fieldId('visibility_raw')}
            error={err('visibility_raw')}
          >
            {#snippet children(c)}
              <input
                {...c}
                type="text"
                bind:value={form.visibility_raw}
                placeholder="e.g. 5-15 (upstream)"
              />
            {/snippet}
          </Field>
          <Field label="Gas as written" id={fieldId('gas_raw')} error={err('gas_raw')}>
            {#snippet children(c)}<input {...c} type="text" bind:value={form.gas_raw} />{/snippet}
          </Field>
          <Field label="As ticked on the page" id={fieldId('types_raw')} error={err('types_raw')}>
            {#snippet children(c)}
              <input
                {...c}
                type="text"
                bind:value={form.types_raw}
                placeholder="Salt Water; Fun; Nitrox"
              />
            {/snippet}
          </Field>
        </div>
      </Disclosure>
    </div>
  </Disclosure>

  <Disclosure
    summary="Private"
    bind:open={open.private}
    persistKey="dive-form-private"
    count={filledCount(form, 'private') || null}
    class="section"
  >
    <div class="grid" data-section="private">
      <p class="muted wide">Kept in the log, never shown on the public pages.</p>
      <Field label="Guide" id={fieldId('guide')} error={err('guide')}>
        {#snippet children(c)}<input {...c} type="text" bind:value={form.guide} />{/snippet}
      </Field>
      <Field label="Operator / centre" id={fieldId('operator')} error={err('operator')}>
        {#snippet children(c)}<input {...c} type="text" bind:value={form.operator} />{/snippet}
      </Field>
      <Field label="Buddy as written" id={fieldId('buddy_raw')} error={err('buddy_raw')}>
        {#snippet children(c)}<input {...c} type="text" bind:value={form.buddy_raw} />{/snippet}
      </Field>
      <Field label="Buddy role" id={fieldId('buddy_role')} error={err('buddy_role')}>
        {#snippet children(c)}<input {...c} type="text" bind:value={form.buddy_role} />{/snippet}
      </Field>
      <Field label="Sketch on the page" id={fieldId('sketch')} error={err('sketch')}>
        {#snippet children(c)}<input {...c} type="text" bind:value={form.sketch} />{/snippet}
      </Field>
      <Field
        label="Computer records"
        id={fieldId('computer')}
        error={err('computer')}
        hint="Perdix dive numbers, e.g. 457, 458"
      >
        {#snippet children(c)}<input {...c} type="text" bind:value={computerText} />{/snippet}
      </Field>
    </div>
  </Disclosure>

  <Disclosure
    summary="Publishing"
    bind:open={open.publishing}
    persistKey="dive-form-publishing"
    count={form.visibility}
    class="section"
  >
    <div class="stack" data-section="publishing">
      <Field
        label="Published as"
        id={fieldId('visibility')}
        error={err('visibility')}
        hint={VISIBILITY_HELP[form.visibility]}
      >
        {#snippet children(c)}
          <select {...c} bind:value={form.visibility}>
            <option value="public">public</option>
            <option value="private">private</option>
            <option value="draft">draft</option>
          </select>
        {/snippet}
      </Field>
      {#if form.visibility !== 'draft'}
        <div class="row">
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            disabled={busy}
            onclick={saveAsDraft}>Save as draft</button
          >
          <span class="muted">Keeps the dive off the public log until you publish it.</span>
        </div>
      {/if}
    </div>
  </Disclosure>

  {#if attachments}
    <div class="photos">{@render attachments()}</div>
  {:else if isNew}
    <section class="photos" aria-labelledby="dl-dive-photos">
      <h2 id="dl-dive-photos" class="section-title">Photos & files</h2>
      <div class="queue">
        <div class="row">
          <Field label="Upload as" id="dl-dive-queue-kind">
            {#snippet children(c)}
              <select {...c} bind:value={queueKind}>
                {#each UPLOAD_KINDS as k (k)}<option value={k}>{k}</option>{/each}
              </select>
            {/snippet}
          </Field>
          <label class="check">
            <input type="checkbox" bind:checked={queuePublic} disabled={queueKind === 'scan'} />
            {queueKind === 'scan' ? 'scans start private' : 'public'}
          </label>
          <label class="file">
            <span class="dl-btn dl-btn-ghost dl-btn-sm">Choose files</span>
            <input
              type="file"
              multiple
              accept={queueKind === 'photo' ? 'image/*' : undefined}
              class="dl-visually-hidden"
              onchange={queueFiles}
            />
          </label>
          {#if queueKind === 'photo'}
            <label class="file">
              <span class="dl-btn dl-btn-ghost dl-btn-sm">Take a photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="dl-visually-hidden"
                onchange={queueFiles}
              />
            </label>
          {/if}
        </div>
        {#if queue.length}
          <ul class="queued">
            {#each queue as q, i (i)}
              <li>
                <span>{q.file.name}</span>
                <span class="muted"
                  >{q.kind}{q.kind !== 'scan' && !q.public ? ' · private' : ''}</span
                >
                <button
                  type="button"
                  class="dl-btn dl-btn-ghost dl-btn-sm"
                  onclick={() => (queue = queue.filter((_, j) => j !== i))}
                  >Remove<span class="dl-visually-hidden"> {q.file.name}</span></button
                >
              </li>
            {/each}
          </ul>
        {/if}
        <p class="muted">Files chosen now are uploaded right after the first save.</p>
      </div>
    </section>
  {/if}

  <div class="save-bar">
    <button
      type="submit"
      class="dl-btn dl-btn-solid"
      disabled={busy}
      aria-keyshortcuts="Control+S Meta+S">{busy ? 'Saving…' : 'Save'}</button
    >
    <button
      type="button"
      class="dl-btn dl-btn-ghost dl-btn-sm"
      disabled={busy}
      onclick={() => persist('new')}>Save & new</button
    >
    {#if neighbours?.next}
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        disabled={busy}
        onclick={() => persist('next')}>Save & next draft</button
      >
    {/if}
    <span class="status" role="status">
      {#if dirty}<span class="unsaved">● Unsaved changes</span>{:else if savedLabel}<span
          class="saved">{savedLabel}</span
        >{/if}
    </span>
    {#if error}<span class="error">{error}</span>{/if}
    {#each unplaced as [path, message] (path)}<span class="error">{path}: {message}</span>{/each}
    <span class="spacer"></span>
    {#if neighbours?.previous}
      <a class="dl-btn dl-btn-ghost dl-btn-sm" href={urls.admin.dive(neighbours.previous)}
        >← Previous draft</a
      >
    {/if}
    {#if dive}
      <a
        class="dl-btn dl-btn-ghost dl-btn-sm"
        href={urls.dive(dive.number)}
        target="_blank"
        rel="noopener"
        >View<span class="dl-visually-hidden"> dive #{dive.number} (new tab)</span> ↗</a
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm danger"
        disabled={busy}
        onclick={remove}>Delete</button
      >
    {/if}
  </div>
</form>

<Dialog bind:open={siteDialogOpen} title="New site" size="lg">
  <SiteCreate
    compact
    {regions}
    near={nearSite}
    initial={newSite}
    onCreated={useNewSite}
    onUse={useNewSite}
    onCancel={() => (siteDialogOpen = false)}
  />
</Dialog>

<Dialog bind:open={tripDialogOpen} title="New trip" size="sm">
  <form class="mini" onsubmit={createTrip}>
    <label>Name<input type="text" bind:value={newTrip.name} required maxlength="200" /></label>
    <div class="field-row">
      <label>Start<input type="date" bind:value={newTrip.start_date} /></label>
      <label>End<input type="date" bind:value={newTrip.end_date} /></label>
    </div>
    {#if slugify(newTrip.name)}<p class="muted">slug <code>{slugify(newTrip.name)}</code></p>{/if}
    {#if tripError}<p class="error" role="alert">{tripError}</p>{/if}
    <div class="mini-actions">
      <button type="submit" class="dl-btn dl-btn-solid dl-btn-sm" disabled={tripBusy}
        >{tripBusy ? 'Creating…' : 'Create trip'}</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        onclick={() => (tripDialogOpen = false)}>Cancel</button
      >
    </div>
  </form>
</Dialog>

<style>
  .dive-form {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-3);
  }
  .dive-form :global(.section) {
    background: var(--dl-color-bg-elevated);
  }
  .dive-form :global(.nested) {
    margin-top: var(--dl-space-2);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--dl-space-3);
    align-items: start;
  }
  .grid > :global(.wide),
  .grid > .wide {
    grid-column: 1 / -1;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-3);
  }
  .row,
  .setup-row,
  .picker {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--dl-space-2);
  }
  .row {
    align-items: center;
  }
  .picker > :global(.dl-combobox) {
    flex: 1 1 16rem;
    min-width: 0;
  }
  .setup-row > :global(.dl-field) {
    flex: 1 1 12rem;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-sm);
    margin: 0;
  }
  .derive {
    background: none;
    border: none;
    padding: 0 var(--dl-space-1);
    min-height: 24px;
    font: inherit;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .derive[aria-pressed='true'] {
    font-weight: 600;
  }
  .tanks {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-2);
  }
  .tank {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: var(--dl-space-2) var(--dl-space-3);
    align-items: end;
    margin: 0;
    padding: var(--dl-space-2) var(--dl-space-3) var(--dl-space-3);
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface);
  }
  .tank legend {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    padding: 0 var(--dl-space-1);
  }
  .remove-tank {
    justify-self: start;
    gap: var(--dl-space-1);
  }
  .tank-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-2);
  }
  .group-label {
    display: block;
    margin-bottom: var(--dl-space-1);
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips .dl-tag,
  .chip {
    cursor: pointer;
    min-height: 28px;
  }
  .dl-tag.active {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-accent);
  }
  .chip:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .same,
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-2) var(--dl-space-3);
    margin-bottom: var(--dl-space-3);
    padding: var(--dl-space-2) var(--dl-space-3);
    border: 1px dashed var(--dl-color-border-strong);
    border-radius: var(--dl-radius);
  }
  .notice {
    border-style: solid;
    border-color: var(--dl-color-info-fg, var(--dl-color-accent));
  }
  .same-label {
    font-weight: 600;
    color: var(--dl-color-text);
  }
  .same-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dl-space-2);
    width: 100%;
  }
  .commons-pick {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-2);
    padding: 10px;
    border: 1px dashed var(--dl-color-border-strong);
    border-radius: var(--dl-radius-sm);
  }
  .preview {
    min-height: 10rem;
    padding: var(--dl-space-2) var(--dl-space-3);
    border: 1px solid var(--dl-color-border-control);
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface);
  }
  textarea {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-base);
    line-height: 1.5;
  }
  .photos {
    padding: var(--dl-space-3) var(--dl-space-4);
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
  }
  .section-title {
    margin: 0 0 var(--dl-space-2);
    font-size: var(--dl-text-lg);
  }
  .queue {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-2);
  }
  .check {
    flex-direction: row !important;
    align-items: center;
  }
  .file {
    position: relative;
    cursor: pointer;
  }
  .queued {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-1);
  }
  .queued li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-2);
  }
  .save-bar {
    display: flex;
    gap: var(--dl-space-2);
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
  .save-bar .dl-btn-solid {
    min-height: 44px;
  }
  .save-bar .spacer {
    flex: 1;
  }
  .save-bar .error {
    margin: 0;
  }
  .unsaved,
  .saved {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-sm);
  }
  .unsaved {
    color: var(--dl-color-warm);
  }
  .saved {
    color: var(--dl-color-text-muted);
  }
  .danger:hover {
    color: var(--dl-color-danger);
  }
  @media (pointer: coarse) {
    .derive,
    .chips .dl-tag,
    .chip {
      min-height: 44px;
    }
    .derive {
      padding: 0 var(--dl-space-2);
    }
    .danger {
      color: var(--dl-color-danger);
    }
  }
  form.mini {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .mini-actions {
    display: flex;
    gap: 8px;
  }
  @media (max-width: 700px) {
    .grid {
      grid-template-columns: 1fr;
    }
    .tank {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .save-bar {
      padding: var(--dl-space-2);
      border-radius: var(--dl-radius) var(--dl-radius) 0 0;
    }
    .save-bar .spacer {
      display: none;
    }
  }
</style>
