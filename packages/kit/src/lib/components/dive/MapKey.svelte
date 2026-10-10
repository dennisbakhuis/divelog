<script lang="ts">
  import type { Snippet } from 'svelte';
  import { TYPE_LEGEND, type ColourMode, type ColourScale } from '$lib/core/dive/stats-view';

  let {
    colour,
    scale,
    hint,
  }: {
    colour: ColourMode;
    scale: ColourScale;
    /** Trailing note, right-aligned: what the dot size means and how to interact. */
    hint?: Snippet;
  } = $props();
</script>

<div class="legend">
  {#if colour === 'type'}
    {#each TYPE_LEGEND as entry (entry.label)}
      <span><i style="background: {entry.colour}"></i> {entry.label}</span>
    {/each}
  {:else}
    <span class="ramp" class:depth={colour === 'depth'}>
      <em class="dl-num">{colour === 'year' ? scale.min : '0 m'}</em>
      <i></i>
      <em class="dl-num">{colour === 'year' ? scale.max : `${Math.round(scale.max)} m`}</em>
    </span>
  {/if}
  {#if hint}
    <span class="hint">{@render hint()}</span>
  {/if}
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 10px 8px 4px;
    font-size: 12.5px;
    color: var(--dl-color-text-muted);
    font-family: var(--dl-font-mono);
    align-items: center;
  }
  .legend i {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .ramp {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .ramp i {
    width: 120px;
    height: 8px;
    border-radius: 4px;
    margin: 0;
    background: linear-gradient(90deg, hsl(200 25% 40%), hsl(200 85% 65%));
  }
  .ramp.depth i {
    background: linear-gradient(90deg, hsl(196 78% 68%), hsl(136 78% 32%));
  }
  .ramp em {
    font-style: normal;
  }
  .hint {
    margin-left: auto;
    color: var(--dl-color-text-faint);
  }
</style>
