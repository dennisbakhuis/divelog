<script lang="ts">
  import SiteMapView from '$lib/components/dive/SiteMapView.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Toolbar, { type ToolItem } from '$lib/components/ui/Toolbar.svelte';
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

  /** Screens this narrow edit the route full screen; the page shows a preview. */
  const NARROW_QUERY = '(max-width: 700px)';
  /** How many steps Back can take back. */
  const HISTORY = 100;

  const mapsKey = $derived(maps.map((m) => m.id).join(' '));
  // The maps "— none —" was chosen for: a single map is not picked again by itself.
  let dismissedFor = $state<string | null>(null);
  /** The annotation being edited; with a single map that map is picked until one is chosen. */
  const value = $derived(
    given ?? (dismissedFor !== mapsKey && maps.length === 1 ? emptyAnnotation(maps[0]) : null),
  );

  type Tool = 'route' | 'turn' | 'pin';
  let tool = $state<Tool>('route');

  let selectedPin = $state<string | null>(null);
  let expanded = $state(false);
  let narrow = $state(false);
  let coarse = $state(false);
  let bigMap = $state<ReturnType<typeof SiteMapView>>();

  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const narrowQuery = window.matchMedia(NARROW_QUERY);
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    narrow = narrowQuery.matches;
    coarse = coarseQuery.matches;
    const syncNarrow = (e: MediaQueryListEvent) => (narrow = e.matches);
    const syncCoarse = (e: MediaQueryListEvent) => (coarse = e.matches);
    narrowQuery.addEventListener?.('change', syncNarrow);
    coarseQuery.addEventListener?.('change', syncCoarse);
    return () => {
      narrowQuery.removeEventListener?.('change', syncNarrow);
      coarseQuery.removeEventListener?.('change', syncCoarse);
    };
  });

  const Tap = $derived(coarse ? 'Tap' : 'Click');
  const tap = $derived(coarse ? 'tap' : 'click');
  const tapped = $derived(coarse ? 'tapped' : 'clicked');
  const tapping = $derived(coarse ? 'tapping' : 'clicking');

  const map = $derived(value ? maps.find((m) => m.id === value.map_id) : undefined);
  const route = $derived(value ? routeKeys(value) : new Set<string>());
  // A stick map's route follows the drawn line; a site map takes a free-drawn track.
  const free = $derived(map?.kind === 'sitemap');
  const toolItems = $derived<ToolItem[]>([
    {
      value: 'route',
      label: 'Route',
      hint: free ? `${Tap} along the way you swam` : `${Tap} the stations you passed, in order`,
    },
    {
      value: 'turn',
      label: 'Turn point',
      hint: free
        ? `${Tap} the point of the track where you turned`
        : `${Tap} the station where you turned`,
    },
    { value: 'pin', label: 'Note pin', hint: `${Tap} anywhere to drop a numbered note` },
  ]);

  type RouteFields = Pick<DiveMapAnnotation, 'route' | 'turn' | 'path' | 'turn_at'>;
  // What the route looked like before each step, and right after it, so Back knows the
  // annotation was not changed elsewhere (a re-pin, another map) in the meantime.
  let history = $state.raw<{ before: RouteFields; after: RouteFields }[]>([]);

  function routeOf(a: RouteFields): RouteFields {
    return { route: a.route, turn: a.turn, path: a.path, turn_at: a.turn_at };
  }

  function sameRoute(a: RouteFields, b: RouteFields): boolean {
    return JSON.stringify(routeOf(a)) === JSON.stringify(routeOf(b));
  }

  const canBack = $derived(
    !!value && history.length > 0 && sameRoute(history[history.length - 1].after, value),
  );

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
  const points = $derived(value?.path.length ?? 0);

  /** Hand on a change to the route, remembering the route before it for Back. */
  function step(next: DiveMapAnnotation) {
    if (!value || sameRoute(next, value)) return;
    const kept = canBack ? history : [];
    history = [...kept, { before: routeOf(value), after: routeOf(next) }].slice(-HISTORY);
    onChange(next);
  }

  function addPoint(x: number, y: number) {
    if (!value) return;
    const point = { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
    step({ ...value, path: [...value.path, point] });
  }

  function back() {
    if (!value || !canBack) return;
    const last = history[history.length - 1];
    history = history.slice(0, -1);
    onChange({ ...value, ...last.before });
  }

  function turnHere() {
    if (!value) return;
    if (free) step({ ...value, turn_at: value.path.length ? value.path.length - 1 : null });
    else step({ ...value, turn: end });
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
    step({ ...value, route: [], turn: null, path: [], turn_at: null });
  }
  const pin = $derived(
    value && selectedPin ? value.pins.find((p) => p.id === selectedPin) : undefined,
  );

  function choose(id: string) {
    const target = maps.find((m) => m.id === id);
    dismissedFor = target ? null : mapsKey;
    onChange(target ? emptyAnnotation(target) : null);
    selectedPin = null;
    history = [];
    if (target && narrow) expanded = true;
    if (!target) expanded = false;
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
    if (tool === 'turn') step({ ...value, turn: value.turn === id ? null : id });
    else if (tool === 'route') step(extendRoute(map, value, id));
  }

  // Stations and lines take a tap only for the tools that aim at them; for a note pin or a
  // turn on a free track the tap lands on the canvas, where it was made.
  const nodeTarget = $derived(tool === 'route' || (!free && tool === 'turn'));
  const edgeTarget = $derived(tool === 'route' && !free);

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
      step({ ...value, turn_at: value.turn_at === at ? null : at });
      return;
    }
    selectedPin = null;
  }

  function onPinClick(p: DiveMapPin) {
    selectedPin = selectedPin === p.id ? null : p.id;
  }
</script>

{#snippet editorMap(fill: boolean)}
  {#if value && map}
    <SiteMapView
      bind:this={bigMap}
      {map}
      editable
      {fill}
      zoomControls={!fill}
      {route}
      legs={value.route}
      path={value.path}
      pathTurn={value.turn_at}
      turn={value.turn}
      pins={value.pins}
      selection={{ pin: selectedPin ?? undefined }}
      onEdgeClick={edgeTarget ? onEdgeClick : undefined}
      onNodeClick={nodeTarget ? onNodeClick : undefined}
      {onCanvasClick}
      {onPinClick}
    />
  {/if}
{/snippet}

{#snippet tools()}
  <Toolbar
    class="tools"
    label="Annotation tool"
    items={toolItems}
    value={tool}
    onchange={(next) => (tool = next as Tool)}
    itemClass={(_t, selected) => `dl-btn dl-btn-sm ${selected ? 'dl-btn-solid' : 'dl-btn-ghost'}`}
  />
{/snippet}

{#snippet routeActions()}
  <button
    type="button"
    class="dl-btn dl-btn-ghost dl-btn-sm"
    disabled={!canBack}
    onclick={back}
    aria-label="Back: undo the last step"><span aria-hidden="true">↶</span> Back</button
  >
  <button
    type="button"
    class="dl-btn dl-btn-ghost dl-btn-sm"
    disabled={!canTurnHere}
    onclick={turnHere}>Turned here</button
  >
  <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" disabled={!hasRoute} onclick={clear}
    >Clear route</button
  >
{/snippet}

{#snippet hint()}
  {#if value && map}
    <p class="hint">
      {#if tool === 'route' && free}
        {#if points}
          Track of {points}
          {points === 1 ? 'point' : 'points'}, {Math.round(pathLength(value.path))} m. {Tap} where you
          swam next, or an object to swim to it; {tap} your exit to close the loop.
        {:else}
          {Tap} along the way you swam, from the entry; every {tap} adds a point. Objects can be {tapped}
          too.
        {/if}
      {:else if tool === 'route'}
        {#if value.route.length}
          Route ends at <strong>{endLabel}</strong>. {Tap} the next station you reached; to come back
          the same way, {tap} where you got out. {annotationSummary(map, value)}
        {:else}
          {Tap} the first station you reached from the entrance; the line in between fills in. Keep
          {tapping} in the order you swam, and {tap} a line to add just that leg.
        {/if}
      {:else if tool === 'turn'}
        {free
          ? `${Tap} the point of the track where you turned the dive.`
          : `${Tap} the station where you turned the dive.`}
      {:else}
        {Tap} the map to drop a note, then write it {expanded ? 'above' : 'below'}.
      {/if}
    </p>
  {/if}
{/snippet}

{#snippet pinRow()}
  {#if value && pin}
    <div class="pin-row">
      <label class="grow">
        Note {value.pins.findIndex((p) => p.id === pin.id) + 1}
        <input
          type="text"
          value={pin.note}
          maxlength="200"
          placeholder="e.g. silt-out drill here, found the jump"
          oninput={(e) => onChange(updatePin(value!, pin.id, { note: e.currentTarget.value }))}
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
{/snippet}

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
      {#if !narrow}
        {@render tools()}
        {#if tool === 'route'}
          <div class="tools">{@render routeActions()}</div>
        {/if}
      {/if}
      <button
        type="button"
        class="dl-btn dl-btn-sm expand {narrow ? 'dl-btn-solid' : 'dl-btn-ghost'}"
        aria-haspopup="dialog"
        onclick={() => (expanded = true)}
        ><span aria-hidden="true">⛶</span> {narrow ? 'Draw on the map' : 'Expand'}</button
      >
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => choose('')}
        >Remove</button
      >
    {/if}
  </div>

  {#if value && map}
    {#if !expanded}
      {#if narrow}
        <SiteMapView
          {map}
          title="Route on {map.title || defaultTitle(map.kind)}"
          {route}
          legs={value.route}
          path={value.path}
          pathTurn={value.turn_at}
          turn={value.turn}
          pins={value.pins}
        />
        <p class="hint">
          {hasRoute ? annotationSummary(map, value) || 'Route drawn.' : 'No route drawn yet.'}
          Open the map full screen to draw the way you swam.
        </p>
      {:else}
        {@render editorMap(false)}
        {@render hint()}
        {@render pinRow()}
      {/if}
    {/if}
    <label>
      What happened
      <input
        type="text"
        value={value.note}
        maxlength="500"
        placeholder="e.g. turned on thirds at the T, 42 m"
        oninput={(e) => onChange({ ...value!, note: e.currentTarget.value })}
      />
    </label>
  {/if}
</div>

<Dialog
  bind:open={expanded}
  size="full"
  label="Route on the map"
  showClose={false}
  closeOnBackdrop={false}
  initialFocus=".route-full [aria-checked='true']"
  class="route-full-dialog"
>
  <div class="route-full">
    {@render pinRow()}
    <div class="stage">{@render editorMap(true)}</div>
    {@render hint()}
    <div class="strip">
      {@render tools()}
      <div class="tools">
        {@render routeActions()}
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm zoom"
          aria-label="Zoom out"
          onclick={() => bigMap?.zoomOut()}>−</button
        >
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm zoom"
          aria-label="Zoom in"
          onclick={() => bigMap?.zoomIn()}>+</button
        >
        <button
          type="button"
          class="dl-btn dl-btn-solid dl-btn-sm done"
          onclick={() => (expanded = false)}>Done</button
        >
      </div>
    </div>
  </div>
</Dialog>

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
    flex-wrap: wrap;
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
  :global(.route-full-dialog) {
    overflow: hidden;
  }
  :global(.route-full-dialog > .dl-dialog-panel) {
    height: 100%;
    box-sizing: border-box;
    padding: 0;
    gap: 0;
  }
  :global(.route-full-dialog .dl-dialog-content) {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .route-full {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
  }
  .stage {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: space-between;
  }
  .strip .tools {
    gap: 6px;
  }
  .zoom {
    min-width: 44px;
    font-size: 1.1rem;
  }
  @media (pointer: coarse) {
    .route-editor :global(.dl-btn),
    .route-full :global(.dl-btn) {
      min-height: 44px;
    }
  }
</style>
