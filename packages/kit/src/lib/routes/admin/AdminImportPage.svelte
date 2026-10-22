<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { AdminDataFor } from '../admin';
  import { invalidateAll } from '$app/navigation';
  import { adminUpload, adminUploadMany, AdminApiError } from '$lib/core/admin/client';
  import { importLines } from '$lib/core/admin/dive-list';
  import {
    CLOUD_EXPORT_HELP,
    applySplits,
    carryChoices,
    carryPartChoices,
    carrySplits,
    carryTicks,
    chooseRow,
    chooseSplit,
    cloudErrorMessage,
    cloudFields,
    cloudLines,
    cloudSections,
    joinParam,
    linkParam,
    needsSplitRun,
    nothingNew,
    onlyParam,
    parseChoice,
    parseClockOffset,
    previewAnnouncement,
    previewRows,
    selectionLine,
    setTick,
    splitParam,
    tickedCount,
    viewRows,
    type CloudChoices,
    type CloudPartChoices,
    type CloudPreview,
    type CloudRowView,
    type CloudSplits,
  } from '$lib/core/admin/cloud-import';
  import { getDivelog } from '$lib/core/dive/context';
  import type { ImportResult } from '$lib/core/dive/types';
  import { announce } from '$lib/core/ui/announce.js';
  import ImportSites from '$lib/components/admin/ImportSites.svelte';
  import Disclosure from '$lib/components/ui/Disclosure.svelte';
  import Field from '$lib/components/ui/Field.svelte';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'import'> } = $props();

  type Format = 'shearwater' | 'subsurface' | 'cloud';
  const LABELS: Record<Format, string> = {
    shearwater: 'Shearwater Perdix',
    subsurface: 'Subsurface',
    cloud: 'Shearwater Cloud export',
  };
  const OFFSET_DELAY_MS = 500;
  const SPLIT_DELAY_MS = 400;
  const CLOUD_HASH = '#shearwater-cloud';

  let busy = $state(false);
  let pending = $state<{ format: Format; files: File[] } | null>(null);
  let preview = $state<ImportResult | null>(null);
  let result = $state<ImportResult | null>(null);
  let error = $state('');
  let outcome = $state<HTMLElement>();

  let cloud = $state<CloudPreview | null>(null);
  let ticked = $state<number[]>([]);
  let choices = $state<CloudChoices>({});
  let splits = $state<CloudSplits>({});
  let partChoices = $state<CloudPartChoices>({});
  let cloudInput = $state<HTMLInputElement>();
  let cloudCard = $state<HTMLElement>();
  let offsetText = $state('');
  let offsetMin = $state(0);
  let offsetError = $state('');
  let checking = $state('');
  let offsetTimer: ReturnType<typeof setTimeout> | undefined;
  let splitTimer: ReturnType<typeof setTimeout> | undefined;
  let runs = 0;
  const offsetDirty = $derived(parseClockOffset(offsetText) !== offsetMin);
  const rows = $derived(cloud ? applySplits(cloud.rows, splits, choices) : []);
  const shown = $derived<CloudPreview | null>(cloud ? { ...cloud, rows } : null);
  const splitDirty = $derived(needsSplitRun(rows));
  const settling = $derived(!!cloud && (!!checking || splitDirty));
  const cloudViews = $derived(
    cloud ? cloudSections(viewRows(rows, choices, partChoices, !settling)) : null,
  );

  $effect(() => () => {
    clearTimeout(offsetTimer);
    clearTimeout(splitTimer);
  });

  onMount(() => {
    if (location.hash !== CLOUD_HASH) return;
    cloudInput?.focus({ preventScroll: true });
    cloudCard?.scrollIntoView({ block: 'start' });
  });

  /**
   * The dry run sends the file, the offset and the splits; the commit adds the ticks, links and
   * joins.
   */
  function sendCloud(
    file: File,
    dryRun: boolean,
    clockOffsetMin: number,
    split = splitParam(rows),
  ): Promise<ImportResult> {
    const commit = !dryRun && cloud ? rows : null;
    return adminUpload<ImportResult>(
      '/admin/import/shearwater-cloud',
      file,
      cloudFields({
        dryRun,
        only: commit ? onlyParam(commit, ticked, choices) : undefined,
        link: commit ? linkParam(commit, choices, partChoices) : undefined,
        join: commit ? joinParam(commit, choices) : undefined,
        split,
        clockOffsetMin,
      }),
    );
  }

  function pick(row: number, value: string) {
    if (!cloud) return;
    ({ choices, ticked } = chooseRow(rows, choices, ticked, row, value));
  }

  function pickPart(key: string, value: string) {
    partChoices = { ...partChoices, [key]: parseChoice(value) };
  }

  /** A break ticked or unticked: the dry run again with the new splits, once the owner pauses. */
  function toggleBreak(n: number, at: number, on: boolean) {
    const row = rows.find((r) => r.computerNo === n);
    if (!row) return;
    splits = chooseSplit(splits, row, at, on);
    clearTimeout(splitTimer);
    splitTimer = setTimeout(
      () => void recheck(parseClockOffset(offsetText) ?? offsetMin, 'Split applied'),
      SPLIT_DELAY_MS,
    );
  }

  function send(format: Format, files: File[], dryRun: boolean): Promise<ImportResult> {
    const fields: Record<string, string> = dryRun ? { dry_run: 'true' } : {};
    if (format === 'cloud') return sendCloud(files[0], dryRun, offsetMin);
    return format === 'subsurface'
      ? adminUpload<ImportResult>('/admin/import/subsurface', files[0], fields)
      : adminUploadMany<ImportResult>('/admin/import/shearwater', files, fields);
  }

  async function choose(format: Format, list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    pending = { format, files };
    preview = null;
    result = null;
    error = '';
    resetCloud();
    busy = true;
    try {
      preview = await send(format, files, true);
      if (format === 'cloud') {
        cloud = previewRows(preview);
        ticked = cloud.ticked;
        if (!splitDirty) announce(`Preview ready: ${previewAnnouncement(preview, cloud)}`);
      } else announce(`Preview ready: ${importLines(preview).join('; ')}`);
      await tick();
      outcome?.focus();
      if (format === 'cloud' && splitDirty) void recheck(0, 'Preview ready', true);
    } catch (err) {
      error =
        format === 'cloud'
          ? cloudErrorMessage(err, 'Could not read the file')
          : err instanceof AdminApiError
            ? err.message
            : 'Could not read the file';
      pending = null;
    } finally {
      busy = false;
    }
  }

  async function commit() {
    if (!pending) return;
    busy = true;
    error = '';
    try {
      result = await send(pending.format, pending.files, false);
      preview = null;
      pending = null;
      resetCloud();
      announce(`Imported: ${importLines(result).join('; ')}`);
      await invalidateAll();
      await tick();
      outcome?.focus();
    } catch (err) {
      error =
        pending?.format === 'cloud'
          ? cloudErrorMessage(err, 'Import failed')
          : err instanceof AdminApiError
            ? err.message
            : 'Import failed';
    } finally {
      busy = false;
    }
  }

  function cancel() {
    pending = null;
    preview = null;
    resetCloud();
    announce('Import cancelled');
  }

  function resetCloud() {
    clearTimeout(offsetTimer);
    clearTimeout(splitTimer);
    runs++;
    cloud = null;
    ticked = [];
    choices = {};
    splits = {};
    partChoices = {};
    offsetText = '';
    offsetMin = 0;
    offsetError = '';
    checking = '';
  }

  /**
   * The dry run again with another clock offset or other splits; the ticks and choices carry
   * over, focus stays put. When the new rows split differently (a break suggested only now), it
   * runs once more by itself.
   */
  async function recheck(min: number, said: string, again = false) {
    if (!pending || pending.format !== 'cloud' || !cloud) return;
    clearTimeout(splitTimer);
    const run = ++runs;
    const split = splitParam(rows);
    checking = min === offsetMin ? 'Splitting the dive…' : 'Applying the clock offset…';
    error = '';
    try {
      const next = await sendCloud(pending.files[0], true, min, split);
      if (run !== runs || !cloud) return;
      const fresh = previewRows(next, split);
      ticked = carryTicks(fresh.rows, cloud.rows, ticked);
      choices = carryChoices(fresh.rows, choices);
      splits = carrySplits(fresh.rows, splits);
      partChoices = carryPartChoices(fresh.rows, cloud.rows, partChoices);
      cloud = fresh;
      preview = next;
      offsetMin = min;
      if (splitDirty && !again) {
        void recheck(min, said, true);
        return;
      }
      announce(`${said}: ${previewAnnouncement(next, shown!, ticked, choices)}`);
    } catch (err) {
      if (run === runs) error = cloudErrorMessage(err, 'Could not read the file');
    } finally {
      if (run === runs) checking = '';
    }
  }

  function applyOffset() {
    clearTimeout(offsetTimer);
    const min = parseClockOffset(offsetText);
    offsetError = min === null ? 'Use a form like +7 h, -30 min or +1:30, at most a day' : '';
    if (min !== null && min !== offsetMin) void recheck(min, 'Clock offset applied');
  }

  function typeOffset(text: string) {
    offsetText = text;
    clearTimeout(offsetTimer);
    offsetTimer = setTimeout(applyOffset, OFFSET_DELAY_MS);
  }
</script>

<h1>Import from a dive computer</h1>
<p class="muted">
  Pick the Shearwater Cloud export, or Perdix XML files, or a Subsurface file. A dive that starts
  within ten minutes of a logged dive, or that the log knows by its computer number, gets its
  profile attached to that dive. Anything else becomes a <strong>draft</strong> dive with the numbers
  filled in, for you to give a site, buddies and a story. You see what would happen before anything is
  written.
</p>

<div class="drops">
  <div class="cloud" id="shearwater-cloud" bind:this={cloudCard}>
    <label class="drop dl-card" class:disabled={busy}>
      <input
        bind:this={cloudInput}
        type="file"
        class="dl-visually-hidden"
        aria-describedby="dl-cloud-steps"
        onchange={(e) => {
          void choose('cloud', e.currentTarget.files);
          e.currentTarget.value = '';
        }}
        disabled={busy}
      />
      <strong>{LABELS.cloud}</strong>
      <span>Choose the exported .db file</span>
    </label>
    <p id="dl-cloud-steps" class="steps">{CLOUD_EXPORT_HELP}</p>
  </div>
  <label class="drop dl-card" class:disabled={busy}>
    <input
      type="file"
      multiple
      accept=".xml,application/xml,text/xml"
      class="dl-visually-hidden"
      onchange={(e) => {
        void choose('shearwater', e.currentTarget.files);
        e.currentTarget.value = '';
      }}
      disabled={busy}
    />
    <strong>{LABELS.shearwater}</strong>
    <span>Choose one or more Perdix .xml files</span>
  </label>
  <label class="drop dl-card" class:disabled={busy}>
    <input
      type="file"
      accept=".xml,.ssrf,application/xml,text/xml"
      class="dl-visually-hidden"
      onchange={(e) => {
        void choose('subsurface', e.currentTarget.files);
        e.currentTarget.value = '';
      }}
      disabled={busy}
    />
    <strong>{LABELS.subsurface}</strong>
    <span>Choose a Subsurface .xml / .ssrf file</span>
  </label>
</div>

<p class="status" role="status">
  {checking ? checking : busy ? (preview ? 'Importing…' : 'Reading the file…') : ''}
</p>
{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if preview && pending}
  <section
    class="dl-card summary preview"
    aria-labelledby="dl-import-preview"
    aria-busy={settling || undefined}
    tabindex="-1"
    bind:this={outcome}
  >
    <h2 id="dl-import-preview">
      Preview: {LABELS[pending.format]}, {pending.files.length} file{pending.files.length === 1
        ? ''
        : 's'}
    </h2>
    {#if shown}
      {@render cloudPreview(preview, shown)}
    {:else}
      <ul class="lines">
        {#each importLines(preview) as line (line)}<li>{line}</li>{/each}
      </ul>
      {#if preview.created.length}
        <p class="muted">New drafts would be numbered #{preview.created.join(', #')}.</p>
      {/if}
      {#if preview.updated.length}
        <p class="muted">
          Profiles for
          {#each preview.updated as n, i (n)}{i ? ', ' : ''}<a href={urls.admin.dive(n)}>#{n}</a
            >{/each}.
        </p>
      {/if}
    {/if}
    <ImportSites sites={preview.sites ?? []} />
    <div class="actions">
      <button
        type="button"
        class="dl-btn dl-btn-solid dl-btn-sm"
        disabled={busy ||
          (cloud
            ? settling || offsetDirty || !tickedCount(rows, ticked, choices)
            : !preview.created.length && !preview.updated.length)}
        onclick={commit}>Import</button
      >
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" disabled={busy} onclick={cancel}
        >Cancel</button
      >
    </div>
  </section>
{/if}

{#snippet cloudPreview(report: ImportResult, view: CloudPreview)}
  <ul class="lines">
    {#each cloudLines(report, view) as line (line)}<li>{line}</li>{/each}
  </ul>
  <Field
    label="Clock offset"
    hint="e.g. +7 h if the computer was on trip time"
    error={offsetError}
    class="offset"
  >
    {#snippet children(control)}
      <input
        {...control}
        class="dl-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="done"
        value={offsetText}
        oninput={(e) => typeOffset(e.currentTarget.value)}
        onblur={applyOffset}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyOffset();
          }
        }}
      />
    {/snippet}
  </Field>
  {#if nothingNew(view)}
    <p class="empty"><strong>Nothing new to import.</strong></p>
  {:else if cloudViews}
    <p class="muted">{selectionLine(view, ticked, choices)}</p>
    {#if cloudViews.current.length}
      <fieldset class="dives">
        <legend>Dives to import</legend>
        <ul class="dive-list">
          {#each cloudViews.current as row (row.row.key)}{@render diveRow(row)}{/each}
        </ul>
      </fieldset>
    {:else}
      <p class="empty">No dives after the newest one the log has from this computer.</p>
    {/if}
    {#if cloudViews.older.length}
      <Disclosure
        summary="Older dives not in your log"
        count={cloudViews.older.length}
        class="older"
      >
        <fieldset class="dives">
          <legend class="dl-visually-hidden">Older dives not in your log</legend>
          <p class="muted">
            These are older than the newest dive the log has from this computer. Tick the ones you
            want.
          </p>
          <ul class="dive-list">
            {#each cloudViews.older as row (row.row.key)}{@render diveRow(row)}{/each}
          </ul>
        </fieldset>
      </Disclosure>
    {/if}
  {/if}
  {#if cloudViews?.broken.length}
    <p class="muted">Could not be read, not imported:</p>
    <ul class="dive-list">
      {#each cloudViews.broken as row (row.row.key)}
        <li class="dive-row">
          <span class="dive-text">
            <strong>{row.title}</strong>
            <span>{row.when}</span>
            <span class="outcome error">{row.outcome}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet diveText(view: CloudRowView)}
  <span class="dive-text">
    <strong id="dl-cloud-{view.row.key}">{view.title}</strong>
    <span>{view.when}</span>
    <span>{view.facts}</span>
    <span class="outcome {view.joinedTo === null ? view.row.status : ''}">{view.outcome}</span>
  </span>
{/snippet}

{#snippet diveRow(view: CloudRowView)}
  <li class="dive-item">
    {#if view.joinedTo === null}
      <label class="dive-row">
        <input
          type="checkbox"
          checked={ticked.includes(view.row.computerNo)}
          disabled={busy}
          onchange={(e) => (ticked = setTick(ticked, view.row.computerNo, e.currentTarget.checked))}
        />
        {@render diveText(view)}
      </label>
    {:else}
      <div class="dive-row joined">{@render diveText(view)}</div>
    {/if}
    {#if view.options.length > 1}
      {@render belongsTo(view.options, view.value, `dl-cloud-${view.row.key}`, (value) =>
        pick(view.row.computerNo, value),
      )}
    {/if}
    {#if view.breaks.length}
      <fieldset class="split" aria-describedby="dl-cloud-{view.row.key}">
        <legend>Split this dive at</legend>
        {#each view.breaks as brk (brk.startS)}
          <label class="split-break">
            <input
              type="checkbox"
              checked={brk.checked}
              disabled={busy}
              onchange={(e) =>
                toggleBreak(view.row.computerNo, brk.startS, e.currentTarget.checked)}
            />
            <span>{brk.label}</span>
          </label>
        {/each}
      </fieldset>
    {/if}
    {#if view.parts.length}
      <ol class="parts" aria-label="Parts of {view.row.title}">
        {#each view.parts as part (part.part.key)}
          {@const id = `dl-cloud-${view.row.key}-part-${part.part.part}`}
          <li class="part">
            <span class="dive-text" {id}>
              <strong>{part.part.title}</strong>
              <span class="outcome {part.value === 'own' ? part.part.status : ''}"
                >{part.outcome}</span
              >
            </span>
            {#if part.options.length > 1}
              {@render belongsTo(part.options, part.value, id, (value) =>
                pickPart(part.part.key, value),
              )}
            {/if}
          </li>
        {/each}
      </ol>
    {:else if view.partsPending && !error}
      <p class="parts pending">Working out the parts…</p>
    {/if}
  </li>
{/snippet}

{#snippet belongsTo(
  options: CloudRowView['options'],
  value: string,
  describedby: string,
  onpick: (value: string) => void,
)}
  <Field label="Belongs to" {describedby} class="belongs">
    {#snippet children(control)}
      <select
        {...control}
        class="dl-select"
        disabled={busy}
        {value}
        onchange={(e) => onpick(e.currentTarget.value)}
      >
        {#each options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    {/snippet}
  </Field>
{/snippet}

{#if result}
  <section
    class="dl-card summary done"
    aria-labelledby="dl-import-done"
    tabindex="-1"
    bind:this={outcome}
  >
    <h2 id="dl-import-done">Imported</h2>
    <ul class="lines">
      {#each importLines(result) as line (line)}<li>{line}</li>{/each}
    </ul>
    {#if result.created.length}
      <p class="created">
        New drafts:
        {#each result.created as n, i (n)}{i ? ', ' : ''}<a href={urls.admin.dive(n)}>#{n}</a
          >{/each}
      </p>
    {/if}
    {#if result.updated.length}
      <p>
        Profiles added to
        {#each result.updated as n, i (n)}{i ? ', ' : ''}<a href={urls.admin.dive(n)}>#{n}</a
          >{/each}
      </p>
    {/if}
    <ImportSites sites={result.sites ?? []} />
    {#if result.created.length}
      <div class="actions">
        <a class="dl-btn dl-btn-solid dl-btn-sm" href={urls.admin.dives({ status: 'draft' })}
          >Review drafts</a
        >
        <a class="dl-btn dl-btn-ghost dl-btn-sm" href={urls.admin.dive(result.created[0])}
          >Open draft #{result.created[0]}</a
        >
      </div>
    {/if}
  </section>
{/if}

{#if data.imports.length}
  <h2>Previous imports</h2>
  <div class="table-wrap">
    <table>
      <caption class="dl-visually-hidden">Previous imports, newest first</caption>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">File</th>
          <th scope="col">Created</th>
          <th scope="col">Updated</th>
          <th scope="col"><span class="dl-visually-hidden">Download</span></th>
        </tr>
      </thead>
      <tbody>
        {#each data.imports as row (row.id)}
          <tr>
            <td class="dl-num when">
              <span>{row.created_at.slice(0, 10)}</span>
              <span>{row.created_at.slice(11, 16)}</span>
            </td>
            <td class="file">{row.original_name}</td>
            <td class="dl-num count"
              >{row.created.length}<span class="count-label">&nbsp;created</span></td
            >
            <td class="dl-num count updated"
              >{row.updated.length}<span class="count-label">&nbsp;updated</span></td
            >
            <td class="download"
              ><a href={row.url}
                >download<span class="dl-visually-hidden"> {row.original_name}</span></a
              ></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .muted {
    color: var(--dl-color-text-muted);
    max-width: 64ch;
  }
  .drops {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
    margin: 20px 0 8px;
  }
  .drop {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    justify-content: center;
    padding: 36px 16px;
    border-style: dashed;
    cursor: pointer;
    background: var(--dl-color-bg-elevated);
    text-align: center;
  }
  .drop:focus-within {
    outline: 2px solid var(--dl-color-accent);
    outline-offset: 2px;
  }
  .drop.disabled {
    cursor: progress;
    opacity: 0.7;
  }
  .cloud {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cloud .drop {
    flex: 1;
  }
  .steps {
    margin: 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .dives {
    border: 0;
    margin: 12px 0 0;
    padding: 0;
    min-width: 0;
  }
  .dives legend {
    padding: 0;
    font-weight: 600;
  }
  .dive-list {
    list-style: none;
    margin: 6px 0 10px;
    padding: 0;
  }
  .dive-list li + li {
    border-top: 1px solid var(--dl-color-border);
  }
  :global(.divelog) .dive-row {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
    font-size: var(--dl-text-md);
    color: var(--dl-color-text);
  }
  .dive-row input {
    margin-top: 3px;
    flex: none;
  }
  .dive-row.joined {
    padding-left: calc(1em + 10px);
  }
  .dive-item :global(.belongs) {
    margin: 0 0 10px calc(1em + 10px);
    max-width: 32rem;
  }
  .dive-item :global(.belongs select) {
    width: 100%;
  }
  .split {
    border: 0;
    margin: 0 0 10px calc(1em + 10px);
    padding: 0;
    min-width: 0;
    max-width: 32rem;
  }
  .split legend {
    padding: 0;
    margin-bottom: 4px;
    font-size: var(--dl-text-sm);
    font-weight: 600;
    color: var(--dl-color-text-muted);
  }
  :global(.divelog) .split-break {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    font-size: var(--dl-text-md);
    color: var(--dl-color-text);
    font-variant-numeric: tabular-nums;
  }
  .split-break input {
    flex: none;
  }
  .parts {
    list-style: none;
    margin: 0 0 10px calc(1em + 10px);
    padding: 0 0 0 12px;
    border-left: 2px solid var(--dl-color-accent);
    max-width: 32rem;
    font-size: var(--dl-text-md);
  }
  .parts .part + .part {
    border-top: 1px solid var(--dl-color-border);
  }
  .summary .parts.pending {
    padding: 8px 0 8px 12px;
    margin: 0 0 10px calc(1em + 10px);
    color: var(--dl-color-text-muted);
  }
  .part .dive-text {
    padding: 8px 0 6px;
  }
  .part .dive-text strong {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .part :global(.belongs) {
    margin: 0 0 8px;
    max-width: none;
  }
  .part :global(.belongs select) {
    width: 100%;
  }
  .summary :global(.older) {
    margin: 4px 0 10px;
  }
  .dive-text {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    min-width: 0;
  }
  .dive-text strong {
    flex-basis: 100%;
  }
  .outcome {
    color: var(--dl-color-text-muted);
  }
  .outcome.new {
    color: var(--dl-color-warm);
  }
  .outcome.error {
    color: var(--dl-color-danger);
  }
  .empty {
    margin: 12px 0 0;
  }
  .summary :global(.offset) {
    max-width: 20rem;
    margin-top: 12px;
  }
  @media (pointer: coarse) {
    :global(.divelog) .dive-row,
    :global(.divelog) .split-break {
      min-height: var(--dl-tap-min);
    }
  }
  .status {
    min-height: 1.4em;
    margin: 0 0 8px;
    color: var(--dl-color-text-muted);
  }
  .summary {
    padding: 16px;
    margin-bottom: 28px;
  }
  .summary h2 {
    margin-top: 0;
  }
  .summary p {
    margin: 0 0 6px;
  }
  .lines {
    margin: 0 0 10px;
    padding-left: 1.2em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .table-wrap {
    position: relative;
    overflow-x: auto;
  }
  .when span,
  .download {
    white-space: nowrap;
  }
  .file {
    overflow-wrap: anywhere;
  }
  .count-label {
    display: none;
  }
  @media (max-width: 479.98px) {
    .table-wrap :is(table, tbody, tr, td) {
      display: block;
    }
    .table-wrap thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .table-wrap tbody tr {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--dl-space-1) var(--dl-space-2);
      padding: var(--dl-space-2) 0;
      border-bottom: 1px solid var(--dl-color-border);
    }
    .table-wrap tbody td {
      padding: 0;
      border: none;
      font-size: var(--dl-text-md);
      color: var(--dl-color-text-muted);
    }
    .table-wrap td.file {
      order: -1;
      flex-basis: 100%;
      font-size: var(--dl-text-base);
      color: var(--dl-color-text);
    }
    .table-wrap td.count {
      font-family: inherit;
    }
    .count-label {
      display: inline;
    }
    .updated::before {
      content: '· ';
    }
  }
  h2 {
    font-size: var(--dl-text-xl);
  }
</style>
