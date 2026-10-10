<script lang="ts">
  import {
    edgeEndpoints,
    edgeKey,
    findNode,
    mapBounds,
    type DiveMapAnnotation,
    type MapNode,
    type MapPoint,
    type SiteMapOut,
  } from '$lib/core/dive/sitemap';

  let {
    map,
    annotation = null,
  }: {
    /** The drawn map to render as a static thumbnail. */
    map: SiteMapOut;
    /** A dive's route to highlight, if any. */
    annotation?: DiveMapAnnotation | null;
  } = $props();

  const extent = $derived(mapBounds(map, 0));
  const size = $derived(Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY, 1));
  const box = $derived(mapBounds(map, Math.max(4, size * 0.08)));
  const viewBox = $derived(`${box.minX} ${box.minY} ${box.maxX - box.minX} ${box.maxY - box.minY}`);

  const edges = $derived(
    map.edges.flatMap((edge) => {
      const ends = edgeEndpoints(map, edge);
      return ends ? [{ key: `${edge.from}-${edge.to}`, style: edge.style, ...ends }] : [];
    }),
  );

  const legs = $derived.by(() => {
    const out: { key: string; a: MapNode; b: MapNode }[] = [];
    for (const leg of annotation?.route ?? []) {
      const key = edgeKey(leg.from, leg.to);
      const a = findNode(map, leg.from);
      const b = findNode(map, leg.to);
      if (!a || !b || out.some((o) => o.key === key)) continue;
      out.push({ key, a, b });
    }
    return out;
  });

  const track = $derived(annotation?.path ?? []);
  const turn = $derived.by((): MapPoint | null => {
    if (!annotation) return null;
    if (annotation.turn) return findNode(map, annotation.turn) ?? null;
    if (annotation.turn_at !== null && !annotation.route.length) {
      return annotation.path[annotation.turn_at] ?? null;
    }
    return null;
  });

  function points(list: MapPoint[]): string {
    return list.map((p) => `${p.x},${p.y}`).join(' ');
  }
</script>

<svg class="thumb" {viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <g class="areas">
    {#each map.areas as area (area.id)}
      <polygon class="area {area.kind}" points={points(area.points)} />
    {/each}
  </g>
  <g class="lines">
    {#each map.lines as line (line.id)}
      {#if line.closed}
        <polygon class="shape {line.kind}" points={points(line.points)} />
      {:else}
        <polyline class="shape {line.kind}" points={points(line.points)} />
      {/if}
    {/each}
  </g>
  <g class="edges">
    {#each edges as edge (edge.key)}
      <line class="edge {edge.style}" x1={edge.a.x} y1={edge.a.y} x2={edge.b.x} y2={edge.b.y} />
    {/each}
  </g>
  {#each map.nodes.filter((n) => n.type === 'entrance' || n.type === 'entry') as node (node.id)}
    <circle class="entrance" cx={node.x} cy={node.y} r={size * 0.02} />
  {/each}
  {#if legs.length || track.length > 1}
    <g class="dive">
      {#each legs as leg (leg.key)}
        <line class="dive-route" x1={leg.a.x} y1={leg.a.y} x2={leg.b.x} y2={leg.b.y} />
      {/each}
      {#if track.length > 1}
        <polyline class="dive-route track" points={points(track)} />
      {/if}
    </g>
  {/if}
  {#if turn}
    <circle class="turn" cx={turn.x} cy={turn.y} r={size * 0.035} />
  {/if}
</svg>

<style>
  .thumb {
    --way-in: #ef4444;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
    color: var(--dl-color-text-muted);
  }
  .area {
    fill: color-mix(in srgb, currentColor 10%, transparent);
    stroke: none;
  }
  .area.depth,
  .area.shallows {
    fill: color-mix(in srgb, var(--dl-color-accent) 12%, transparent);
  }
  .area.coral,
  .area.reeds {
    fill: color-mix(in srgb, var(--dl-color-success) 16%, transparent);
  }
  .shape {
    fill: none;
    stroke: color-mix(in srgb, currentColor 55%, transparent);
    stroke-width: 1px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .shape.depth {
    stroke: color-mix(in srgb, var(--dl-color-accent) 45%, transparent);
  }
  .shape.path,
  .shape.wall {
    stroke: color-mix(in srgb, var(--dl-color-warm) 60%, transparent);
    stroke-dasharray: 4 3;
  }
  .edge {
    stroke: currentColor;
    stroke-width: 1.25px;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .edge.jump,
  .edge.route {
    stroke-dasharray: 3 3;
  }
  .edge.unsurveyed {
    stroke-dasharray: 1 3;
    opacity: 0.6;
  }
  .entrance {
    fill: var(--dl-color-accent);
  }
  .dive-route {
    fill: none;
    stroke: var(--way-in);
    stroke-width: 2.5px;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .turn {
    fill: none;
    stroke: var(--dl-color-warm);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
</style>
