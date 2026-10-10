<script lang="ts">
  import type { DiveFilter, SortKey } from '$lib/core/dive/filter';

  let {
    filter,
    onChange,
    years = [],
    onJump,
  }: {
    filter: DiveFilter;
    onChange: (next: DiveFilter) => void;
    /** Years present in the current result, for "jump to year". */
    years?: number[];
    onJump?: (year: number) => void;
  } = $props();

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'depth', label: 'Depth' },
    { key: 'duration', label: 'Duration' },
    { key: 'number', label: 'Number' },
  ];
</script>

<div class="sort-group">
  <label class="sort">
    Sort
    <select
      class="dl-select"
      value={filter.sort}
      onchange={(e) => onChange({ ...filter, sort: e.currentTarget.value as SortKey })}
    >
      {#each sortOptions as o (o.key)}
        <option value={o.key}>{o.label}</option>
      {/each}
    </select>
  </label>
  <button
    type="button"
    class="dl-btn dl-btn-ghost dl-btn-sm"
    onclick={() => onChange({ ...filter, desc: !filter.desc })}
    aria-label="Toggle sort direction"
  >
    {filter.desc ? '↓' : '↑'}
  </button>
  {#if onJump && years.length > 1}
    <label class="sort">
      <span class="dl-visually-hidden">Jump to year</span>
      <select
        class="dl-select"
        value=""
        onchange={(e) => {
          const year = Number(e.currentTarget.value);
          e.currentTarget.value = '';
          if (year) onJump?.(year);
        }}
      >
        <option value="">Jump to year</option>
        {#each years as y (y)}
          <option value={String(y)}>{y}</option>
        {/each}
      </select>
    </label>
  {/if}
</div>

<style>
  .sort-group {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  select {
    font: inherit;
    font-size: 14.5px;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-control);
    border-radius: var(--dl-radius-sm);
    padding: 6px 10px;
  }
  @media (max-width: 480px) {
    .sort-group {
      flex: 1 1 100%;
    }
    .sort-group .sort {
      flex: 1 1 0;
    }
    .sort-group select {
      flex: 1 1 auto;
    }
  }
</style>
