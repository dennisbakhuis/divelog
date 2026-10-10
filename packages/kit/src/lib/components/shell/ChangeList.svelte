<script lang="ts">
  import type { ChangeEntry } from '$lib/core/dive/types';
  import { formatDate } from '$lib/core/dive/format';

  let {
    entries,
    empty = 'No changes recorded yet.',
  }: {
    /** Changelog entries, newest first. */
    entries: ChangeEntry[];
    /** Text shown when there are no entries. */
    empty?: string;
  } = $props();
</script>

{#if entries.length}
  <ol class="dl-changelog">
    {#each entries as entry (entry.revision)}
      <li>
        <span class="dl-num">r{entry.revision}</span>
        <span class="dl-num dl-changelog-faint">{formatDate(entry.date)}</span>
        {entry.note}
        {#if entry.author}<span class="dl-changelog-faint">· {entry.author}</span>{/if}
      </li>
    {/each}
  </ol>
{:else}
  <p class="dl-changelog-empty">{empty}</p>
{/if}

<style>
  .dl-changelog {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: 13.5px;
  }
  .dl-changelog-faint,
  .dl-changelog-empty {
    color: var(--dl-color-text-faint);
  }
  .dl-changelog-empty {
    margin: 0;
    font-size: 14px;
  }
</style>
