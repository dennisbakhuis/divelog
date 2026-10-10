<script lang="ts">
  import type { AdminDataFor } from '../admin';
  import { goto } from '$app/navigation';
  import type { PersonPrivate } from '$lib/core/dive/types';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: AdminDataFor<'people'> } = $props();
  let query = $state('');

  const rows = $derived(
    data.people.filter((p) => {
      const q = query.toLowerCase();
      return (
        !q ||
        `${p.first_name} ${p.last_name ?? ''} ${p.alias ?? ''} ${p.aliases.join(' ')} ${p.email ?? ''}`
          .toLowerCase()
          .includes(q)
      );
    }),
  );

  function label(p: PersonPrivate): string {
    return p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
  }
</script>

<div class="head">
  <h1>People <span class="count dl-num">{data.people.length}</span></h1>
  <button
    type="button"
    class="dl-btn dl-btn-solid dl-btn-sm"
    onclick={() => goto(urls.admin.newPerson())}>+ New person</button
  >
</div>
<p class="muted">
  The public site shows the alias when there is one, otherwise the first name. Surname, e-mail and
  notes are only ever shown to you.
</p>

<div class="toolbar">
  <input type="search" placeholder="Filter…" bind:value={query} />
</div>

<table>
  <thead><tr><th></th><th>Name</th><th>Public</th><th>Dives</th><th></th></tr></thead>
  <tbody>
    {#each rows as p (p.id)}
      <tr>
        <td>
          <span class="avatar small">
            {#if p.avatar_url}<img src={p.avatar_url} alt="" />{:else}{p.first_name[0]}{/if}
          </span>
        </td>
        <td
          ><a href={urls.admin.person(p.id)}>{label(p)}</a>
          <span class="muted dl-num">{p.id}</span></td
        >
        <td>{p.display === 'hidden' ? '— hidden —' : p.name}</td>
        <td class="dl-num">{p.dives}</td>
        <td class="row-actions">
          <a
            class="dl-btn dl-btn-ghost dl-btn-sm"
            href={urls.person(p.slug)}
            target="_blank"
            rel="noopener">view ↗</a
          >
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
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
  }
  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--dl-color-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--dl-font-display);
    font-weight: 600;
    color: var(--dl-color-accent);
    overflow: hidden;
    flex: none;
  }
  .avatar.small {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
</style>
