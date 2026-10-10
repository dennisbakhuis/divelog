<script lang="ts">
  import type { PublicDataFor } from '../public';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { flagEmoji, formatHours, pluralize } from '$lib/core/dive/format';
  import {
    countryFacet,
    countryLabel,
    filterByCountry,
    isPeopleSort,
    PEOPLE_SORTS,
    sortPeople,
    type PeopleSort,
  } from '$lib/core/dive/people';
  import { reveal } from '$lib/components/anim/reveal';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let { data }: { data: PublicDataFor<'people'> } = $props();

  const initialSort = page.url.searchParams.get('sort');
  let sort = $state<PeopleSort>(isPeopleSort(initialSort) ? initialSort : 'dives');
  let country = $state(page.url.searchParams.get('country') ?? '');

  const countries = $derived(countryFacet(data.people));
  const shown = $derived(sortPeople(filterByCountry(data.people, country || null), sort));

  function sync() {
    const url = new URL(page.url);
    if (sort === 'dives') url.searchParams.delete('sort');
    else url.searchParams.set('sort', sort);
    if (country) url.searchParams.set('country', country);
    else url.searchParams.delete('country');
    replaceState(url, {});
  }

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
</script>

<section class="page dl-container">
  <p class="dl-kicker">Dive buddies</p>
  <h1>{data.people.length} people, <span class="accent">one log</span></h1>
  <p class="lede">
    Nobody dives alone. Everyone here has been on the other end of a buddy check at least once;
    first names only, unless someone prefers a nickname.
  </p>

  <div class="toolbar">
    <div class="sorts" role="group" aria-label="Sort people">
      {#each PEOPLE_SORTS as option (option.mode)}
        <button
          type="button"
          class:active={sort === option.mode}
          aria-pressed={sort === option.mode}
          onclick={() => {
            sort = option.mode;
            sync();
          }}>{option.label}</button
        >
      {/each}
    </div>
    <select
      bind:value={country}
      onchange={sync}
      aria-label="Dived with me in"
      class:active={country !== ''}
    >
      <option value="">All countries</option>
      {#each countries as c (c.code)}
        <option value={c.code}>{flagEmoji(c.code)} {countryLabel(c.code)} ({c.people})</option>
      {/each}
    </select>
    <span class="count dl-num"
      >{pluralize(shown.length, 'person', 'people')}{country
        ? ` in ${countryLabel(country)}`
        : ''}</span
    >
  </div>

  <ul class="people" use:reveal={{ stagger: 25 }}>
    {#each shown as person (person.slug)}
      <li data-reveal>
        <a class="person dl-card" href={urls.person(person.slug)}>
          <span class="avatar" class:has-image={person.avatar_url}>
            {#if person.avatar_url}
              <img src={person.avatar_url} alt="" width="56" height="56" loading="lazy" />
            {:else}
              {initials(person.name)}
            {/if}
          </span>
          <span class="body">
            <span class="name">{person.name}</span>
            <span class="meta dl-num">
              {pluralize(person.stats.dives, 'dive')} · {formatHours(person.stats.minutes)}
            </span>
            <span class="meta faint dl-num">
              {#if person.stats.first_dive}
                {@const first = person.stats.first_dive.slice(0, 4)}
                {@const last = person.stats.last_dive?.slice(0, 4)}
                {sort === 'recent' && last && last !== first
                  ? `${first}–${last}`
                  : `since ${first}`}
              {/if}
            </span>
            <span class="meta faint dl-num">
              {pluralize(person.stats.countries, 'country', 'countries')}
            </span>
          </span>
        </a>
      </li>
    {/each}
  </ul>
</section>

<style>
  .page {
    padding-top: 56px;
    padding-bottom: var(--dl-space-section);
  }
  h1 {
    font-size: clamp(34px, 5vw, 52px);
  }
  .accent {
    color: var(--dl-color-accent);
  }
  .lede {
    color: var(--dl-color-text-muted);
    font-size: 1.1rem;
    max-width: 56ch;
    margin-bottom: 36px;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 24px;
  }
  .sorts {
    display: inline-flex;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius-sm);
    overflow: hidden;
  }
  .sorts button {
    font: inherit;
    font-size: 14px;
    padding: 8px 12px;
    background: var(--dl-color-surface);
    color: var(--dl-color-text-muted);
    border: none;
    cursor: pointer;
  }
  .sorts button + button {
    border-left: 1px solid var(--dl-color-border-strong);
  }
  .sorts button.active {
    background: color-mix(in srgb, var(--dl-color-accent) 14%, var(--dl-color-surface));
    color: var(--dl-color-text);
  }
  .toolbar select {
    font: inherit;
    font-size: 14px;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius-sm);
    padding: 8px 12px;
  }
  .toolbar select.active {
    border-color: var(--dl-color-accent);
  }
  .count {
    margin-left: auto;
    color: var(--dl-color-text-faint);
    font-size: 13px;
  }
  .people {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
  .people > li {
    display: flex;
  }
  .person {
    flex: 1;
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: 14px;
    align-items: center;
    padding: 14px;
    text-decoration: none;
    color: inherit;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease;
  }
  .person:hover {
    transform: translateY(-2px);
    border-color: var(--dl-color-accent);
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
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-family: var(--dl-font-display);
    font-size: 17px;
    font-weight: 600;
  }
  .meta {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--dl-color-text-muted);
  }
  .faint {
    color: var(--dl-color-text-faint);
  }
</style>
