<script lang="ts">
  import SiteMapView from '$lib/components/dive/SiteMapView.svelte';
  import ObjectPicker from './ObjectPicker.svelte';
  import {
    addArea,
    addLine,
    addNode,
    addSurveyShot,
    AREA_KINDS,
    defaultTitle,
    edgeStylesFor,
    findNode,
    LINE_KINDS,
    lineLength,
    MAP_KINDS,
    mapSummary,
    moveLinePoint,
    moveNode,
    NODE_TYPES,
    nodeTypesFor,
    normalizeSiteMap,
    OBJECT_KINDS,
    removeArea,
    removeLine,
    removeNode,
    snap,
    toggleEdge,
    updateArea,
    updateEdge,
    updateLine,
    updateNode,
    type AreaKind,
    type LineKind,
    type MapArea,
    type MapEdge,
    type MapKind,
    type MapLine,
    type MapPoint,
    type NodeType,
    type ObjectKind,
    type SiteMap,
  } from '$lib/core/dive/sitemap';

  export type UnderlayOption = { ref: string; label: string; href: string };

  let {
    value,
    underlays = [],
    onChange,
  }: {
    value: SiteMap;
    /** Maps that can be traced over: the locator, sketches, reference maps, uploads. */
    underlays?: UnderlayOption[];
    onChange: (map: SiteMap) => void;
  } = $props();

  type Tool = 'add' | 'connect' | 'move' | 'area' | 'line' | 'object' | 'survey';

  // The parent re-keys this component when it opens another map, so the
  // initial value is all we need here.
  // svelte-ignore state_referenced_locally
  let map = $state<SiteMap>(normalizeSiteMap(value));
  let tool = $state<Tool>('add');
  let grid = $state(1);
  // svelte-ignore state_referenced_locally
  let selectedNode = $state<string | null>(map.nodes.at(-1)?.id ?? null);
  let selectedEdge = $state<{ from: string; to: string } | null>(null);
  let selectedArea = $state<string | null>(null);
  let selectedLine = $state<string | null>(null);
  let connectFrom = $state<string | null>(null);
  let draft = $state<MapPoint[]>([]);
  let draftKind = $state<AreaKind>('outline');
  let lineKind = $state<LineKind>('shoreline');
  let lineClosed = $state(false);
  let objectKind = $state<ObjectKind>('bus');
  let survey = $state({ distance: '', azimuth: '', depth: '' });
  let showUnderlay = $state(true);
  let history = $state<SiteMap[]>([]);
  let showJson = $state(false);
  let jsonText = $state('');
  let jsonError = $state('');

  const node = $derived(selectedNode ? findNode(map, selectedNode) : undefined);
  const edge = $derived(
    selectedEdge
      ? map.edges.find(
          (e) =>
            (e.from === selectedEdge!.from && e.to === selectedEdge!.to) ||
            (e.from === selectedEdge!.to && e.to === selectedEdge!.from),
        )
      : undefined,
  );
  const area = $derived(selectedArea ? map.areas.find((a) => a.id === selectedArea) : undefined);
  const line = $derived(selectedLine ? map.lines.find((l) => l.id === selectedLine) : undefined);
  const selection = $derived({
    node: selectedNode ?? undefined,
    edge: selectedEdge ?? undefined,
    area: selectedArea ?? undefined,
    line: selectedLine ?? undefined,
  });
  const nodeTypes = $derived.by(() => {
    const list = nodeTypesFor(map.kind);
    if (node && !list.some((t) => t.type === node.type)) {
      const extra = NODE_TYPES.find((t) => t.type === node.type);
      return extra ? [...list, extra] : list;
    }
    return list;
  });
  const underlayHref = $derived(
    map.underlay ? (underlays.find((u) => u.ref === map.underlay?.ref)?.href ?? null) : null,
  );

  function commit(next: SiteMap) {
    history = [...history.slice(-49), map];
    map = next;
    onChange(next);
  }

  function undo() {
    const prev = history.pop();
    if (!prev) return;
    map = prev;
    onChange(prev);
    selectedNode = prev.nodes.some((n) => n.id === selectedNode) ? selectedNode : null;
    selectedEdge = null;
    selectedArea = null;
    selectedLine = null;
  }

  function clearSelection() {
    selectedNode = null;
    selectedEdge = null;
    selectedArea = null;
    selectedLine = null;
    connectFrom = null;
  }

  function onCanvasClick(x: number, y: number) {
    const sx = snap(x, grid);
    const sy = snap(y, grid);
    if (tool === 'area' || tool === 'line') {
      const first = draft[0];
      if (first && draft.length >= 2 && Math.hypot(first.x - sx, first.y - sy) <= grid * 2) {
        finishDraft(true);
        return;
      }
      draft = [...draft, { x: sx, y: sy }];
      return;
    }
    selectedEdge = null;
    selectedArea = null;
    selectedLine = null;
    if (tool === 'add') {
      const { map: next, id } = addNode(map, sx, sy, selectedNode);
      commit(next);
      selectedNode = id;
    } else if (tool === 'object') {
      const { map: added, id } = addNode(map, sx, sy, null);
      commit(updateNode(added, id, { type: 'object', object_kind: objectKind }));
      selectedNode = id;
    } else {
      clearSelection();
    }
  }

  /** Close the polygon or polyline being drawn; `closedByClick` when the first point was hit. */
  function finishDraft(closedByClick = false) {
    if (tool === 'area') {
      if (draft.length < 3) return;
      const { map: next, id } = addArea(map, draftKind, draft);
      draft = [];
      commit(next);
      clearSelection();
      selectedArea = id;
    } else {
      if (draft.length < 2) return;
      const closed = lineClosed || (closedByClick && draft.length >= 3);
      const { map: next, id } = addLine(map, lineKind, draft, closed);
      draft = [];
      commit(next);
      clearSelection();
      selectedLine = id;
    }
    tool = 'move';
  }

  function onNodeClick(id: string, shift: boolean) {
    if (tool === 'area' || tool === 'line') return;
    selectedEdge = null;
    selectedArea = null;
    selectedLine = null;
    if (tool === 'connect' || shift) {
      if (connectFrom && connectFrom !== id) {
        commit(toggleEdge(map, connectFrom, id));
        connectFrom = null;
        selectedNode = id;
      } else {
        connectFrom = id;
        selectedNode = id;
      }
      return;
    }
    selectedNode = id;
  }

  function onEdgeClick(e: MapEdge) {
    if (tool === 'area' || tool === 'line') return;
    clearSelection();
    selectedEdge = { from: e.from, to: e.to };
  }

  function onAreaClick(a: MapArea) {
    if (tool === 'area' || tool === 'line') return;
    clearSelection();
    selectedArea = a.id;
  }

  function onLineClick(l: MapLine) {
    if (tool === 'area' || tool === 'line') return;
    clearSelection();
    selectedLine = l.id;
  }

  let dragStart: SiteMap | null = null;
  function onNodeMove(id: string, x: number, y: number, done: boolean) {
    if (!dragStart) dragStart = map;
    const moved = moveNode(map, id, snap(x, grid), snap(y, grid));
    if (done) {
      const start = dragStart;
      dragStart = null;
      history = [...history.slice(-49), start];
      map = moved;
      onChange(moved);
      selectedNode = id;
    } else {
      map = moved;
    }
  }

  function onLinePointMove(id: string, index: number, x: number, y: number, done: boolean) {
    if (!dragStart) dragStart = map;
    const moved = moveLinePoint(map, id, index, snap(x, grid), snap(y, grid));
    if (done) {
      const start = dragStart;
      dragStart = null;
      history = [...history.slice(-49), start];
      map = moved;
      onChange(moved);
    } else {
      map = moved;
    }
  }

  function deleteSelection() {
    if (selectedNode) {
      commit(removeNode(map, selectedNode));
      selectedNode = null;
    } else if (selectedEdge) {
      commit(toggleEdge(map, selectedEdge.from, selectedEdge.to));
      selectedEdge = null;
    } else if (selectedArea) {
      commit(removeArea(map, selectedArea));
      selectedArea = null;
    } else if (selectedLine) {
      commit(removeLine(map, selectedLine));
      selectedLine = null;
    }
  }

  function addShot() {
    if (!selectedNode) return;
    const distance = Number(survey.distance);
    const azimuth = Number(survey.azimuth);
    if (!(distance > 0) || !Number.isFinite(azimuth)) return;
    const depth = survey.depth.trim() === '' ? null : Number(survey.depth);
    const { map: next, id } = addSurveyShot(map, selectedNode, distance, azimuth, depth);
    if (!id) return;
    commit(next);
    selectedNode = id;
    survey = { distance: '', azimuth: '', depth: survey.depth };
  }

  function patchNode(patch: Partial<(typeof map.nodes)[number]>) {
    if (!selectedNode) return;
    commit(updateNode(map, selectedNode, patch));
  }

  function patchEdge(patch: Partial<MapEdge>) {
    if (!selectedEdge) return;
    commit(updateEdge(map, selectedEdge.from, selectedEdge.to, patch));
  }

  function patchArea(patch: Partial<MapArea>) {
    if (!selectedArea) return;
    commit(updateArea(map, selectedArea, patch));
  }

  function patchLine(patch: Partial<MapLine>) {
    if (!selectedLine) return;
    commit(updateLine(map, selectedLine, patch));
  }

  function patchUnderlay(patch: Partial<NonNullable<SiteMap['underlay']>>) {
    if (!map.underlay) return;
    commit({ ...map, underlay: { ...map.underlay, ...patch } });
  }

  function chooseUnderlay(ref: string) {
    if (!ref) {
      commit({ ...map, underlay: null });
      return;
    }
    commit({
      ...map,
      underlay: {
        ref,
        scale: map.underlay?.scale ?? 0.1,
        dx: map.underlay?.dx ?? 0,
        dy: map.underlay?.dy ?? 0,
        rotation: map.underlay?.rotation ?? 0,
        opacity: map.underlay?.opacity ?? 0.5,
      },
    });
    showUnderlay = true;
  }

  function numberOrNull(value: string): number | null {
    return value.trim() === '' ? null : Number(value);
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (draft.length) draft = draft.slice(0, -1);
      else deleteSelection();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Enter' && draft.length) {
      e.preventDefault();
      finishDraft();
    } else if (e.key === 'Escape') {
      draft = [];
      clearSelection();
    } else if (e.key === 'a') tool = 'add';
    else if (e.key === 'c') tool = 'connect';
    else if (e.key === 'm') tool = 'move';
    else if (e.key === 'r') tool = 'area';
    else if (e.key === 'l') tool = 'line';
    else if (e.key === 'o') tool = 'object';
    else if (e.key === 's') tool = 'survey';
    else if (e.key === 'u') showUnderlay = !showUnderlay;
  }

  function openJson() {
    jsonText = JSON.stringify(map, null, 2);
    jsonError = '';
    showJson = true;
  }

  function applyJson() {
    try {
      commit(normalizeSiteMap(JSON.parse(jsonText)));
      clearSelection();
      jsonError = '';
      showJson = false;
    } catch (err) {
      jsonError = err instanceof Error ? err.message : 'Invalid JSON';
    }
  }

  function clear() {
    if (!confirm('Remove everything on this map?')) return;
    commit({ ...map, nodes: [], edges: [], areas: [], lines: [] });
    draft = [];
    clearSelection();
  }

  const tools: { tool: Tool; label: string; title: string; kinds: MapKind[] }[] = [
    {
      tool: 'add',
      label: 'Station',
      title: 'Click the canvas to add a station linked to the selected one (A)',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'survey',
      label: 'Survey',
      title: 'Type distance, bearing and depth to place the next station from the selected one (S)',
      kinds: ['stickmap'],
    },
    {
      tool: 'connect',
      label: 'Connect',
      title: 'Click two stations to add or remove the line between them (C)',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'move',
      label: 'Move',
      title: 'Drag things, click things to edit them (M)',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'line',
      label: 'Line',
      title: 'Click points of a shoreline, depth contour or dive path; Enter to finish (L)',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'area',
      label: 'Area',
      title:
        'Click corners of a shore, wreck or shallows; click the first point or press Enter to close (R)',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'object',
      label: 'Object',
      title: 'Click to drop a bus, wipkip, platform or other object (O)',
      kinds: ['sitemap', 'stickmap'],
    },
  ];
</script>

<svelte:window onkeydown={onKey} />

<div class="editor">
  <div class="meta">
    <label>
      Kind
      <select
        value={map.kind}
        onchange={(e) => commit({ ...map, kind: e.currentTarget.value as MapKind })}
      >
        {#each MAP_KINDS as k (k.kind)}<option value={k.kind} title={k.hint}>{k.label}</option
          >{/each}
      </select>
    </label>
    <label class="grow">
      Title
      <input
        type="text"
        value={map.title}
        maxlength="120"
        placeholder={defaultTitle(map.kind)}
        onchange={(e) => commit({ ...map, title: e.currentTarget.value })}
      />
    </label>
  </div>

  <div class="toolbar">
    <div class="tools" role="radiogroup" aria-label="Tool">
      {#each tools.filter((t) => t.kinds.includes(map.kind)) as t (t.tool)}
        <button
          type="button"
          class="dl-btn dl-btn-sm"
          class:dl-btn-solid={tool === t.tool}
          class:dl-btn-ghost={tool !== t.tool}
          role="radio"
          aria-checked={tool === t.tool}
          onclick={() => {
            tool = t.tool;
            if (t.tool !== 'area' && t.tool !== 'line') draft = [];
          }}
          title={t.title}>{t.label}</button
        >
      {/each}
    </div>
    {#if tool === 'area'}
      <label class="inline">
        as
        <select bind:value={draftKind}>
          {#each AREA_KINDS as a (a.kind)}<option value={a.kind}>{a.label}</option>{/each}
        </select>
      </label>
    {:else if tool === 'line'}
      <label class="inline">
        as
        <select bind:value={lineKind}>
          {#each LINE_KINDS as l (l.kind)}<option value={l.kind} title={l.hint}>{l.label}</option
            >{/each}
        </select>
      </label>
      <label class="inline"><input type="checkbox" bind:checked={lineClosed} /> closed</label>
    {/if}
    <label class="inline">
      Snap
      <select bind:value={grid}>
        <option value={0.5}>0.5 m</option>
        <option value={1}>1 m</option>
        <option value={5}>5 m</option>
      </select>
    </label>
    {#if map.underlay}
      <label class="inline"
        ><input type="checkbox" bind:checked={showUnderlay} /> underlay (U)</label
      >
    {/if}
    <span class="spacer"></span>
    <button
      type="button"
      class="dl-btn dl-btn-ghost dl-btn-sm"
      onclick={undo}
      disabled={!history.length}>Undo</button
    >
    <button
      type="button"
      class="dl-btn dl-btn-ghost dl-btn-sm"
      onclick={deleteSelection}
      disabled={!selectedNode && !selectedEdge && !selectedArea && !selectedLine}>Delete</button
    >
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={openJson}>JSON</button>
    <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm danger" onclick={clear}>Clear</button
    >
  </div>

  <div class="canvas-row">
    <div class="canvas">
      <SiteMapView
        {map}
        editable
        {selection}
        {draft}
        {underlayHref}
        {showUnderlay}
        {onCanvasClick}
        {onNodeClick}
        {onEdgeClick}
        {onAreaClick}
        {onLineClick}
        {onNodeMove}
        {onLinePointMove}
      />
      {#if tool === 'object'}
        <ObjectPicker value={objectKind} onchange={(kind) => (objectKind = kind)} />
      {/if}
      <p class="hint">
        {#if tool === 'area' || tool === 'line'}
          {draft.length
            ? `${draft.length} points. Press Enter to finish${tool === 'area' ? ', or click the first point to close' : ''}; Backspace removes the last point.`
            : tool === 'area'
              ? 'Click the corners of the area. Areas sit under everything else.'
              : 'Click along the line. A depth contour gets its depth in the panel afterwards; a dive path shows direction arrows.'}
        {:else if tool === 'survey'}
          {node
            ? `Shooting from ${node.label || node.id}. Enter distance and bearing in the panel.`
            : 'Select the station to shoot from first.'}
        {:else if tool === 'object'}
          Click to place a {OBJECT_KINDS.find((o) => o.kind === objectKind)?.label.toLowerCase()}.
        {:else if map.nodes.length === 0}
          Click anywhere to place the {map.kind === 'sitemap' ? 'entry point' : 'entrance'}, then
          keep clicking to lay the line. Drag to move, shift-click two stations to connect them.
        {:else if tool === 'add'}
          Adding after <strong>{node?.label || node?.id || 'nothing'}</strong>. Click a station
          first to branch from it.
        {:else if tool === 'connect'}
          {connectFrom ? `Now click the other end for ${connectFrom}.` : 'Click the first station.'}
        {:else}
          Drag stations and line points. Click a line, contour or area to edit it.
        {/if}
      </p>
    </div>

    <aside class="panel">
      {#if tool === 'survey' && node}
        <h3>Shot from <span class="dl-num">{node.label || node.id}</span></h3>
        <div class="xy">
          <label
            >Distance (m)<input
              type="number"
              step="0.1"
              min="0"
              bind:value={survey.distance}
            /></label
          >
          <label
            >Bearing (°)<input
              type="number"
              step="1"
              min="0"
              max="359"
              bind:value={survey.azimuth}
            /></label
          >
        </div>
        <label
          >Depth at new station (m)<input
            type="number"
            step="0.1"
            bind:value={survey.depth}
          /></label
        >
        <button type="button" class="dl-btn dl-btn-solid dl-btn-sm" onclick={addShot}
          >Add station</button
        >
        <p class="muted">
          Compass bearings are true to the drawing's north ({map.north}°). Each shot becomes a
          station and a surveyed line with its distance and azimuth stored.
        </p>
      {:else if node}
        <h3>
          {node.type === 'object' ? 'Object' : 'Station'} <span class="dl-num">{node.id}</span>
        </h3>
        <label>
          Type
          <select
            value={node.type}
            onchange={(e) => patchNode({ type: e.currentTarget.value as NodeType })}
          >
            {#each nodeTypes as t (t.type)}
              <option value={t.type} title={t.hint}>{t.label}</option>
            {/each}
          </select>
        </label>
        {#if node.type === 'object'}
          <div class="field">
            <span>Object</span>
            <ObjectPicker
              compact
              value={node.object_kind ?? 'other'}
              onchange={(kind) => patchNode({ object_kind: kind })}
            />
          </div>
          <label class="row">
            Colour
            <input
              type="color"
              value={node.color ?? '#94a3b8'}
              oninput={(e) => patchNode({ color: e.currentTarget.value })}
            />
            {#if node.color}
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                onclick={() => patchNode({ color: null })}>default</button
              >
            {/if}
          </label>
        {/if}
        <label>
          Label
          <input
            type="text"
            value={node.label}
            maxlength="80"
            onchange={(e) => patchNode({ label: e.currentTarget.value })}
          />
        </label>
        <label>
          Depth (m)
          <input
            type="number"
            step="0.1"
            value={node.depth ?? ''}
            onchange={(e) => patchNode({ depth: numberOrNull(e.currentTarget.value) })}
          />
        </label>
        <div class="xy">
          <label>
            East (m)
            <input
              type="number"
              step="0.5"
              value={node.x}
              onchange={(e) => patchNode({ x: Number(e.currentTarget.value) })}
            />
          </label>
          <label>
            South (m)
            <input
              type="number"
              step="0.5"
              value={node.y}
              onchange={(e) => patchNode({ y: Number(e.currentTarget.value) })}
            />
          </label>
        </div>
        {#if map.kind === 'stickmap'}
          <div class="xy">
            <label>
              Left (m)
              <input
                type="number"
                step="0.5"
                min="0"
                value={node.left ?? ''}
                placeholder="passage"
                onchange={(e) => patchNode({ left: numberOrNull(e.currentTarget.value) })}
              />
            </label>
            <label>
              Right (m)
              <input
                type="number"
                step="0.5"
                min="0"
                value={node.right ?? ''}
                placeholder="width"
                onchange={(e) => patchNode({ right: numberOrNull(e.currentTarget.value) })}
              />
            </label>
          </div>
        {/if}
      {:else if edge}
        <h3>Line <span class="dl-num">{edge.from} → {edge.to}</span></h3>
        <div class="xy">
          <label>
            Distance (m)
            <input
              type="number"
              step="0.1"
              value={edge.distance ?? ''}
              placeholder="drawn length"
              onchange={(e) => patchEdge({ distance: numberOrNull(e.currentTarget.value) })}
            />
          </label>
          <label>
            Azimuth (°)
            <input
              type="number"
              step="1"
              min="0"
              max="359"
              value={edge.azimuth ?? ''}
              onchange={(e) => patchEdge({ azimuth: numberOrNull(e.currentTarget.value) })}
            />
          </label>
        </div>
        <label>
          Style
          <select
            value={edge.style}
            onchange={(e) => patchEdge({ style: e.currentTarget.value as MapEdge['style'] })}
          >
            {#each edgeStylesFor(map.kind) as s (s.style)}<option value={s.style}>{s.label}</option
              >{/each}
          </select>
        </label>
        <label>
          Note
          <input
            type="text"
            value={edge.note}
            maxlength="120"
            placeholder="e.g. silty, low, arrows point out"
            onchange={(e) => patchEdge({ note: e.currentTarget.value })}
          />
        </label>
      {:else if line}
        <h3>
          {LINE_KINDS.find((k) => k.kind === line.kind)?.label}
          <span class="dl-num">{line.id}</span>
        </h3>
        <label>
          Kind
          <select
            value={line.kind}
            onchange={(e) => patchLine({ kind: e.currentTarget.value as LineKind })}
          >
            {#each LINE_KINDS as l (l.kind)}<option value={l.kind}>{l.label}</option>{/each}
          </select>
        </label>
        <label>
          Label
          <input
            type="text"
            value={line.label}
            maxlength="80"
            placeholder={line.kind === 'path' ? 'e.g. the classic loop' : ''}
            onchange={(e) => patchLine({ label: e.currentTarget.value })}
          />
        </label>
        <label>
          Depth (m)
          <input
            type="number"
            step="0.1"
            value={line.depth ?? ''}
            placeholder={line.kind === 'depth' ? 'depth of this contour' : 'optional'}
            onchange={(e) => patchLine({ depth: numberOrNull(e.currentTarget.value) })}
          />
        </label>
        <label class="row">
          <input
            type="checkbox"
            checked={line.closed}
            onchange={(e) => patchLine({ closed: e.currentTarget.checked })}
          /> closed loop
        </label>
        <p class="muted">
          {line.points.length} points · {Math.round(lineLength(line))} m. Drag the handles to reshape.
        </p>
      {:else if area}
        <h3>Area <span class="dl-num">{area.id}</span></h3>
        <label>
          Kind
          <select
            value={area.kind}
            onchange={(e) => patchArea({ kind: e.currentTarget.value as AreaKind })}
          >
            {#each AREA_KINDS as a (a.kind)}<option value={a.kind}>{a.label}</option>{/each}
          </select>
        </label>
        <label>
          Label
          <input
            type="text"
            value={area.label}
            maxlength="80"
            onchange={(e) => patchArea({ label: e.currentTarget.value })}
          />
        </label>
        <label>
          Depth (m)
          <input
            type="number"
            step="0.1"
            value={area.depth ?? ''}
            placeholder={area.kind === 'depth' ? 'shallow edge of the band' : 'optional'}
            onchange={(e) => patchArea({ depth: numberOrNull(e.currentTarget.value) })}
          />
        </label>
        <p class="muted">{area.points.length} corners. Delete and redraw to change the shape.</p>
      {:else}
        <h3>{map.title || defaultTitle(map.kind)}</h3>
        <p class="muted">{mapSummary(map)}</p>
        <p class="muted">
          Select a station, a line, a contour or an area to edit it. Coordinates are metres in plan
          view; the compass follows the north bearing below.
        </p>
      {/if}

      <details class="section" open={!node && !edge && !line && !area}>
        <summary>Map</summary>
        <label>
          North (&deg;)
          <input
            type="number"
            step="1"
            min="0"
            max="359"
            value={map.north}
            onchange={(e) => commit({ ...map, north: numberOrNull(e.currentTarget.value) ?? 0 })}
          />
        </label>
        <div class="xy">
          <label>
            Origin lat
            <input
              type="number"
              step="any"
              value={map.origin?.lat ?? ''}
              placeholder="of (0, 0)"
              onchange={(e) => {
                const lat = numberOrNull(e.currentTarget.value);
                commit({
                  ...map,
                  origin: lat === null ? null : { lat, lon: map.origin?.lon ?? 0 },
                });
              }}
            />
          </label>
          <label>
            Origin lon
            <input
              type="number"
              step="any"
              value={map.origin?.lon ?? ''}
              onchange={(e) => {
                const lon = numberOrNull(e.currentTarget.value);
                commit({
                  ...map,
                  origin: lon === null ? null : { lat: map.origin?.lat ?? 0, lon },
                });
              }}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            rows="3"
            value={map.notes}
            maxlength="2000"
            onchange={(e) => commit({ ...map, notes: e.currentTarget.value })}
          ></textarea>
        </label>
      </details>

      {#if underlays.length}
        <details class="section" open={!!map.underlay}>
          <summary>Trace over</summary>
          <label>
            Underlay
            <select
              value={map.underlay?.ref ?? ''}
              onchange={(e) => chooseUnderlay(e.currentTarget.value)}
            >
              <option value="">— none —</option>
              {#each underlays as u (u.ref)}<option value={u.ref}>{u.label}</option>{/each}
            </select>
          </label>
          {#if map.underlay}
            <div class="xy">
              <label
                >Scale (m/px)<input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={map.underlay.scale}
                  onchange={(e) => patchUnderlay({ scale: Number(e.currentTarget.value) || 0.1 })}
                /></label
              >
              <label
                >Rotation (°)<input
                  type="number"
                  step="1"
                  value={map.underlay.rotation}
                  onchange={(e) => patchUnderlay({ rotation: Number(e.currentTarget.value) || 0 })}
                /></label
              >
            </div>
            <div class="xy">
              <label
                >Shift east (m)<input
                  type="number"
                  step="1"
                  value={map.underlay.dx}
                  onchange={(e) => patchUnderlay({ dx: Number(e.currentTarget.value) || 0 })}
                /></label
              >
              <label
                >Shift south (m)<input
                  type="number"
                  step="1"
                  value={map.underlay.dy}
                  onchange={(e) => patchUnderlay({ dy: Number(e.currentTarget.value) || 0 })}
                /></label
              >
            </div>
            <label
              >Opacity<input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={map.underlay.opacity}
                oninput={(e) => patchUnderlay({ opacity: Number(e.currentTarget.value) })}
              /></label
            >
            <p class="muted">
              The underlay is a tracing aid only — it is never part of the published drawing, so a
              copyrighted map is fine to trace over.
            </p>
          {/if}
        </details>
      {/if}
    </aside>
  </div>

  {#if showJson}
    <div class="json">
      <textarea rows="10" bind:value={jsonText} spellcheck="false"></textarea>
      {#if jsonError}<p class="error">{jsonError}</p>{/if}
      <div class="json-actions">
        <button type="button" class="dl-btn dl-btn-solid dl-btn-sm" onclick={applyJson}
          >Apply JSON</button
        >
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm"
          onclick={() => (showJson = false)}>Close</button
        >
        <span class="muted">Paste a map exported from survey software, or copy this one out.</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* The editor lives on the public site too, so it brings its own form styling. */
  .editor label,
  .editor .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
    color: var(--dl-color-text-muted);
  }
  .editor input,
  .editor select,
  .editor textarea {
    font: inherit;
    font-size: 14px;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius-sm);
    padding: 6px 8px;
    width: 100%;
  }
  .editor input[type='checkbox'],
  .editor input[type='range'] {
    width: auto;
  }
  .meta {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .meta label {
    min-width: 160px;
  }
  .meta .grow {
    flex: 1;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .tools {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .inline {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .inline select {
    width: auto;
    padding: 4px 8px;
  }
  .inline input[type='checkbox'],
  .row input[type='checkbox'] {
    width: auto;
  }
  .row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .canvas-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 16px;
    align-items: start;
  }
  .hint {
    font-size: 13px;
    color: var(--dl-color-text-muted);
    margin: 8px 0 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-surface);
  }
  .panel h3 {
    font-size: 15px;
    margin: 0;
  }
  .section {
    border-top: 1px solid var(--dl-color-border);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section summary {
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    cursor: pointer;
  }
  .xy {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: 13px;
    margin: 0;
  }
  .danger:hover {
    border-color: var(--dl-color-error);
    color: var(--dl-color-error);
  }
  .json textarea {
    font-family: var(--dl-font-mono);
    font-size: 12.5px;
    width: 100%;
  }
  .json-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .error {
    color: var(--dl-color-error);
    font-size: 13px;
  }
  @media (max-width: 760px) {
    .canvas-row {
      grid-template-columns: 1fr;
    }
  }
</style>
