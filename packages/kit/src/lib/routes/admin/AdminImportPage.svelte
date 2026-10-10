<script lang="ts">
  import { tick } from 'svelte';
  import type { AdminDataFor } from '../admin';
  import { invalidateAll } from '$app/navigation';
  import { adminUpload, adminUploadMany, AdminApiError } from '$lib/core/admin/client';
  import { importLines } from '$lib/core/admin/dive-list';
  import { getDivelog } from '$lib/core/dive/context';
  import type { ImportResult } from '$lib/core/dive/types';
  import { announce } from '$lib/core/ui/announce.js';
  import ImportSites from '$lib/components/admin/ImportSites.svelte';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'import'> } = $props();

  type Format = 'shearwater' | 'subsurface';
  const LABELS: Record<Format, string> = {
    shearwater: 'Shearwater Perdix',
    subsurface: 'Subsurface',
  };

  let busy = $state(false);
  let pending = $state<{ format: Format; files: File[] } | null>(null);
  let preview = $state<ImportResult | null>(null);
  let result = $state<ImportResult | null>(null);
  let error = $state('');
  let outcome = $state<HTMLElement>();

  function send(format: Format, files: File[], dryRun: boolean): Promise<ImportResult> {
    const fields: Record<string, string> = dryRun ? { dry_run: 'true' } : {};
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
    busy = true;
    try {
      preview = await send(format, files, true);
      announce(`Preview ready: ${importLines(preview).join('; ')}`);
      await tick();
      outcome?.focus();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Could not read the file';
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
      announce(`Imported: ${importLines(result).join('; ')}`);
      await invalidateAll();
      await tick();
      outcome?.focus();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Import failed';
    } finally {
      busy = false;
    }
  }

  function cancel() {
    pending = null;
    preview = null;
    announce('Import cancelled');
  }
</script>

<h1>Import from a dive computer</h1>
<p class="muted">
  Drop the XML files Shearwater Cloud exports for the Perdix, one per dive. A file whose start time
  is within ten minutes of a logged dive attaches its profile to that dive; anything else becomes a
  <strong>draft</strong> dive with the numbers filled in, for you to give a site, buddies and a story.
  Subsurface exports work the same way. You see what would happen before anything is written.
</p>

<div class="drops">
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

<p class="status" role="status">{busy ? (preview ? 'Importing…' : 'Reading the file…') : ''}</p>
{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if preview && pending}
  <section
    class="dl-card summary preview"
    aria-labelledby="dl-import-preview"
    tabindex="-1"
    bind:this={outcome}
  >
    <h2 id="dl-import-preview">
      Preview: {LABELS[pending.format]}, {pending.files.length} file{pending.files.length === 1
        ? ''
        : 's'}
    </h2>
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
    <ImportSites sites={preview.sites ?? []} />
    <div class="actions">
      <button
        type="button"
        class="dl-btn dl-btn-solid dl-btn-sm"
        disabled={busy || (!preview.created.length && !preview.updated.length)}
        onclick={commit}>Import</button
      >
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" disabled={busy} onclick={cancel}
        >Cancel</button
      >
    </div>
  </section>
{/if}

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
            <td class="dl-num">{row.created_at.slice(0, 16).replace('T', ' ')}</td>
            <td>{row.original_name}</td>
            <td class="dl-num">{row.created.length}</td>
            <td class="dl-num">{row.updated.length}</td>
            <td
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
    overflow-x: auto;
  }
  h2 {
    font-size: var(--dl-text-xl);
  }
</style>
