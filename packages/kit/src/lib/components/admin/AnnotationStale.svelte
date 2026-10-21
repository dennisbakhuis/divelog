<script lang="ts">
  import type { DiveMapAnnotation, MapEdgeRef, SiteMapOut } from '$lib/core/dive/sitemap';
  import {
    annotationHealth,
    legLabel,
    repinAnnotation,
    staleMessage,
  } from '$lib/core/dive/sharing';

  let {
    annotation,
    maps,
    busy = false,
    onRepin,
  }: {
    annotation: DiveMapAnnotation | null;
    /** The site's drawn maps; the annotation's map among them. */
    maps: SiteMapOut[];
    busy?: boolean;
    /** Called with the annotation pinned to the current map and the legs it dropped. */
    onRepin: (annotation: DiveMapAnnotation, dropped: MapEdgeRef[]) => void | Promise<void>;
  } = $props();

  const map = $derived(annotation ? maps.find((m) => m.id === annotation.map_id) : undefined);
  const health = $derived(annotation && map ? annotationHealth(annotation, map) : null);

  function repin() {
    if (!annotation || !map) return;
    const next = repinAnnotation(annotation, map);
    void onRepin(next.annotation, next.dropped);
  }
</script>

{#if health?.stale && map}
  <div class="stale" role="status">
    <p>{staleMessage(health)}</p>
    {#if health.dropped.length}
      <p class="legs">
        Re-pinning drops <span class="dl-num"
          >{health.dropped.map((leg) => legLabel(leg, map)).join(', ')}</span
        >.
      </p>
    {/if}
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" disabled={busy} onclick={repin}
      >{busy ? 'Re-pinning…' : 'Re-pin route to the current map'}</button
    >
  </div>
{/if}

<style>
  .stale {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px dashed var(--dl-color-warm);
    border-radius: var(--dl-radius-sm);
    color: var(--dl-color-warm);
    font-size: 14px;
  }
  .stale p {
    margin: 0;
  }
  .legs {
    color: var(--dl-color-text-muted);
    font-size: 13px;
  }
  @media (pointer: coarse) {
    .stale button {
      min-height: 44px;
    }
  }
</style>
