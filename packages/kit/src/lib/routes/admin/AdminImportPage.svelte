<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { invalidateAll } from '$app/navigation';
  import { adminUpload, AdminApiError } from '$lib/core/admin/client';
  import { getDivelog } from '$lib/core/dive/context';
  import type { ImportResult } from '$lib/core/dive/types';
  import ImportSites from '$lib/components/admin/ImportSites.svelte';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'import'> } = $props();
  let busy = $state(false);
  let result = $state<ImportResult | null>(null);
  let error = $state('');

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    busy = true;
    error = '';
    result = null;
    try {
      result = await adminUpload<ImportResult>('/admin/import/subsurface', files[0]);
      await invalidateAll();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Import failed';
    } finally {
      busy = false;
    }
  }

  async function uploadPerdix(files: FileList | null) {
    if (!files?.length) return;
    busy = true;
    error = '';
    result = null;
    const form = new FormData();
    for (const file of Array.from(files)) form.append('files', file, file.name);
    try {
      const response = await fetch(urls.api('/admin/import/shearwater'), {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new AdminApiError(response.status, body.detail ?? response.statusText);
      }
      result = (await response.json()) as ImportResult;
      await invalidateAll();
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Import failed';
    } finally {
      busy = false;
    }
  }
</script>

<h1>Import from a dive computer</h1>
<p class="muted">
  Drop the XML files Shearwater Cloud exports for the Perdix, one per dive. A file whose start time
  is within ten minutes of a logged dive attaches its profile to that dive; anything else becomes a
  <strong>draft</strong> dive with the numbers filled in, for you to give a site, buddies and a story.
  Subsurface exports work the same way.
</p>

<div class="drops">
  <label class="drop dl-card">
    <input
      type="file"
      multiple
      accept=".xml,application/xml,text/xml"
      onchange={(e) => uploadPerdix(e.currentTarget.files)}
      disabled={busy}
    />
    <strong>Shearwater Perdix</strong>
    <span>{busy ? 'Importing…' : 'Choose one or more Perdix .xml files'}</span>
  </label>
  <label class="drop dl-card">
    <input
      type="file"
      accept=".xml,.ssrf,application/xml,text/xml"
      onchange={(e) => upload(e.currentTarget.files)}
      disabled={busy}
    />
    <strong>Subsurface</strong>
    <span>{busy ? 'Importing…' : 'Choose a Subsurface .xml / .ssrf file'}</span>
  </label>
</div>

{#if error}<p class="error">{error}</p>{/if}
{#if result}
  <div class="dl-card summary">
    <p>
      <strong>{result.created.length}</strong> drafts created{result.created.length
        ? `: #${result.created.join(', #')}`
        : ''}
    </p>
    <p>
      <strong>{result.updated.length}</strong> existing dives got a profile{result.updated.length
        ? `: #${result.updated.join(', #')}`
        : ''}
    </p>
    <p>
      <strong>{result.skipped}</strong> skipped (already imported) ·
      <strong>{result.sites_created}</strong> sites created ·
      <strong>{result.sites_matched ?? 0}</strong> matched to existing sites
    </p>
    <ImportSites sites={result.sites ?? []} />
    <a class="dl-btn dl-btn-solid dl-btn-sm" href={urls.admin.root()}>Review drafts</a>
  </div>
{/if}

{#if data.imports.length}
  <h2>Previous imports</h2>
  <table>
    <thead><tr><th>When</th><th>File</th><th>Created</th><th>Updated</th><th></th></tr></thead>
    <tbody>
      {#each data.imports as row (row.id)}
        <tr>
          <td class="dl-num">{row.created_at.slice(0, 16).replace('T', ' ')}</td>
          <td>{row.original_name}</td>
          <td class="dl-num">{row.created.length}</td>
          <td class="dl-num">{row.updated.length}</td>
          <td><a href={row.url}>download</a></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .muted {
    color: var(--dl-color-text-muted);
    max-width: 64ch;
  }
  .drops {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    margin: 20px 0;
  }
  .drop {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    justify-content: center;
    padding: 36px;
    border-style: dashed;
    cursor: pointer;
    background: var(--dl-color-bg-elevated);
  }
  .drop input {
    display: none;
  }
  .summary {
    padding: 16px;
    margin-bottom: 28px;
  }
  .summary p {
    margin: 0 0 6px;
  }
  h2 {
    font-size: 18px;
  }
</style>
