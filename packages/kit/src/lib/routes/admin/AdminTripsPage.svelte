<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto } from '$app/navigation';
  import { formatDate } from '$lib/core/dive/format';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'trips'> } = $props();
  let query = $state('');

  const rows = $derived(
    data.trips.filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase())),
  );
</script>

<div class="head">
  <h1>Trips <span class="count dl-num">{data.trips.length}</span></h1>
  <button
    type="button"
    class="dl-btn dl-btn-solid dl-btn-sm"
    onclick={() => goto(urls.admin.newTrip())}>+ New trip</button
  >
</div>
<p class="muted">
  Derived trips are built automatically from runs of dives abroad. An override (marked “custom”)
  gives one a name, dates or a description; removing the override lets the derived trip show again.
</p>

<div class="toolbar">
  <input type="search" placeholder="Filter…" aria-label="Filter trips" bind:value={query} />
</div>

<div class="table-wrap">
  <table>
    <caption class="dl-visually-hidden">Trips</caption>
    <thead
      ><tr
        ><th scope="col">Name</th><th scope="col">Dates</th><th scope="col">Kind</th><th scope="col"
          ><span class="dl-visually-hidden">Public page</span></th
        ></tr
      ></thead
    >
    <tbody>
      {#each rows as t (t.slug)}
        <tr>
          <td><a href={urls.admin.trip(t.slug)}>{t.name}</a></td>
          <td class="dl-num">{formatDate(t.start_date)} – {formatDate(t.end_date)}</td>
          <td
            >{#if t.custom}<span class="badge">custom</span>{/if}</td
          >
          <td class="row-actions">
            <a
              class="dl-btn dl-btn-ghost dl-btn-sm"
              href={urls.trip(t.slug)}
              target="_blank"
              rel="noopener">view<span class="dl-visually-hidden"> {t.name} (new tab)</span> ↗</a
            >
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrap {
    overflow-x: auto;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .count {
    font-size: 16px;
    color: var(--dl-color-text-faint);
    font-weight: 400;
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 13.5px;
    max-width: 68ch;
  }
  .toolbar {
    margin: 16px 0 12px;
  }
  .toolbar input {
    max-width: 320px;
  }
  .row-actions {
    text-align: right;
  }
  .badge {
    font-family: var(--dl-font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--dl-color-accent-soft);
    color: var(--dl-color-accent);
  }
</style>
