<script lang="ts">
  import type { DiveEnvelope } from '$lib/core/dive/types';
  import {
    clearFilter,
    gasOptions,
    hitsOf,
    isFilterActive,
    toggleTag,
    type DiveFilter,
  } from '$lib/core/dive/filter';
  import { flagEmoji, formatDate } from '$lib/core/dive/format';
  import {
    DEPTH_BUCKETS,
    DURATION_BUCKETS,
    parseRange,
    rangeLabel,
    rangeValue,
    type Bucket,
  } from '$lib/core/dive/list-view';

  let {
    envelope,
    filter,
    onChange,
  }: {
    envelope: DiveEnvelope;
    filter: DiveFilter;
    onChange: (next: DiveFilter) => void;
  } = $props();

  let q = $derived(filter.q);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onSearch(value: string) {
    q = value;
    clearTimeout(timer);
    timer = setTimeout(() => onChange({ ...filter, q: value }), 220);
  }

  function regionLabel(id: string): string {
    return id.replace(/-/g, ' ');
  }

  const buddies = $derived(hitsOf(envelope.dives).people);
  const mixes = $derived(gasOptions(envelope.dives).filter((m) => m.value !== 'Air'));
  const siteName = $derived(
    filter.site
      ? (envelope.dives.find((d) => d.site?.slug === filter.site)?.site?.name ?? filter.site)
      : '',
  );

  const depthRange = $derived({ min: filter.minDepth, max: filter.maxDepth });
  const durationRange = $derived({ min: filter.minDuration, max: filter.maxDuration });

  /** The bucket options, plus the range from a hand-made URL when it matches none of them. */
  function rangeOptions(
    range: { min: number | null; max: number | null },
    buckets: Bucket[],
    unit: string,
  ) {
    const options = buckets.map((b) => ({ value: rangeValue(b), label: b.label }));
    const current = rangeValue(range);
    if (current && !options.some((o) => o.value === current)) {
      options.push({ value: current, label: rangeLabel(range, buckets, unit) });
    }
    return options;
  }

  const active = $derived(isFilterActive(filter));
</script>

<div class="filters">
  <div class="search-row">
    <label class="search">
      <span class="dl-visually-hidden">Search dives</span>
      <input
        class="dl-input"
        type="search"
        placeholder="Search anything: site, buddy, notes, cave line, gas…"
        value={q}
        oninput={(e) => onSearch(e.currentTarget.value)}
      />
    </label>
    {#if active}
      <button type="button" class="clear" onclick={() => onChange(clearFilter(filter))}
        >Clear all ×</button
      >
    {/if}
  </div>

  <div class="fields">
    <label class="field" class:set={!!filter.country}>
      <span>Country</span>
      <select
        class="dl-select"
        value={filter.country}
        onchange={(e) => onChange({ ...filter, country: e.currentTarget.value })}
      >
        <option value="">Any</option>
        {#each envelope.countries as c (c.country_code)}
          <option value={c.country_code}
            >{flagEmoji(c.country_code)} {c.country_name} ({c.dives})</option
          >
        {/each}
      </select>
    </label>
    <label class="field" class:set={!!filter.region}>
      <span>Region</span>
      <select
        value={filter.region}
        class="dl-select names"
        onchange={(e) => onChange({ ...filter, region: e.currentTarget.value })}
      >
        <option value="">Any</option>
        {#each envelope.regions as r (r)}
          <option value={r}>{regionLabel(r)}</option>
        {/each}
      </select>
    </label>
    <label class="field" class:set={!!filter.siteType}>
      <span>Site type</span>
      <select
        value={filter.siteType}
        class="dl-select names"
        onchange={(e) => onChange({ ...filter, siteType: e.currentTarget.value })}
      >
        <option value="">Any</option>
        {#each envelope.site_types as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </label>
    <label class="field" class:set={!!filter.water}>
      <span>Water</span>
      <select
        class="dl-select"
        value={filter.water}
        onchange={(e) => onChange({ ...filter, water: e.currentTarget.value })}
      >
        <option value="">Any</option>
        <option value="salt">Salt</option>
        <option value="fresh">Fresh</option>
        <option value="brackish">Brackish</option>
      </select>
    </label>
    <label class="field" class:set={filter.year !== null}>
      <span>Year</span>
      <select
        class="dl-select"
        value={filter.year === null ? '' : String(filter.year)}
        onchange={(e) =>
          onChange({
            ...filter,
            year: e.currentTarget.value ? Number(e.currentTarget.value) : null,
          })}
      >
        <option value="">Any</option>
        {#each envelope.years as y (y)}
          <option value={String(y)}>{y}</option>
        {/each}
      </select>
    </label>
    <label class="field" class:set={!!filter.person}>
      <span>Buddy</span>
      <select
        class="dl-select"
        value={filter.person}
        onchange={(e) => onChange({ ...filter, person: e.currentTarget.value })}
      >
        <option value="">Any</option>
        {#each buddies as b (b.slug)}
          <option value={b.slug}>{b.name} ({b.count})</option>
        {/each}
        {#if filter.person && !buddies.some((b) => b.slug === filter.person)}
          <option value={filter.person}>{filter.person}</option>
        {/if}
      </select>
    </label>
    <label class="field" class:set={!!filter.gas}>
      <span>Gas</span>
      <select
        class="dl-select"
        value={filter.gas}
        onchange={(e) => onChange({ ...filter, gas: e.currentTarget.value })}
      >
        <option value="">Any</option>
        <option value="air">Air</option>
        <option value="nitrox">Nitrox (any)</option>
        <option value="trimix">Trimix (any)</option>
        {#each mixes as mix (mix.value)}
          <option value={mix.value}>{mix.value} ({mix.count})</option>
        {/each}
      </select>
    </label>
    {#if envelope.gear_setups.length}
      <label class="field" class:set={!!filter.setup}>
        <span>Setup</span>
        <select
          class="dl-select"
          value={filter.setup}
          onchange={(e) => onChange({ ...filter, setup: e.currentTarget.value })}
        >
          <option value="">Any</option>
          {#each envelope.gear_setups as s (s.slug)}
            <option value={s.slug}>{s.name}</option>
          {/each}
        </select>
      </label>
    {/if}
    <label class="field" class:set={filter.minDepth !== null || filter.maxDepth !== null}>
      <span>Depth</span>
      <select
        class="dl-select"
        value={rangeValue(depthRange)}
        onchange={(e) => {
          const range = parseRange(e.currentTarget.value);
          onChange({ ...filter, minDepth: range.min, maxDepth: range.max });
        }}
      >
        <option value="">Any</option>
        {#each rangeOptions(depthRange, DEPTH_BUCKETS, 'm') as o (o.value)}
          <option value={o.value}>{o.label}</option>
        {/each}
      </select>
    </label>
    <label class="field" class:set={filter.minDuration !== null || filter.maxDuration !== null}>
      <span>Bottom time</span>
      <select
        class="dl-select"
        value={rangeValue(durationRange)}
        onchange={(e) => {
          const range = parseRange(e.currentTarget.value);
          onChange({ ...filter, minDuration: range.min, maxDuration: range.max });
        }}
      >
        <option value="">Any</option>
        {#each rangeOptions(durationRange, DURATION_BUCKETS, 'min') as o (o.value)}
          <option value={o.value}>{o.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="chips">
    {#each envelope.tags as tag (tag)}
      <button
        type="button"
        class="dl-tag"
        class:active={filter.tags.includes(tag)}
        data-tag={tag}
        aria-pressed={filter.tags.includes(tag)}
        onclick={() => onChange(toggleTag(filter, tag))}
      >
        {tag}
      </button>
    {/each}
    <span class="divider" aria-hidden="true"></span>
    <button
      type="button"
      class="dl-tag toggle"
      class:active={filter.photos}
      aria-pressed={filter.photos}
      onclick={() => onChange({ ...filter, photos: !filter.photos })}>with photos</button
    >
    <button
      type="button"
      class="dl-tag toggle"
      class:active={filter.profile}
      aria-pressed={filter.profile}
      onclick={() => onChange({ ...filter, profile: !filter.profile })}>with profile</button
    >
    {#if filter.site}
      <button type="button" class="dl-tag pinned" onclick={() => onChange({ ...filter, site: '' })}
        >site: {siteName} ×</button
      >
    {/if}
    {#if filter.section}
      <button
        type="button"
        class="dl-tag pinned"
        onclick={() => onChange({ ...filter, section: '' })}>line: {filter.section} ×</button
      >
    {/if}
    {#if filter.dateFrom !== null || filter.dateTo !== null}
      <button
        type="button"
        class="dl-tag pinned"
        onclick={() => onChange({ ...filter, dateFrom: null, dateTo: null })}
        >{filter.dateFrom ? formatDate(filter.dateFrom) : 'start'} – {filter.dateTo
          ? formatDate(filter.dateTo)
          : 'today'} ×</button
      >
    {/if}
  </div>
</div>

<style>
  .filters {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .search-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .search {
    flex: 1 1 auto;
    min-width: 0;
  }
  input {
    font: inherit;
    font-size: 14.5px;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-control);
    border-radius: var(--dl-radius-sm);
    padding: 9px 12px;
    width: 100%;
  }
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--dl-color-focus-ring);
    outline-offset: 1px;
  }
  .clear {
    flex: none;
    font: inherit;
    font-size: 13px;
    color: var(--dl-color-text);
    background: none;
    border: 1px dashed var(--dl-color-border-strong);
    border-radius: 999px;
    padding: 7px 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .clear:hover {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-accent);
  }

  /* One grid of equal fields, each with a small caption: reads as a form, not a jumble. */
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    gap: 10px 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .field span {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dl-color-text-faint);
  }
  .field.set span {
    color: var(--dl-color-accent);
  }
  select {
    font: inherit;
    font-size: 13.5px;
    width: 100%;
    color: var(--dl-color-text-muted);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-control);
    border-radius: var(--dl-radius-sm);
    padding: 7px 10px;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }
  select:hover {
    border-color: var(--dl-color-text-muted);
  }
  .field.set select {
    color: var(--dl-color-text);
    border-color: var(--dl-color-accent);
  }
  select.names {
    text-transform: capitalize;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .chips .dl-tag {
    cursor: pointer;
  }
  .divider {
    width: 1px;
    height: 18px;
    background: var(--dl-color-border-strong);
    margin: 0 4px;
  }
  .dl-tag.toggle::before {
    display: none;
  }
  .dl-tag.active {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-accent);
  }
  .dl-tag.pinned {
    border-color: var(--dl-color-warm);
    color: var(--dl-color-warm);
  }
  .dl-tag.pinned::before {
    display: none;
  }
  @media (max-width: 480px) {
    .fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
