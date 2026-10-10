<script lang="ts">
  import SiteMapView from '$lib/components/dive/SiteMapView.svelte';
  import {
    addPin,
    annotationSummary,
    defaultTitle,
    emptyAnnotation,
    extendRoute,
    extendRouteAlong,
    findNode,
    pathLength,
    removePin,
    routeEnd,
    routeKeys,
    trimRoute,
    updatePin,
    type DiveMapAnnotation,
    type DiveMapPin,
    type MapEdge,
    type SiteMapOut,
  } from '$lib/core/dive/sitemap';

  let {
    maps,
    value: given,
    onChange,
  }: {
    /** The site's drawn maps. */
    maps: SiteMapOut[];
    value: DiveMapAnnotation | null;
    onChange: (annotation: DiveMapAnnotation | null) => void;
  } = $props();

  /** The annotation being edited; with a single map that map is picked until one is chosen. */
  const value = $derived(given ?? (maps.length === 1 ? emptyAnnotation(maps[0]) : null));

  type Tool = 'route' | 'turn' | 'pin';
  let tool = $state<Tool>('route');
  let selectedPin = $state<string | null>(null);

  const map = $derived(value ? maps.find((m) => m.id === value.map_id) : undefined);
  const route = $derived(value ? routeKeys(value) : new Set<string>());
  // A stick map's route follows the drawn line; a site map takes a free-drawn track.
  const free = $derived(map?.kind === 'sitemap');
  // How many legs (or track points) each click added, so one click can be taken back.
  let steps = $state<number[]>([]);
  const end = $derived(value && map ? routeEnd(map, value) : null);
  const endLabel = $derived.by(() => {
    const node = end && map ? findNode(map, end) : undefined;
    return node ? node.label || node.id : '';
  });
  const hasRoute = $derived(!!value && (value.route.length > 0 || value.path.length > 0));
  const canTurnHere = $derived.by(() => {
    if (!value) return false;
    if (free) return value.path.length > 0 && value.turn_at !== value.path.length - 1;
    return !!end && value.turn !== end;
  });

  function step(next: DiveMapAnnotation) {
    if (!value) return;
    const added = free
      ? next.path.length - value.path.length
      : next.route.length - value.route.length;
    if (added > 0) steps = [...steps, added];
    onChange(next);
  }

  function addPoint(x: number, y: number) {
    if (!value) return;
    const point = { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
    step({ ...value, path: [...value.path, point] });
  }

  function back() {
    if (!value || !steps.length) return;
    const last = steps[steps.length - 1];
    steps = steps.slice(0, -1);
    if (!free) {
      onChange(trimRoute(value, last));
      return;
    }
    const path = value.path.slice(0, Math.max(0, value.path.length - last));
    const turnAt = value.turn_at !== null && value.turn_at < path.length ? value.turn_at : null;
    onChange({ ...value, path, turn_at: turnAt });
  }

  function turnHere() {
    if (!value) return;
    if (free) onChange({ ...value, turn_at: value.path.length ? value.path.length - 1 : null });
    else onChange({ ...value, turn: end });
  }

  function nearestPoint(x: number, y: number): number | null {
    if (!value?.path.length) return null;
    let best = 0;
    let bestDist = Infinity;
    value.path.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function clear() {
    if (!value) return;
    steps = [];
    onChange({ ...value, route: [], turn: null, path: [], turn_at: null });
  }
  const pin = $derived(
    value && selectedPin ? value.pins.find((p) => p.id === selectedPin) : undefined,
  );

  function choose(id: string) {
    const target = maps.find((m) => m.id === id);
    onChange(target ? emptyAnnotation(target) : null);
    selectedPin = null;
    steps = [];
  }

  function onEdgeClick(edge: MapEdge) {
    if (!value || !map || tool !== 'route' || free) return;
    step(extendRouteAlong(map, value, edge));
  }

  function onNodeClick(id: string) {
    if (!value || !map) return;
    if (free) {
      const node = findNode(map, id);
      if (node && tool === 'route') addPoint(node.x, node.y);
      return;
    }
    if (tool === 'turn') onChange({ ...value, turn: value.turn === id ? null : id });
    else if (tool === 'route') step(extendRoute(map, value, id));
  }

  function onCanvasClick(x: number, y: number) {
    if (!value) return;
    if (tool === 'pin') {
      const added = addPin(value, Math.round(x * 2) / 2, Math.round(y * 2) / 2);
      onChange(added.annotation);
      selectedPin = added.id;
      return;
    }
    if (free && tool === 'route') {
      addPoint(x, y);
      return;
    }
    if (free && tool === 'turn') {
      const at = nearestPoint(x, y);
      onChange({ ...value, turn_at: value.turn_at === at ? null : at });
      return;
    }
    selectedPin = null;
  }

  function onPinClick(p: DiveMapPin) {
    selectedPin = selectedPin === p.id ? null : p.id;
  }
</script>

<div class="route-editor">
  <div class="pick">
    <label>
      Map
      <select value={value?.map_id ?? ''} onchange={(e) => choose(e.currentTarget.value)}>
        <option value="">— none —</option>
        {#each maps as m (m.id)}
          <option value={m.id}>{m.title || defaultTitle(m.kind)}</option>
        {/each}
      </select>
    </label>
    {#if value && map}
      <div class="tools" role="radiogroup" aria-label="Annotation tool">
        <button
          type="button"
          class="dl-btn dl-btn-sm"
          class:dl-btn-solid={tool === 'route'}
          class:dl-btn-ghost={tool !== 'route'}
          role="radio"
          aria-checked={tool === 'route'}
          onclick={() => (tool = 'route')}
          title={free ? 'Click along the way you swam' : 'Click the stations you passed, in order'}
          >Route</button
        >
        <button
          type="button"
          class="dl-btn dl-btn-sm"
          class:dl-btn-solid={tool === 'turn'}
          class:dl-btn-ghost={tool !== 'turn'}
          role="radio"
          aria-checked={tool === 'turn'}
          onclick={() => (tool = 'turn')}
          title="Click the station where you turned">Turn point</button
        >
        <button
          type="button"
          class="dl-btn dl-btn-sm"
          class:dl-btn-solid={tool === 'pin'}
          class:dl-btn-ghost={tool !== 'pin'}
          role="radio"
          aria-checked={tool === 'pin'}
          onclick={() => (tool = 'pin')}
          title="Click anywhere to drop a numbered note">Note pin</button
        >
      </div>
      {#if tool === 'route'}
        <div class="tools">
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            disabled={!steps.length}
            onclick={back}
            title="Take back the last click">↶ Back</button
          >
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            disabled={!canTurnHere}
            onclick={turnHere}
            title="The dive turned where the route now ends">Turned here</button
          >
          <button
            type="button"
            class="dl-btn dl-btn-ghost dl-btn-sm"
            disabled={!hasRoute}
            onclick={clear}>Clear route</button
          >
        </div>
      {/if}
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => choose('')}
        >Remove</button
      >
    {/if}
  </div>

  {#if value && map}
    <SiteMapView
      {map}
      editable
      {route}
      legs={value.route}
      path={value.path}
      pathTurn={value.turn_at}
      turn={value.turn}
      pins={value.pins}
      selection={{ pin: selectedPin ?? undefined }}
      onEdgeClick={free ? undefined : onEdgeClick}
      {onNodeClick}
      {onCanvasClick}
      {onPinClick}
    />
    <p class="hint">
      {#if tool === 'route' && free}
        {#if value.path.length}
          Track of {value.path.length} points, {Math.round(pathLength(value.path))} m. Click where you
          swam next, or an object to swim to it; click your exit to close the loop.
        {:else}
          Click along the way you swam, from the entry; every click adds a point. Objects can be
          clicked too.
        {/if}
      {:else if tool === 'route'}
        {#if value.route.length}
          Route ends at <strong>{endLabel}</strong>. Click the next station you reached; to come
          back the same way, click where you got out. {annotationSummary(map, value)}
        {:else}
          Click the first station you reached from the entrance; the line in between fills in. Keep
          clicking in the order you swam, and click a line to add just that leg.
        {/if}
      {:else if tool === 'turn'}
        {free
          ? 'Click the point of the track where you turned the dive.'
          : 'Click the station where you turned the dive.'}
      {:else}
        Click the map to drop a note, then write it below.
      {/if}
    </p>
    {#if pin}
      <div class="pin-row">
        <label class="grow">
          Note {value.pins.findIndex((p) => p.id === pin.id) + 1}
          <input
            type="text"
            value={pin.note}
            maxlength="200"
            placeholder="e.g. silt-out drill here, found the jump"
            onchange={(e) => onChange(updatePin(value!, pin.id, { note: e.currentTarget.value }))}
          />
        </label>
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm danger"
          onclick={() => {
            onChange(removePin(value!, pin.id));
            selectedPin = null;
          }}>Delete note</button
        >
      </div>
    {/if}
    <label>
      What happened
      <input
        type="text"
        value={value.note}
        maxlength="500"
        placeholder="e.g. turned on thirds at the T, 42 m"
        onchange={(e) => onChange({ ...value!, note: e.currentTarget.value })}
      />
    </label>
  {/if}
</div>

<style>
  .route-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pick {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .pick label {
    min-width: 220px;
  }
  .tools {
    display: flex;
    gap: 4px;
  }
  .hint {
    font-size: 13px;
    color: var(--dl-color-text-muted);
    margin: 0;
  }
  .pin-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  .grow {
    flex: 1;
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
</style>
