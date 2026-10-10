<script lang="ts" module>
  /** A picture the editor can trace over: a sketch, a reference map or an upload. */
  export type UnderlayOption = { ref: string; label: string; href: string };

  /** The `localStorage` key of the "Enable single-key shortcuts" switch. */
  export const SHORTCUTS_KEY = 'dl-map-editor-shortcuts';

  /** Whether single-key shortcuts are on (the default) for this browser. */
  export function readShortcutsSetting(): boolean {
    try {
      return localStorage.getItem(SHORTCUTS_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  /** Remember the shortcuts switch; storage may be unavailable, the setting then lasts the page. */
  export function writeShortcutsSetting(on: boolean): void {
    try {
      localStorage.setItem(SHORTCUTS_KEY, on ? 'on' : 'off');
    } catch {
      // private mode or blocked storage
    }
  }
</script>

<script lang="ts">
  import SiteMapView from '$lib/components/dive/SiteMapView.svelte';
  import ObjectPicker from './ObjectPicker.svelte';
  import Toolbar, { type ToolItem } from '$lib/components/ui/Toolbar.svelte';
  import Popover from '$lib/components/ui/Popover.svelte';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import { getDivelog } from '$lib/core/dive/context';
  import {
    locatorFrame,
    moveUnderlay,
    rescaleUnderlay,
    rotateUnderlay,
    underlayCentre,
  } from '$lib/core/map/trace';
  import { renderLocatorImage, LocatorImageError, type TileSource } from './locator-image';
  import { tick } from 'svelte';
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
    moveAreaPoint,
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

  const { urls } = getDivelog();

  let {
    value,
    underlays = [],
    onChange,
    tiles = { indexUrl: urls.tiles('index.json'), tilesBase: urls.tilesBase },
    renderLocator = renderLocatorImage,
  }: {
    value: SiteMap;
    /** Maps that can be traced over: sketches, reference maps, uploads. */
    underlays?: UnderlayOption[];
    onChange: (map: SiteMap) => void;
    /** Where the locator tiles live; the dive log's own by default. */
    tiles?: TileSource;
    /** Draws the locator picture; replaceable for tests. */
    renderLocator?: typeof renderLocatorImage;
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

  let shortcutsOn = $state(readShortcutsSetting());
  let canvasFocus = $state(false);
  let helpOpen = $state(false);
  let sheetOpen = $state(true);
  let canvasEl = $state<HTMLDivElement>();

  let aligning = $state(false);
  let measure = $state<MapPoint[] | null>(null);
  let measureDistance = $state('');
  let underlaySize = $state<{ w: number; h: number } | null>(null);

  type Locator = {
    href: string;
    scale: number;
    dx: number;
    dy: number;
    rotation: number;
    width: number;
    height: number;
    zoom: number;
  };
  let locator = $state<Locator | null>(null);
  let locatorOpacity = $state(0.6);
  let locatorShown = $state(true);
  let locatorBusy = $state(false);
  let locatorError = $state('');
  let locatorAttribution = $state('');
  let locatorZoom = $state<number | null>(null);

  type Menu = { kind: 'node' | 'line' | 'area' | 'edge' | 'canvas'; x: number; y: number };
  let menu = $state<Menu | null>(null);
  let menuEl = $state<HTMLDivElement>();

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
  const hasSelection = $derived(!!(selectedNode || selectedEdge || selectedArea || selectedLine));
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
  const locatorLayer = $derived(
    locator && locatorShown ? { ...locator, opacity: locatorOpacity } : null,
  );

  $effect(() => {
    const href = underlayHref;
    underlaySize = null;
    if (!href || typeof Image === 'undefined') return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight)
        underlaySize = { w: img.naturalWidth, h: img.naturalHeight };
    };
    img.src = href;
    return () => {
      img.onload = null;
    };
  });

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

  function setTool(next: string) {
    tool = next as Tool;
    if (tool !== 'area' && tool !== 'line') draft = [];
  }

  function onCanvasClick(x: number, y: number) {
    menu = null;
    if (measure) {
      measure = measure.length >= 2 ? [{ x, y }] : [...measure, { x, y }];
      if (measure.length === 2) tick().then(() => document.getElementById(distanceId)?.focus());
      return;
    }
    if (aligning) return;
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

  /** Follow a drag live; on release, record one undo step from where it started. */
  function dragTo(next: SiteMap, done: boolean) {
    if (!dragStart) dragStart = map;
    if (done) {
      const start = dragStart;
      dragStart = null;
      history = [...history.slice(-49), start];
      map = next;
      onChange(next);
    } else {
      map = next;
    }
  }

  function onNodeMove(id: string, x: number, y: number, done: boolean) {
    dragTo(moveNode(map, id, snap(x, grid), snap(y, grid)), done);
    if (done) selectedNode = id;
  }

  function onLinePointMove(id: string, index: number, x: number, y: number, done: boolean) {
    dragTo(moveLinePoint(map, id, index, snap(x, grid), snap(y, grid)), done);
  }

  function onAreaPointMove(id: string, index: number, x: number, y: number, done: boolean) {
    dragTo(moveAreaPoint(map, id, index, snap(x, grid), snap(y, grid)), done);
  }

  function onUnderlayMove(dx: number, dy: number, done: boolean) {
    const start = dragStart ?? map;
    if (!start.underlay) return;
    dragTo({ ...map, underlay: moveUnderlay(start.underlay, dx, dy) }, done);
  }

  function onUnderlayRotate(rotation: number, done: boolean) {
    const start = dragStart ?? map;
    if (!start.underlay || !underlaySize) return;
    const pivot = underlayCentre(start.underlay, underlaySize);
    dragTo({ ...map, underlay: rotateUnderlay(start.underlay, Math.round(rotation), pivot) }, done);
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
    aligning = false;
    measure = null;
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

  const uid = $props.id();
  const distanceId = `dl-map-${uid}-distance`;

  function startMeasure() {
    aligning = false;
    measure = [];
    measureDistance = '';
    showUnderlay = true;
  }

  function applyMeasure() {
    if (!map.underlay || !measure || measure.length < 2) return;
    const next = rescaleUnderlay(map.underlay, measure[0], measure[1], Number(measureDistance));
    if (!next) return;
    commit({ ...map, underlay: next });
    measure = null;
    measureDistance = '';
  }

  async function traceLocator() {
    const frame = locatorFrame(map, locatorZoom === null ? {} : { zoom: locatorZoom });
    if (!frame) return;
    locatorBusy = true;
    locatorError = '';
    try {
      const image = await renderLocator(frame, tiles);
      locator = {
        href: image.href,
        ...frame.placement,
        width: frame.width,
        height: frame.height,
        zoom: frame.zoom,
      };
      locatorZoom = frame.zoom;
      locatorShown = true;
      locatorAttribution = image.attribution.replace(/<[^>]*>/g, '').trim();
    } catch (err) {
      locatorError =
        err instanceof LocatorImageError ? err.message : 'The locator map could not be drawn';
    } finally {
      locatorBusy = false;
    }
  }

  function numberOrNull(value: string): number | null {
    return value.trim() === '' ? null : Number(value);
  }

  const TOOL_KEYS: Record<string, Tool> = {
    a: 'add',
    c: 'connect',
    m: 'move',
    r: 'area',
    l: 'line',
    o: 'object',
    s: 'survey',
  };

  function isField(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName);
  }

  /** Undo works anywhere in the editor except in a text field, which has its own. */
  function onEditorKey(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
    const el = e.target as HTMLElement | null;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    e.preventDefault();
    undo();
  }

  /** Drawing keys, live only while the canvas has focus; letters only with the switch on. */
  function onCanvasKey(e: KeyboardEvent) {
    if (menu && e.key === 'Escape') {
      e.preventDefault();
      menu = null;
      canvasEl?.focus({ preventScroll: true });
      return;
    }
    if (isField(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (measure?.length) measure = measure.slice(0, -1);
      else if (draft.length) draft = draft.slice(0, -1);
      else deleteSelection();
      return;
    }
    if (e.key === 'Enter' && draft.length) {
      e.preventDefault();
      finishDraft();
      return;
    }
    if (e.key === 'Escape') {
      if (menu) menu = null;
      else if (measure) measure = null;
      else if (aligning) aligning = false;
      else {
        draft = [];
        clearSelection();
      }
      return;
    }
    if (!shortcutsOn || e.key.length !== 1) return;
    const key = e.key.toLowerCase();
    const next = TOOL_KEYS[key];
    if (next && tools.some((t) => t.tool === next && t.kinds.includes(map.kind))) {
      e.preventDefault();
      setTool(next);
    } else if (key === 'u') {
      e.preventDefault();
      showUnderlay = !showUnderlay;
    } else if (e.key === '?') {
      e.preventDefault();
      helpOpen = true;
    }
  }

  function onCanvasPointerDown() {
    if (canvasEl && !canvasEl.contains(document.activeElement))
      canvasEl.focus({ preventScroll: true });
  }

  function onCanvasFocusOut(e: FocusEvent) {
    if (!canvasEl?.contains(e.relatedTarget as Node | null)) canvasFocus = false;
  }

  function toggleShortcuts(on: boolean) {
    shortcutsOn = on;
    writeShortcutsSetting(on);
  }

  function onLongPress(
    target: { kind: Menu['kind']; id?: string },
    _at: MapPoint,
    client: { x: number; y: number },
  ) {
    if (target.kind !== 'canvas' && target.id) {
      clearSelection();
      if (target.kind === 'node') selectedNode = target.id;
      else if (target.kind === 'line') selectedLine = target.id;
      else if (target.kind === 'area') selectedArea = target.id;
      else {
        const [from, to] = target.id.split('|');
        selectedEdge = { from, to };
      }
    }
    const box = canvasEl?.getBoundingClientRect();
    menu = {
      kind: target.kind,
      x: Math.max(0, client.x - (box?.left ?? 0)),
      y: Math.max(0, client.y - (box?.top ?? 0)),
    };
    tick().then(() => menuEl?.querySelector<HTMLButtonElement>('button')?.focus());
  }

  function menuAction(action: () => void) {
    action();
    menu = null;
    canvasEl?.focus({ preventScroll: true });
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

  async function clear() {
    if (
      !(await confirmDialog({
        title: 'Remove everything on this map?',
        body: 'Stations, lines and areas go; Undo brings them back.',
        confirmLabel: 'Remove everything',
        danger: true,
      }))
    )
      return;
    commit({ ...map, nodes: [], edges: [], areas: [], lines: [] });
    draft = [];
    clearSelection();
  }

  const tools: { tool: Tool; label: string; title: string; key: string; kinds: MapKind[] }[] = [
    {
      tool: 'add',
      label: 'Station',
      title: 'Click the canvas to add a station linked to the selected one',
      key: 'A',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'survey',
      label: 'Survey',
      title: 'Type distance, bearing and depth to place the next station from the selected one',
      key: 'S',
      kinds: ['stickmap'],
    },
    {
      tool: 'connect',
      label: 'Connect',
      title: 'Click two stations to add or remove the line between them',
      key: 'C',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'move',
      label: 'Move',
      title: 'Drag things, click things to edit them',
      key: 'M',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'line',
      label: 'Line',
      title: 'Click points of a shoreline, depth contour or dive path; Enter to finish',
      key: 'L',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'area',
      label: 'Area',
      title:
        'Click corners of a shore, wreck or shallows; click the first point or press Enter to close',
      key: 'R',
      kinds: ['stickmap', 'sitemap'],
    },
    {
      tool: 'object',
      label: 'Object',
      title: 'Click to drop a bus, wipkip, platform or other object',
      key: 'O',
      kinds: ['sitemap', 'stickmap'],
    },
  ];

  const toolItems = $derived<ToolItem[]>(
    tools
      .filter((t) => t.kinds.includes(map.kind))
      .map((t) => ({
        value: t.tool,
        label: t.label,
        hint: t.title,
        shortcut: shortcutsOn ? t.key : undefined,
      })),
  );

  const SHORTCUTS: [string, string][] = [
    ['A S C M L R O', 'Station, Survey, Connect, Move, Line, Area, Object tool'],
    ['U', 'Show or hide the underlay'],
    ['?', 'This list'],
  ];
  const ALWAYS: [string, string][] = [
    ['Delete, Backspace', 'Remove the selection, or the last point of a shape'],
    ['Enter', 'Finish the line or area being drawn'],
    ['Escape', 'Cancel drawing, measuring or aligning; clear the selection'],
    ['Ctrl/⌘ Z', 'Undo'],
    ['+ − [ ] 0, arrows', 'Zoom, rotate, reset and pan the view (map focused)'],
  ];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor" onkeydown={onEditorKey}>
  <div class="meta">
    <label>
      Kind
      <select
        value={map.kind}
        onchange={(e) => commit({ ...map, kind: e.currentTarget.value as MapKind })}
      >
        {#each MAP_KINDS as k (k.kind)}<option value={k.kind}>{k.label}</option>{/each}
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
    <Toolbar
      items={toolItems}
      bind:value={tool}
      label="Drawing tool"
      showShortcuts={shortcutsOn}
      class="tools"
      onchange={setTool}
    />
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
          {#each LINE_KINDS as l (l.kind)}<option value={l.kind}>{l.label}</option>{/each}
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
    {#if map.underlay || locator}
      <label class="inline"
        ><input type="checkbox" bind:checked={showUnderlay} /> underlay{#if shortcutsOn}
          <kbd>U</kbd>{/if}</label
      >
    {/if}
    <span class="spacer"></span>
    <span class="tool-actions">
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
        disabled={!hasSelection}>Delete</button
      >
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={openJson}>JSON</button>
      <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm danger" onclick={clear}
        >Clear</button
      >
      <span class="help-wrap">
        <Popover bind:open={helpOpen} label="Keyboard shortcuts" focus="first" class="help">
          {#snippet trigger(props)}
            <button {...props} class="dl-btn dl-btn-ghost dl-btn-sm" aria-label="Keyboard shortcuts"
              >?</button
            >
          {/snippet}
          <label class="switch">
            <input
              type="checkbox"
              role="switch"
              checked={shortcutsOn}
              onchange={(e) => toggleShortcuts(e.currentTarget.checked)}
            />
            Enable single-key shortcuts
          </label>
          <p class="muted">
            Shortcuts work while the drawing canvas has focus (click or Tab to it).
          </p>
          <dl class="keys">
            {#each shortcutsOn ? [...SHORTCUTS, ...ALWAYS] : ALWAYS as [k, what] (k)}
              <dt><kbd>{k}</kbd></dt>
              <dd>{what}</dd>
            {/each}
          </dl>
        </Popover>
      </span>
    </span>
  </div>

  <div class="canvas-row">
    <div class="canvas">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="canvas-focus"
        class:focused={canvasFocus}
        bind:this={canvasEl}
        tabindex="0"
        role="group"
        aria-label="Drawing canvas"
        aria-describedby="{distanceId}-hint"
        onkeydown={onCanvasKey}
        onfocusin={() => (canvasFocus = true)}
        onfocusout={onCanvasFocusOut}
        onpointerdowncapture={onCanvasPointerDown}
      >
        <SiteMapView
          {map}
          editable
          {selection}
          draft={measure ?? draft}
          {underlayHref}
          {showUnderlay}
          locator={showUnderlay ? locatorLayer : null}
          alignUnderlay={aligning}
          {underlaySize}
          {onCanvasClick}
          {onNodeClick}
          {onEdgeClick}
          {onAreaClick}
          {onLineClick}
          {onNodeMove}
          {onLinePointMove}
          {onAreaPointMove}
          {onUnderlayMove}
          {onUnderlayRotate}
          {onLongPress}
        />
        {#if menu}
          <div
            class="context-menu"
            role="menu"
            aria-label="Actions"
            bind:this={menuEl}
            style:left="{menu.x}px"
            style:top="{menu.y}px"
          >
            {#if menu.kind !== 'canvas'}
              <button
                type="button"
                role="menuitem"
                onclick={() => menuAction(() => (sheetOpen = true))}>Edit details</button
              >
              <button type="button" role="menuitem" onclick={() => menuAction(deleteSelection)}
                >Delete</button
              >
            {:else}
              {#if draft.length}
                <button
                  type="button"
                  role="menuitem"
                  onclick={() => menuAction(() => finishDraft())}>Finish shape</button
                >
              {/if}
              <button
                type="button"
                role="menuitem"
                disabled={!history.length}
                onclick={() => menuAction(undo)}>Undo</button
              >
            {/if}
            <button type="button" role="menuitem" onclick={() => menuAction(() => {})}
              >Cancel</button
            >
          </div>
        {/if}
      </div>
      {#if canvasFocus && shortcutsOn}
        <p class="focus-note" aria-hidden="true">Shortcuts active · <kbd>?</kbd> lists them</p>
      {/if}
      {#if tool === 'object' && !aligning && !measure}
        <ObjectPicker value={objectKind} onchange={(kind) => (objectKind = kind)} />
      {/if}
      <p class="hint" id="{distanceId}-hint">
        {#if measure}
          {measure.length < 2
            ? `Click point ${measure.length + 1} of 2 on the underlay, two spots a known distance apart.`
            : 'Type the real distance between the two points in the panel.'}
        {:else if aligning}
          Drag to move the underlay; drag the round handle to turn it. Escape ends aligning.
        {:else if tool === 'area' || tool === 'line'}
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
          Click or tap anywhere to place the {map.kind === 'sitemap' ? 'entry point' : 'entrance'},
          then keep clicking to lay the line. Drag to move, shift-click two stations to connect
          them; on a touch screen, pinch to zoom and press and hold for actions.
        {:else if tool === 'add'}
          Adding after <strong>{node?.label || node?.id || 'nothing'}</strong>. Click a station
          first to branch from it.
        {:else if tool === 'connect'}
          {connectFrom ? `Now click the other end for ${connectFrom}.` : 'Click the first station.'}
        {:else}
          Drag stations, line points and area corners. Click a line, contour or area to edit it.
        {/if}
      </p>
    </div>

    <aside class="panel" class:closed={!sheetOpen} aria-label="Map details">
      <button
        type="button"
        class="sheet-toggle"
        aria-expanded={sheetOpen}
        onclick={() => (sheetOpen = !sheetOpen)}
        >{sheetOpen ? 'Hide details' : 'Show details'}</button
      >
      <div class="sheet-body">
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
              {#each edgeStylesFor(map.kind) as s (s.style)}<option value={s.style}
                  >{s.label}</option
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
          <p class="muted">{area.points.length} corners. Drag the corners to reshape.</p>
        {:else}
          <h3>{map.title || defaultTitle(map.kind)}</h3>
          <p class="muted">{mapSummary(map)}</p>
          <p class="muted">
            Select a station, a line, a contour or an area to edit it. Coordinates are metres in
            plan view; the compass follows the north bearing below.
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

        {#if map.origin || underlays.length}
          <details class="section" open={!!map.underlay || !!locator}>
            <summary>Trace over</summary>
            {#if map.origin}
              <div class="trace-block">
                <div class="trace-actions">
                  <button
                    type="button"
                    class="dl-btn dl-btn-ghost dl-btn-sm"
                    aria-busy={locatorBusy}
                    disabled={locatorBusy}
                    onclick={traceLocator}
                    >{locatorBusy
                      ? 'Drawing the locator map…'
                      : locator
                        ? 'Re-render the locator map'
                        : 'Trace over the locator map'}</button
                  >
                  {#if locator}
                    <label class="inline"
                      ><input type="checkbox" bind:checked={locatorShown} /> show</label
                    >
                  {/if}
                </div>
                <div class="xy">
                  <label
                    >Detail (zoom)<input
                      type="number"
                      min="10"
                      max="19"
                      step="1"
                      value={locatorZoom ?? ''}
                      placeholder="auto"
                      onchange={(e) => (locatorZoom = numberOrNull(e.currentTarget.value))}
                    /></label
                  >
                  {#if locator}
                    <label
                      >Opacity<input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        bind:value={locatorOpacity}
                      /></label
                    >
                  {/if}
                </div>
                {#if locatorError}<p class="error" role="alert">{locatorError}</p>{/if}
                <p class="muted">
                  The basemap is drawn at the map's origin, north-up and to scale, so it needs no
                  aligning. It stays in this browser and is never saved.
                </p>
                {#if locatorAttribution}<p class="muted">Basemap {locatorAttribution}</p>{/if}
              </div>
            {/if}
            {#if underlays.length}
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
            {/if}
            {#if map.underlay && underlayHref}
              <div class="trace-actions">
                <button
                  type="button"
                  class="dl-btn dl-btn-sm"
                  class:dl-btn-solid={aligning}
                  class:dl-btn-ghost={!aligning}
                  aria-pressed={aligning}
                  onclick={() => {
                    aligning = !aligning;
                    measure = null;
                    showUnderlay = true;
                  }}>Drag to align</button
                >
                <button
                  type="button"
                  class="dl-btn dl-btn-sm"
                  class:dl-btn-solid={!!measure}
                  class:dl-btn-ghost={!measure}
                  aria-pressed={!!measure}
                  onclick={() => (measure ? (measure = null) : startMeasure())}
                  >Scale by two points</button
                >
              </div>
              {#if measure}
                <div class="measure">
                  <label for={distanceId}>Distance between the points (m)</label>
                  <div class="measure-row">
                    <input
                      id={distanceId}
                      type="number"
                      min="0"
                      step="0.1"
                      bind:value={measureDistance}
                      disabled={measure.length < 2}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyMeasure();
                        }
                      }}
                    />
                    <button
                      type="button"
                      class="dl-btn dl-btn-solid dl-btn-sm"
                      disabled={measure.length < 2 || !(Number(measureDistance) > 0)}
                      onclick={applyMeasure}>Apply scale</button
                    >
                  </div>
                  <p class="muted">
                    {measure.length < 2
                      ? `Click ${2 - measure.length} more point${measure.length === 1 ? '' : 's'} on the canvas.`
                      : 'The first point stays put; the underlay grows or shrinks around it.'}
                  </p>
                </div>
              {/if}
            {/if}
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
                    onchange={(e) =>
                      patchUnderlay({ rotation: Number(e.currentTarget.value) || 0 })}
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
      </div>
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
  .editor .inline {
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
  .editor .row {
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
  .tool-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .toolbar {
    position: relative;
  }
  .help-wrap :global(.help) {
    min-width: min(360px, calc(100vw - 32px));
  }
  .switch {
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
    font-size: var(--dl-text-md) !important;
    color: var(--dl-color-text) !important;
    margin-bottom: 6px;
  }
  .keys {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 8px 0 0;
    font-size: var(--dl-text-sm);
  }
  .keys dt {
    white-space: nowrap;
  }
  .keys dd {
    margin: 0;
    color: var(--dl-color-text-muted);
  }
  kbd {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-xs);
    padding: 0 4px;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: 4px;
    color: var(--dl-color-text-muted);
  }
  .canvas-focus {
    position: relative;
    border-radius: var(--dl-radius);
  }
  .canvas-focus:focus-visible {
    outline: var(--dl-focus-ring);
    outline-offset: 2px;
  }
  .canvas-focus.focused {
    box-shadow: 0 0 0 1px var(--dl-color-accent);
  }
  .focus-note {
    margin: 6px 0 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .context-menu {
    position: absolute;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 4px;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    box-shadow: var(--dl-shadow-md);
  }
  .context-menu button {
    min-height: 44px;
    padding: 0 12px;
    text-align: left;
    font: inherit;
    font-size: var(--dl-text-md);
    color: var(--dl-color-text);
    background: none;
    border: 0;
    border-radius: var(--dl-radius-sm);
    cursor: pointer;
  }
  .context-menu button:hover,
  .context-menu button:focus-visible {
    background: var(--dl-color-accent-soft);
  }
  .context-menu button:disabled {
    color: var(--dl-color-text-faint);
    cursor: not-allowed;
  }
  .sheet-toggle {
    display: none;
  }
  .sheet-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .trace-block,
  .measure {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .trace-actions,
  .measure-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .measure-row input {
    flex: 1 1 100px;
  }
  @media (max-width: 700px) {
    .canvas-row {
      grid-template-columns: 1fr;
    }
    .toolbar {
      order: 3;
      position: sticky;
      bottom: 0;
      z-index: 4;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding: 8px 0;
      background: var(--dl-color-bg-elevated);
      border-top: 1px solid var(--dl-color-border);
    }
    .toolbar :global(.tools),
    .tool-actions {
      flex-wrap: nowrap;
    }
    .help-wrap :global(.help) {
      position: fixed;
      left: 16px;
      right: 16px;
      top: auto;
      bottom: 72px;
      min-width: 0;
      max-width: none;
    }
    .toolbar :global(.dl-tool),
    .toolbar .dl-btn {
      min-height: 44px;
      min-width: 44px;
      flex: 0 0 auto;
    }
    .canvas-row {
      order: 2;
    }
    .json {
      order: 4;
    }
    .panel {
      max-height: 55vh;
      overflow: auto;
      padding: 0 14px 14px;
    }
    .sheet-toggle {
      display: block;
      position: sticky;
      top: 0;
      z-index: 1;
      width: calc(100% + 28px);
      margin: 0 -14px;
      min-height: 44px;
      font: inherit;
      font-size: var(--dl-text-md);
      color: var(--dl-color-text);
      background: var(--dl-color-surface-2);
      border: 0;
      border-bottom: 1px solid var(--dl-color-border);
      cursor: pointer;
    }
    .panel.closed .sheet-body {
      display: none;
    }
  }
</style>
