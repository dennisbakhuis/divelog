<script lang="ts">
  import MapGlyph from './MapGlyph.svelte';
  import { legendFor, legendKey, type SiteMap } from '$lib/core/dive/sitemap';

  let { map }: { map: SiteMap } = $props();
  const entries = $derived(legendFor(map));
</script>

{#if entries.length}
  <ul class="legend">
    {#each entries as entry (legendKey(entry))}
      <li>
        <svg class="sym" viewBox="-12 -12 24 24" aria-hidden="true">
          {#if entry.kind === 'node'}
            <g transform="scale(0.8)"><MapGlyph type={entry.type} /></g>
          {:else if entry.kind === 'object'}
            <g transform="scale(0.8)"><MapGlyph type="object" objectKind={entry.object} /></g>
          {:else if entry.kind === 'edge'}
            <line class="edge {entry.style}" x1="-11" y1="0" x2="11" y2="0" />
          {:else if entry.kind === 'line'}
            <path class="line {entry.line}" d="M-11 4 Q-4 -6 2 0 T11 -3" />
          {:else if entry.kind === 'text'}
            <text class="text" class:depth={entry.text.startsWith('↓')} y="4" text-anchor="middle"
              >{entry.text}</text
            >
          {:else}
            <rect class="area {entry.area}" x="-9" y="-7" width="18" height="14" rx="2" />
          {/if}
        </svg>
        {entry.label}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .legend {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--dl-color-text-muted);
  }
  .sym {
    --map-bg: var(--dl-color-bg);
    width: 22px;
    height: 22px;
    overflow: visible;
    color: var(--dl-color-text);
  }
  .edge {
    stroke: currentColor;
    stroke-width: 2px;
  }
  .edge.jump {
    stroke-dasharray: 5 4;
  }
  .edge.unsurveyed {
    stroke-dasharray: 2 3;
    opacity: 0.6;
  }
  .edge.route {
    stroke: var(--dl-color-accent);
    stroke-dasharray: 6 4;
  }
  .line {
    fill: none;
    stroke: currentColor;
    stroke-width: 2px;
    stroke-linecap: round;
  }
  .text {
    fill: var(--dl-color-text-muted);
    font-family: var(--dl-font-mono);
    font-size: 10px;
  }
  .text.depth {
    fill: var(--dl-color-accent);
  }
  .line.shoreline {
    stroke: #d8c9a3;
    stroke-width: 3px;
  }
  .line.depth {
    stroke: color-mix(in srgb, var(--dl-color-accent) 70%, var(--dl-color-text));
    stroke-width: 1.5px;
  }
  .line.path {
    stroke: var(--dl-color-warm);
    stroke-dasharray: 5 3;
  }
  .line.wall {
    stroke: var(--dl-color-warm);
    stroke-dasharray: 6 2 1 2;
  }
  .line.pipe {
    stroke-width: 3px;
    opacity: 0.6;
  }
  .area {
    stroke-width: 1.5px;
  }
  .area.outline {
    fill: color-mix(in srgb, currentColor 5%, transparent);
    stroke: currentColor;
  }
  .area.depth {
    fill: hsl(203 48% 42% / 0.5);
    stroke: color-mix(in srgb, var(--dl-color-accent) 40%, transparent);
  }
  .area.coral {
    fill: color-mix(in srgb, #2f8f6f 42%, transparent);
    stroke: color-mix(in srgb, #2f8f6f 75%, transparent);
  }
  .area.sand {
    fill: color-mix(in srgb, #d8c9a3 20%, transparent);
    stroke: color-mix(in srgb, #d8c9a3 40%, transparent);
  }
  .area.shallows {
    fill: color-mix(in srgb, var(--dl-color-accent) 14%, transparent);
    stroke: color-mix(in srgb, var(--dl-color-accent) 50%, transparent);
  }
  .area.wall {
    fill: color-mix(in srgb, var(--dl-color-warm) 10%, transparent);
    stroke: var(--dl-color-warm);
    stroke-dasharray: 4 2;
  }
  .area.wreck {
    fill: color-mix(in srgb, currentColor 28%, transparent);
    stroke: currentColor;
  }
  .area.reeds {
    fill: color-mix(in srgb, var(--dl-color-success) 18%, transparent);
    stroke: color-mix(in srgb, var(--dl-color-success) 60%, transparent);
  }
  .area.other {
    fill: color-mix(in srgb, currentColor 8%, transparent);
    stroke: color-mix(in srgb, currentColor 40%, transparent);
  }
</style>
