<script lang="ts">
  import type { MapSite } from '$lib/core/dive/types';
  import {
    colourScale,
    dotColour,
    dotMeasureMax,
    dotRadiusBy,
    SIZE_MODES,
    type ColourMode,
    type MapOptionsPatch,
    type SizeMode,
  } from '$lib/core/dive/stats-view';
  import { flagEmoji, formatMinutes } from '$lib/core/dive/format';
  import MapKey from './MapKey.svelte';
  import MapOptions from './MapOptions.svelte';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  type Dot = MapSite & { point: { x: number; y: number } };
  type MapData = {
    landPath: string;
    spherePath: string;
    width: number;
    height: number;
    dots: Dot[];
  };

  let {
    map,
    activeSite = '',
    size = 'dives',
    colour = 'type',
    highlight = null,
    compact = false,
    label = '',
    onSelect,
    onOptions,
  }: {
    map: MapData;
    activeSite?: string;
    size?: SizeMode;
    colour?: ColourMode;
    /** Slugs of the sites the current filters keep; the rest fade. Null shows every site in full. */
    highlight?: Set<string> | null;
    /** No option strip: the small map on a person or site page, or the globe's fallback. */
    compact?: boolean;
    /** Accessible title; defaults to a description of the world map. */
    label?: string;
    onSelect?: (slug: string) => void;
    onOptions?: (patch: MapOptionsPatch) => void;
  } = $props();

  const max = $derived(dotMeasureMax(map.dots, size));
  const scale = $derived(colourScale(map.dots, colour));
  let hovered = $state<Dot | null>(null);

  function pick(dot: Dot) {
    onSelect?.(activeSite === dot.slug ? '' : dot.slug);
  }
</script>

{#snippet sizeHint()}
  dot size = {SIZE_MODES.find((m) => m.mode === size)?.label} · click to filter
{/snippet}

<div class="map dl-card" class:compact>
  <svg viewBox="0 0 {map.width} {map.height}" role="img" aria-labelledby="map-title" class="world">
    <title id="map-title">{label || `World map with ${map.dots.length} dive sites`}</title>
    <path d={map.spherePath} class="sphere" />
    <path d={map.landPath} class="land" />
    {#each map.dots as dot (dot.slug)}
      {@const r = dotRadiusBy(dot, size, max)}
      {@const fill = dotColour(dot, colour, scale)}
      <g
        class="site"
        class:active={activeSite === dot.slug}
        class:dimmed={(activeSite && activeSite !== dot.slug) ||
          (highlight !== null && !highlight.has(dot.slug))}
        transform="translate({dot.point.x} {dot.point.y})"
        role="button"
        tabindex="0"
        aria-label="{dot.name}, {dot.dives} dives"
        onmouseenter={() => (hovered = dot)}
        onmouseleave={() => (hovered = null)}
        onfocus={() => (hovered = dot)}
        onblur={() => (hovered = null)}
        onclick={() => pick(dot)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick(dot);
          }
        }}
      >
        <circle class="halo" r={r * 2.2} style="fill: {fill}" />
        <circle class="dot" {r} style="fill: {fill}" />
      </g>
    {/each}
  </svg>

  <MapKey {colour} {scale} hint={compact ? undefined : sizeHint} />

  {#if !compact && onOptions}
    <MapOptions {size} {colour} {onOptions} />
  {/if}

  <div class="tooltip" class:visible={hovered} aria-live="polite">
    {#if hovered}
      <strong>{flagEmoji(hovered.country_code)} {hovered.name}</strong>
      <span class="dl-num"
        >{hovered.dives}
        {hovered.dives === 1 ? 'dive' : 'dives'} · {formatMinutes(hovered.minutes)} · max {hovered.max_depth_m}
        m</span
      >
      <span class="dl-num faint"
        >{hovered.first_year === hovered.last_year
          ? hovered.last_year
          : `${hovered.first_year}–${hovered.last_year}`} · {hovered.site_type}</span
      >
    {/if}
  </div>
  <ul class="dl-visually-hidden">
    {#each map.dots as dot (dot.slug)}
      <li><a href={urls.site(dot.slug)}>{dot.name}: {dot.dives} dives</a></li>
    {/each}
  </ul>
</div>

<style>
  .map {
    position: relative;
    padding: 12px;
    overflow: hidden;
    background: var(--dl-color-bg-elevated);
  }
  .world {
    width: 100%;
    height: auto;
    display: block;
  }
  .sphere {
    fill: color-mix(in srgb, var(--dl-color-accent) 4%, transparent);
    stroke: var(--dl-color-border);
  }
  .land {
    fill: var(--dl-color-surface-2);
    stroke: color-mix(in srgb, var(--dl-color-text) 14%, transparent);
    stroke-width: 0.5;
  }
  .site {
    cursor: pointer;
    outline: none;
  }
  .halo {
    opacity: 0.18;
    transition: opacity 0.2s ease;
  }
  .dot {
    stroke: var(--dl-color-bg);
    stroke-width: 1.2;
    transition: transform 0.2s ease;
  }
  .site:hover .halo,
  .site:focus-visible .halo,
  .site.active .halo {
    opacity: 0.4;
  }
  .site.dimmed {
    opacity: 0.25;
  }
  .site.active .dot {
    stroke: var(--dl-color-warm);
    stroke-width: 2;
  }
  .tooltip {
    position: absolute;
    top: 16px;
    left: 16px;
    padding: 8px 12px;
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-strong);
    box-shadow: var(--dl-shadow-sm);
    font-size: 13.5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }
  .tooltip.visible {
    opacity: 1;
  }
  .tooltip .dl-num {
    color: var(--dl-color-text-muted);
    font-size: 12px;
  }
  .tooltip .faint {
    color: var(--dl-color-text-faint);
  }
  .compact {
    padding: 8px;
  }
</style>
