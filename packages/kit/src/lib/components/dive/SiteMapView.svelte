<script lang="ts">
  import MapGlyph from './MapGlyph.svelte';
  import {
    depthLabel,
    edgeEndpoints,
    edgeKey,
    edgeLength,
    depthFill,
    mapBounds,
    maxDepth,
    orderedAreas,
    lineLength,
    type DiveMapPin,
    type MapArea,
    type MapEdge,
    type MapEdgeRef,
    type LegPhase,
    legPhases,
    type MapLine,
    type MapNode,
    type MapPoint,
    type SiteMap,
  } from '$lib/core/dive/sitemap';
  import {
    IDENTITY,
    angleOf,
    isIdentity,
    pan,
    pinch,
    rotateAt,
    toSvgTransform,
    visibleBox,
    zoomAt,
    zoomOf,
    type Point,
    type View,
  } from '$lib/core/map/viewport';

  type Selection = {
    node?: string;
    edge?: { from: string; to: string };
    area?: string;
    line?: string;
    pin?: string;
  } | null;

  let {
    map,
    title = 'Site map',
    selection = null,
    editable = false,
    draft = [],
    route = null,
    legs = [],
    path = [],
    pathTurn = null,
    turn = null,
    pins = [],
    onCanvasClick,
    onNodeClick,
    onEdgeClick,
    onAreaClick,
    onLineClick,
    onPinClick,
    onNodeMove,
    onLinePointMove,
    underlayHref = null,
    showUnderlay = false,
  }: {
    map: SiteMap;
    title?: string;
    selection?: Selection;
    editable?: boolean;
    draft?: MapPoint[];
    /** Resolved image URL for `map.underlay.ref`; shown only while editing. */
    underlayHref?: string | null;
    showUnderlay?: boolean;
    /** Edge keys of the legs a dive covered; when set, everything else is dimmed. */
    route?: Set<string> | null;
    /** The legs in swim order, for direction arrows; a leg swum both ways gets two. */
    legs?: MapEdgeRef[];
    /** A free-drawn track (site maps), and the index of the point where the dive turned. */
    path?: MapPoint[];
    pathTurn?: number | null;
    turn?: string | null;
    pins?: DiveMapPin[];
    onCanvasClick?: (x: number, y: number) => void;
    onNodeClick?: (id: string, shift: boolean) => void;
    onEdgeClick?: (edge: MapEdge) => void;
    onAreaClick?: (area: MapArea) => void;
    onLineClick?: (line: MapLine) => void;
    onPinClick?: (pin: DiveMapPin) => void;
    onNodeMove?: (id: string, x: number, y: number, done: boolean) => void;
    onLinePointMove?: (id: string, index: number, x: number, y: number, done: boolean) => void;
  } = $props();

  let clientWidth = $state(0);
  let clientHeight = $state(0);
  let frame = $state<HTMLDivElement>();
  let fullscreen = $state(false);
  let canFullscreen = $state(false);
  const extent = $derived(mapBounds(map, 0));
  const box = $derived(
    mapBounds(map, Math.max(10, Math.min(30, (extent.maxX - extent.minX) * 0.12))),
  );
  const width = $derived(box.maxX - box.minX);
  const height = $derived(box.maxY - box.minY);
  // The view the reader has panned, zoomed and rotated to, on top of the home frame.
  let view = $state<View>(IDENTITY);
  const zoom = $derived(zoomOf(view));
  const rotation = $derived(angleOf(view));
  const moved = $derived(!isIdentity(view));
  // One CSS pixel in map units, so glyphs and text keep a fixed on-screen size
  // however large the site is and however far in the reader zooms.
  // Full screen letterboxes the drawing, so the tighter of the two axes sets the scale.
  const k = $derived(
    (clientWidth > 0
      ? Math.max(width / clientWidth, fullscreen && clientHeight > 0 ? height / clientHeight : 0)
      : width / 800) / zoom,
  );
  const aspect = $derived(Math.min(2.2, Math.max(1.1, width / height)));
  // Compass and scale bar live in the home frame, outside the zoomed group.
  const hk = $derived(k * zoom);
  const visible = $derived(visibleBox(view, box));
  const visibleWidth = $derived(Math.min(visible.maxX - visible.minX, visible.maxY - visible.minY));
  const gridStep = $derived(
    visibleWidth > 800
      ? 100
      : visibleWidth > 400
        ? 50
        : visibleWidth > 150
          ? 20
          : visibleWidth > 60
            ? 10
            : visibleWidth > 25
              ? 5
              : visibleWidth > 10
                ? 2
                : 1,
  );
  const gridLines = $derived.by(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = Math.ceil(visible.minX / gridStep) * gridStep; x <= visible.maxX; x += gridStep)
      xs.push(x);
    for (let y = Math.ceil(visible.minY / gridStep) * gridStep; y <= visible.maxY; y += gridStep)
      ys.push(y);
    return { xs, ys };
  });

  let svg = $state<SVGSVGElement>();
  let content = $state<SVGGElement>();
  let active = $state(false);
  let hint = $state('');
  let hintTimer: ReturnType<typeof setTimeout> | undefined;

  function showHint(text: string) {
    hint = text;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (hint = ''), 1400);
  }

  /** A client position in the SVG's own (home frame) coordinates. */
  function toView(clientX: number, clientY: number): Point {
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function centre(): Point {
    return { x: box.minX + width / 2, y: box.minY + height / 2 };
  }

  export function zoomIn(factor = 1.5) {
    view = zoomAt(view, centre(), factor);
  }
  export function zoomOut(factor = 1.5) {
    view = zoomAt(view, centre(), 1 / factor);
  }
  export function rotate(degrees: number) {
    view = rotateAt(view, centre(), degrees);
  }
  export function resetView() {
    view = IDENTITY;
  }

  $effect(() => {
    const el = frame;
    if (!el) return;
    canFullscreen =
      typeof el.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
    const sync = () => (fullscreen = document.fullscreenElement === el);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  });

  function toggleFullscreen() {
    if (!frame) return;
    const request = fullscreen ? document.exitFullscreen() : frame.requestFullscreen();
    request?.catch(() => {});
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  function onWheel(e: WheelEvent) {
    // A trackpad pinch arrives as a wheel event with ctrlKey set. A plain scroll
    // only zooms once the reader has clicked the map, so the page keeps scrolling.
    const pinching = e.ctrlKey || e.metaKey;
    if (!pinching && !active) {
      showHint(
        isMac
          ? 'Click the map, then scroll or pinch to zoom'
          : 'Click the map, then scroll to zoom',
      );
      return;
    }
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-delta * (pinching ? 0.01 : 0.002));
    view = zoomAt(view, toView(e.clientX, e.clientY), factor);
  }

  const pointers: Record<number, Point> = {};
  let panning: { moved: boolean } | null = null;
  let panned = false;

  function viewDown(e: PointerEvent) {
    // Stop the browser starting a text selection or moving focus on a drag;
    // keyboard users still reach the map with Tab.
    if (e.button === 0) e.preventDefault();
    active = true;
    pointers[e.pointerId] = toView(e.clientX, e.clientY);
    if (Object.keys(pointers).length === 1 && (e.button === 0 || e.button === 1)) {
      panning = { moved: false };
      panned = false;
    }
  }

  function viewMove(e: PointerEvent) {
    if (drag) {
      nodeMove(e);
      return;
    }
    if (pointDrag) {
      pointMove(e);
      return;
    }
    const previous = pointers[e.pointerId];
    if (!previous) return;
    const next = toView(e.clientX, e.clientY);
    const ids = Object.keys(pointers).map(Number);
    if (ids.length >= 2) {
      const [idA, idB] = ids;
      const before: [Point, Point] = [pointers[idA], pointers[idB]];
      pointers[e.pointerId] = next;
      const after: [Point, Point] = [pointers[idA], pointers[idB]];
      view = pinch(view, before, after);
      panned = true;
      return;
    }
    pointers[e.pointerId] = next;
    if (!panning) return;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (!panning.moved && Math.hypot(dx, dy) * (clientWidth / width) < 4) return;
    if (!panning.moved) capture(e);
    panning.moved = true;
    panned = true;
    view = pan(view, dx, dy);
  }

  function viewUp(e: PointerEvent) {
    if (drag) nodeUp(e);
    if (pointDrag) pointUp(e);
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length === 0) panning = null;
  }

  function viewDoubleClick(e: MouseEvent) {
    if (editable) return;
    e.preventDefault();
    view = zoomAt(view, toView(e.clientX, e.clientY), 2);
  }

  function viewKey(e: KeyboardEvent) {
    if (e.target !== svg) return;
    const step = 40 * k;
    const handled: Record<string, () => void> = {
      '+': () => zoomIn(),
      '=': () => zoomIn(),
      '-': () => zoomOut(),
      '[': () => rotate(-15),
      ']': () => rotate(15),
      '0': () => resetView(),
      Home: () => resetView(),
      ArrowLeft: () => (view = pan(view, step, 0)),
      ArrowRight: () => (view = pan(view, -step, 0)),
      ArrowUp: () => (view = pan(view, 0, step)),
      ArrowDown: () => (view = pan(view, 0, -step)),
    };
    const action = handled[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }

  // A click anywhere else hands scrolling back to the page.
  $effect(() => {
    const frame = svg?.parentElement;
    if (!frame) return;
    const outside = (e: PointerEvent) => {
      if (!frame.contains(e.target as Node)) active = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  });

  // Safari reports trackpad rotation and pinch as gesture events.
  type GestureLike = Event & { scale: number; rotation: number; clientX: number; clientY: number };
  $effect(() => {
    const el = svg;
    if (!el) return;
    let last = { scale: 1, rotation: 0 };
    const start = (e: Event) => {
      e.preventDefault();
      last = { scale: 1, rotation: 0 };
    };
    const change = (e: Event) => {
      e.preventDefault();
      const g = e as GestureLike;
      const at = toView(g.clientX, g.clientY);
      view = rotateAt(zoomAt(view, at, g.scale / last.scale), at, g.rotation - last.rotation);
      last = { scale: g.scale, rotation: g.rotation };
    };
    el.addEventListener('gesturestart', start);
    el.addEventListener('gesturechange', change);
    return () => {
      el.removeEventListener('gesturestart', start);
      el.removeEventListener('gesturechange', change);
    };
  });
  type Drag = { moved: boolean; pointerId: number; start: Point };
  let drag: (Drag & { id: string }) | null = null;
  let pointDrag: (Drag & { id: string; index: number }) | null = null;

  /** A press only becomes a drag after a few screen pixels; a click may jitter by one. */
  function stillAClick(d: Drag, e: PointerEvent): boolean {
    return !d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < 3;
  }

  function toMap(e: PointerEvent | MouseEvent): { x: number; y: number } {
    if (!content) return { x: 0, y: 0 };
    const ctm = content.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // A drag starts on the station or vertex and is then followed on the svg, so
  // it does not depend on pointer capture (which Safari does not honour on
  // SVG children). Capture is taken only once the pointer has really moved:
  // it keeps a fast drag alive outside the map, while a plain click keeps
  // its target (a captured pointer would make every click land on the svg).
  function capture(e: PointerEvent) {
    try {
      svg?.setPointerCapture(e.pointerId);
    } catch {
      // Capture is optional.
    }
  }

  function nodeDown(e: PointerEvent, node: MapNode) {
    if (!editable) return;
    e.stopPropagation();
    if (e.button === 0) e.preventDefault();
    drag = {
      id: node.id,
      moved: false,
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
    };
  }

  function nodeMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId || stillAClick(drag, e)) return;
    const { x, y } = toMap(e);
    if (!drag.moved) capture(e);
    drag.moved = true;
    onNodeMove?.(drag.id, x, y, false);
  }

  function nodeUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    // The click that follows lands wherever the pointer is; it is not a canvas click.
    panned = true;
    if (current.moved) {
      const { x, y } = toMap(e);
      onNodeMove?.(current.id, x, y, true);
    } else {
      onNodeClick?.(current.id, e.shiftKey);
    }
  }

  function pointDown(e: PointerEvent, line: MapLine, index: number) {
    if (!editable) return;
    e.stopPropagation();
    if (e.button === 0) e.preventDefault();
    pointDrag = {
      id: line.id,
      index,
      moved: false,
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
    };
  }

  function pointMove(e: PointerEvent) {
    if (!pointDrag || e.pointerId !== pointDrag.pointerId || stillAClick(pointDrag, e)) return;
    const { x, y } = toMap(e);
    if (!pointDrag.moved) capture(e);
    pointDrag.moved = true;
    onLinePointMove?.(pointDrag.id, pointDrag.index, x, y, false);
  }

  function pointUp(e: PointerEvent) {
    if (!pointDrag || e.pointerId !== pointDrag.pointerId) return;
    const current = pointDrag;
    pointDrag = null;
    panned = true;
    const line = map.lines.find((l) => l.id === current.id);
    if (current.moved) {
      const { x, y } = toMap(e);
      onLinePointMove?.(current.id, current.index, x, y, true);
    } else if (line) {
      onLineClick?.(line);
    }
  }

  function lineLabelAt(line: MapLine): { x: number; y: number; angle: number } {
    const i = Math.floor((line.points.length - 1) / 2);
    const a = line.points[i];
    const b = line.points[Math.min(i + 1, line.points.length - 1)];
    let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle };
  }

  /** Direction of the line through a station, for drawing its passage width. */
  function passageAngle(node: MapNode): number {
    const edge = map.edges.find((e) => e.from === node.id || e.to === node.id);
    const other = edge ? (edge.from === node.id ? edge.to : edge.from) : null;
    const b = other ? map.nodes.find((n) => n.id === other) : undefined;
    if (!b) return 0;
    return Math.atan2(b.y - node.y, b.x - node.x);
  }

  function canvasClick(e: MouseEvent) {
    if (panned) {
      panned = false;
      return;
    }
    if (!editable || !onCanvasClick) return;
    const { x, y } = toMap(e);
    onCanvasClick(x, y);
  }

  function isSelectedEdge(edge: MapEdge): boolean {
    const s = selection?.edge;
    return (
      !!s &&
      ((s.from === edge.from && s.to === edge.to) || (s.from === edge.to && s.to === edge.from))
    );
  }

  const phases = $derived(legPhases(legs, turn));

  /** How the dive used an edge: on the way in, out, or both, and one arrow per way and phase. */
  function travel(edge: MapEdge): {
    in: boolean;
    out: boolean;
    arrows: { key: string; phase: LegPhase; back: boolean }[];
  } {
    const arrows: { key: string; phase: LegPhase; back: boolean }[] = [];
    let goingIn = false;
    let goingOut = false;
    legs.forEach((l, i) => {
      const forward = l.from === edge.from && l.to === edge.to;
      const back = l.from === edge.to && l.to === edge.from;
      if (!forward && !back) return;
      const phase = phases[i];
      if (phase === 'in') goingIn = true;
      else goingOut = true;
      const key = `${phase}-${back ? 'back' : 'fwd'}`;
      if (!arrows.some((a) => a.key === key)) arrows.push({ key, phase, back });
    });
    return { in: goingIn, out: goingOut, arrows };
  }

  function heading(a: MapPoint, b: MapPoint): number {
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  }

  function midpoint(edge: MapEdge): { x: number; y: number; angle: number } | null {
    const ends = edgeEndpoints(map, edge);
    if (!ends) return null;
    const dx = ends.b.x - ends.a.x;
    const dy = ends.b.y - ends.a.y;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;
    return { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2, angle };
  }

  /**
   * A surveyed distance or a note is always worth showing; a drawn length only
   * where the edge is long enough on screen to carry the text, so a traced
   * survey with hundreds of short shots reads as a line, not as numbers.
   */
  // A dive's route reads best with only its own lengths; the toggle adds the rest.
  const focused = $derived(route !== null && !editable);
  let distanceChoice = $state<boolean | null>(null);
  const showDistances = $derived(distanceChoice ?? !focused);

  function showDistance(edge: MapEdge): boolean {
    if (edge.distance !== null || edge.note) return true;
    const metres = edgeLength(map, edge);
    return metres > `${metres} m`.length * 9 * k;
  }

  function polygon(points: MapPoint[]): string {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  }

  function centroid(points: MapPoint[]): MapPoint {
    const n = points.length || 1;
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }

  const scaleBar = $derived(gridStep);
  const areas = $derived(orderedAreas(map));
  const deepest = $derived(maxDepth(map) ?? 0);
  const underlay = $derived(showUnderlay && underlayHref && map.underlay ? map.underlay : null);

  function areaFill(area: MapArea): string | undefined {
    return area.kind === 'depth' ? depthFill(area.depth, deepest) : undefined;
  }

  // A depth band is drawn contour first, so its opening corner sits on the
  // contour itself — the one spot a nested band is never covered by a deeper one.
  function bandLabelAt(area: MapArea): MapPoint {
    return area.points[0];
  }

  function onRoute(edge: MapEdge): boolean {
    return !!route && route.has(edgeKey(edge.from, edge.to));
  }

  function nodeOnRoute(id: string): boolean {
    if (!route) return true;
    for (const key of route) if (key.split('|').includes(id)) return true;
    return false;
  }
</script>

<div class="frame" bind:this={frame} style:aspect-ratio={fullscreen ? undefined : aspect}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <svg
    bind:this={svg}
    bind:clientWidth
    bind:clientHeight
    class="sitemap"
    class:editable
    class:active
    class:routed={route !== null}
    viewBox="{box.minX} {box.minY} {width} {height}"
    role={editable ? 'application' : 'img'}
    aria-label={title}
    tabindex="0"
    onclick={canvasClick}
    ondblclick={viewDoubleClick}
    onwheel={onWheel}
    onpointerdown={viewDown}
    onpointermove={viewMove}
    onpointerup={viewUp}
    onpointercancel={viewUp}
    onkeydown={viewKey}
    onblur={() => (active = false)}
    onfocus={() => (active = true)}
  >
    <defs>
      <marker
        id="path-arrow"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0 0 L10 5 L0 10 Z" class="arrow" />
      </marker>
    </defs>
    <g class="view" bind:this={content} transform={toSvgTransform(view)}>
      {#if underlay && underlayHref}
        <g class="underlay" opacity={underlay.opacity}>
          <image
            href={underlayHref}
            x="0"
            y="0"
            transform="translate({underlay.dx} {underlay.dy}) rotate({underlay.rotation}) scale({underlay.scale})"
            preserveAspectRatio="xMinYMin"
          />
        </g>
      {/if}
      <g class="grid">
        {#each gridLines.xs as x (x)}
          <line x1={x} y1={visible.minY} x2={x} y2={visible.maxY} />
        {/each}
        {#each gridLines.ys as y (y)}
          <line x1={visible.minX} y1={y} x2={visible.maxX} y2={y} />
        {/each}
      </g>

      <g class="areas">
        {#each areas as area (area.id)}
          {@const c = area.kind === 'depth' ? bandLabelAt(area) : centroid(area.points)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g
            class="area {area.kind}"
            class:selected={selection?.area === area.id}
            role={editable ? 'button' : undefined}
            tabindex={editable ? 0 : undefined}
            onclick={(e) => {
              if (!editable || !onAreaClick) return;
              e.stopPropagation();
              onAreaClick?.(area);
            }}
            onkeydown={(e) => {
              if (editable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onAreaClick?.(area);
              }
            }}
          >
            <polygon points={polygon(area.points)} style:fill={areaFill(area)} />
            {#if area.label || area.depth !== null}
              <text
                class="area-label"
                class:band={area.kind === 'depth'}
                x={c.x}
                y={c.y}
                dy={area.kind === 'depth' ? -4 * k : 0}
                font-size={10.5 * k}
                text-anchor="middle">{area.label || depthLabel(area.depth)}</text
              >
            {/if}
          </g>
        {/each}
        {#if draft.length}
          <polyline class="draft" points={polygon(draft)} />
          {#each draft as p, i (i)}
            <circle class="draft-point" class:first={i === 0} cx={p.x} cy={p.y} r={4 * k} />
          {/each}
        {/if}
      </g>

      <g class="lines">
        {#each map.lines as line (line.id)}
          {@const at = lineLabelAt(line)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g
            class="line {line.kind}"
            class:selected={selection?.line === line.id}
            role={editable ? 'button' : undefined}
            tabindex={editable ? 0 : undefined}
            onclick={(e) => {
              if (!editable || !onLineClick) return;
              e.stopPropagation();
              onLineClick?.(line);
            }}
            onkeydown={(e) => {
              if (editable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onLineClick?.(line);
              }
            }}
          >
            {#if line.closed}
              <polygon class="hit" points={polygon(line.points)} />
              {#if line.kind === 'shoreline'}
                <polygon class="shore-band" points={polygon(line.points)} />
              {/if}
              <polygon class="stroke" points={polygon(line.points)} />
            {:else}
              <polyline class="hit" points={polygon(line.points)} />
              {#if line.kind === 'shoreline'}
                <polyline class="shore-band" points={polygon(line.points)} />
              {/if}
              <polyline
                class="stroke"
                points={polygon(line.points)}
                marker-end={line.kind === 'path' ? 'url(#path-arrow)' : undefined}
                marker-mid={line.kind === 'path' && line.points.length > 2
                  ? 'url(#path-arrow)'
                  : undefined}
              />
            {/if}
            {#if line.label || line.depth !== null}
              <text
                class="line-label"
                x={at.x}
                y={at.y}
                dy={-4 * k}
                font-size={10 * k}
                text-anchor="middle"
                transform="rotate({at.angle} {at.x} {at.y})"
                >{line.label || depthLabel(line.depth)}{line.kind === 'path' && line.label
                  ? ` · ${Math.round(lineLength(line))} m`
                  : ''}</text
              >
            {/if}
            {#if editable && selection?.line === line.id}
              {#each line.points as p, i (i)}
                <circle
                  class="vertex"
                  role="button"
                  tabindex="-1"
                  aria-label="Point {i + 1} of {line.label || line.kind}"
                  cx={p.x}
                  cy={p.y}
                  r={4.5 * k}
                  onpointerdown={(e) => pointDown(e, line, i)}
                />
              {/each}
            {/if}
          </g>
        {/each}
      </g>

      <g class="edges">
        {#each map.edges as edge (`${edge.from}-${edge.to}`)}
          {@const ends = edgeEndpoints(map, edge)}
          {#if ends}
            {@const mid = midpoint(edge)}
            {@const way = travel(edge)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <g
              class="edge {edge.style}"
              class:selected={isSelectedEdge(edge)}
              class:on-route={onRoute(edge)}
              role={editable ? 'button' : undefined}
              tabindex={editable ? 0 : undefined}
              onclick={(e) => {
                if (!editable || !onEdgeClick) return;
                e.stopPropagation();
                onEdgeClick?.(edge);
              }}
              onkeydown={(e) => {
                if (editable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onEdgeClick?.(edge);
                }
              }}
            >
              <line class="hit" x1={ends.a.x} y1={ends.a.y} x2={ends.b.x} y2={ends.b.y} />
              <line
                class="line"
                class:way-in={way.in && !way.out}
                class:way-out={way.out && !way.in}
                class:way-both={way.in && way.out}
                x1={ends.a.x}
                y1={ends.a.y}
                x2={ends.b.x}
                y2={ends.b.y}
              />
              {#if way.in && way.out}
                <line class="way-dash" x1={ends.a.x} y1={ends.a.y} x2={ends.b.x} y2={ends.b.y} />
              {/if}
              {#each way.arrows as arrow (arrow.key)}
                <path
                  class="route-arrow {arrow.phase}"
                  d="M{-4 * k} {-3.5 * k} L{3.5 * k} 0 L{-4 * k} {3.5 * k} Z"
                  transform="translate({(ends.a.x + ends.b.x) / 2} {(ends.a.y + ends.b.y) /
                    2}) rotate({heading(ends.a, ends.b) +
                    (arrow.back ? 180 : 0)}) translate(0 {arrow.phase === 'in' ? -6 * k : -11 * k})"
                />
              {/each}
              {#if mid && map.to_scale && (showDistances || (focused && onRoute(edge))) && showDistance(edge)}
                <text
                  class="distance"
                  x={mid.x}
                  y={mid.y}
                  dy={-5 * k}
                  font-size={10.5 * k}
                  text-anchor="middle"
                  transform="rotate({mid.angle} {mid.x} {mid.y})"
                  >{edgeLength(map, edge)} m{edge.note ? ` · ${edge.note}` : ''}</text
                >
              {/if}
            </g>
          {/if}
        {/each}
      </g>

      <g class="nodes">
        {#each map.nodes as node, i (node.id)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g
            class="node {node.type}"
            class:selected={selection?.node === node.id}
            class:off-route={!nodeOnRoute(node.id)}
            class:turn={turn === node.id}
            transform="translate({node.x} {node.y})"
            role={editable ? 'button' : undefined}
            tabindex={editable ? 0 : undefined}
            aria-label={node.label || node.type}
            onpointerdown={(e) => nodeDown(e, node)}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
              if (editable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onNodeClick?.(node.id, e.shiftKey);
              }
            }}
          >
            <circle class="hit" r={14 * k} />
            {#if turn === node.id}
              <circle class="turn-ring" r={13 * k} />
            {/if}
            {#if node.left !== null || node.right !== null}
              {@const a = passageAngle(node) + Math.PI / 2}
              <line
                class="passage"
                x1={Math.cos(a) * (node.left ?? 0)}
                y1={Math.sin(a) * (node.left ?? 0)}
                x2={-Math.cos(a) * (node.right ?? 0)}
                y2={-Math.sin(a) * (node.right ?? 0)}
              />
            {/if}
            <g class="upright" transform="rotate({-rotation})">
              <MapGlyph type={node.type} objectKind={node.object_kind} color={node.color} {k} />
              {#if node.label || node.depth !== null}
                {@const below = i % 2 === 1}
                {@const dx = node.type === 'object' ? 15 * k : 11 * k}
                <text class="label" x={dx} y={below ? 14 * k : -6 * k} font-size={11.5 * k}
                  >{node.label}</text
                >
                <text class="depth" x={dx} y={below ? 25 * k : 5 * k} font-size={9.5 * k}
                  >{depthLabel(node.depth)}</text
                >
              {/if}
            </g>
          </g>
        {/each}
      </g>

      {#if path.length > 1}
        <g class="track" aria-label="Track of the dive">
          {#each path.slice(1) as p, i (i)}
            {@const a = path[i]}
            {@const phase = pathTurn !== null && i >= pathTurn ? 'out' : 'in'}
            <line class="track-leg {phase}" x1={a.x} y1={a.y} x2={p.x} y2={p.y} />
            <path
              class="route-arrow {phase}"
              d="M{-4 * k} {-3.5 * k} L{3.5 * k} 0 L{-4 * k} {3.5 * k} Z"
              transform="translate({(a.x + p.x) / 2} {(a.y + p.y) / 2}) rotate({heading(a, p)})"
            />
          {/each}
          {#if pathTurn !== null && path[pathTurn]}
            <circle class="turn-ring" cx={path[pathTurn].x} cy={path[pathTurn].y} r={9 * k} />
          {/if}
        </g>
      {/if}

      <g class="pins">
        {#each pins as pin, i (pin.id)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g
            class="pin"
            class:selected={selection?.pin === pin.id}
            transform="translate({pin.x} {pin.y})"
            role={editable ? 'button' : undefined}
            tabindex={editable ? 0 : undefined}
            aria-label={pin.note || `Note ${i + 1}`}
            onclick={(e) => {
              if (!editable) return;
              e.stopPropagation();
              onPinClick?.(pin);
            }}
            onkeydown={(e) => {
              if (editable && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onPinClick?.(pin);
              }
            }}
          >
            <g class="upright" transform="rotate({-rotation})">
              <path
                class="pin-shape"
                d="M0 0 L{-6 * k} {-12 * k} A{7 * k} {7 * k} 0 1 1 {6 * k} {-12 * k} Z"
              />
              <text class="pin-number" y={-11 * k} font-size={8.5 * k} text-anchor="middle"
                >{i + 1}</text
              >
              {#if pin.note}
                <text class="pin-note" x={10 * k} y={-10 * k} font-size={10 * k}>{pin.note}</text>
              {/if}
            </g>
          </g>
        {/each}
      </g>
    </g>
    <g
      class="compass"
      transform="translate({box.maxX - 24 * hk} {box.minY + 30 * hk})"
      font-size={10 * hk}
    >
      <g transform="rotate({-map.north + rotation})">
        <line x1="0" y1={12 * hk} x2="0" y2={-12 * hk} />
        <path d="M0 {-16 * hk} L{5 * hk} {-4 * hk} L{-5 * hk} {-4 * hk} Z" />
        <text
          y={-20 * hk}
          text-anchor="middle"
          transform="rotate({map.north - rotation} 0 {-20 * hk})"
          dominant-baseline="middle">N</text
        >
      </g>
    </g>
    {#if map.to_scale}
      <g
        class="scale"
        transform="translate({box.minX + 14 * hk} {box.maxY - 14 * hk})"
        font-size={9.5 * hk}
      >
        <line x1="0" y1="0" x2={scaleBar * zoom} y2="0" />
        <line x1="0" y1={-4 * hk} x2="0" y2={4 * hk} />
        <line x1={scaleBar * zoom} y1={-4 * hk} x2={scaleBar * zoom} y2={4 * hk} />
        <text x={(scaleBar * zoom) / 2} y={-6 * hk} text-anchor="middle">{scaleBar} m</text>
      </g>
    {:else}
      <text class="not-to-scale" x={box.minX + 14 * hk} y={box.maxY - 14 * hk} font-size={9.5 * hk}
        >not to scale</text
      >
    {/if}
  </svg>
  <div class="view-controls" role="group" aria-label="Map view">
    <button type="button" onclick={() => zoomIn()} title="Zoom in (+)" aria-label="Zoom in"
      >+</button
    >
    <button type="button" onclick={() => zoomOut()} title="Zoom out (−)" aria-label="Zoom out"
      >−</button
    >
    <button
      type="button"
      onclick={() => rotate(-15)}
      title="Rotate left ([)"
      aria-label="Rotate left">↺</button
    >
    <button
      type="button"
      onclick={() => rotate(15)}
      title="Rotate right (])"
      aria-label="Rotate right">↻</button
    >
    {#if map.to_scale}
      <button
        type="button"
        class="toggle"
        class:off={!showDistances}
        aria-pressed={showDistances}
        onclick={() => (distanceChoice = !showDistances)}
        title={showDistances ? 'Hide line lengths' : 'Show line lengths'}
        aria-label="Line lengths">m</button
      >
    {/if}
    {#if canFullscreen && !editable}
      <button
        type="button"
        class="fullscreen"
        class:on={fullscreen}
        aria-pressed={fullscreen}
        onclick={toggleFullscreen}
        title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
        aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>⛶</button
      >
    {/if}
    {#if moved}
      <button
        type="button"
        class="reset"
        onclick={resetView}
        title="Reset view (0)"
        aria-label="Reset view">⟲</button
      >
    {/if}
  </div>
  {#if hint}
    <div class="hint" aria-live="polite">{hint}</div>
  {/if}
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
  .frame:fullscreen {
    width: 100vw;
    height: 100vh;
    background: var(--dl-color-bg);
  }
  .frame:fullscreen .sitemap {
    border: none;
    border-radius: 0;
  }
  .view-controls .fullscreen.on {
    color: var(--dl-color-accent);
    border-color: var(--dl-color-accent);
  }
  .sitemap {
    --map-bg: var(--dl-color-bg-elevated);
    --map-coral: #2f8f6f;
    --map-sand: #d8c9a3;
    display: block;
    width: 100%;
    height: 100%;
    background: var(--map-bg);
    border-radius: var(--dl-radius);
    border: 1px solid var(--dl-color-border);
    color: var(--dl-color-text);
    font-family: var(--dl-font-mono);
    touch-action: pan-y;
    user-select: none;
    cursor: grab;
    outline: none;
  }
  .sitemap.active {
    touch-action: none;
  }
  .sitemap:focus-visible {
    border-color: var(--dl-color-accent);
  }
  .sitemap.editable {
    cursor: crosshair;
  }
  .view-controls {
    position: absolute;
    top: 10px;
    left: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .view-controls button {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--dl-color-border-strong);
    background: color-mix(in srgb, var(--dl-color-bg-elevated) 85%, transparent);
    color: var(--dl-color-text);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }
  .view-controls button:hover {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-accent);
  }
  .view-controls .reset {
    color: var(--dl-color-warm);
  }
  .view-controls .toggle {
    font-family: var(--dl-font-mono);
    font-size: 13px;
  }
  .view-controls .toggle.off {
    color: var(--dl-color-text-faint);
    text-decoration: line-through;
  }
  .hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--dl-color-bg) 70%, transparent);
    color: var(--dl-color-text);
    font-size: 14px;
    border-radius: var(--dl-radius);
    pointer-events: none;
  }
  .grid line {
    stroke: color-mix(in srgb, currentColor 8%, transparent);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
  .area polygon {
    stroke-width: 2px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .area.outline polygon {
    fill: color-mix(in srgb, currentColor 5%, transparent);
    stroke: currentColor;
    stroke-width: 2.5px;
  }
  .area.depth polygon {
    stroke: color-mix(in srgb, var(--dl-color-accent) 30%, transparent);
    stroke-width: 1.5px;
  }
  .area.coral polygon {
    fill: color-mix(in srgb, var(--map-coral) 42%, transparent);
    stroke: color-mix(in srgb, var(--map-coral) 75%, transparent);
  }
  .area.sand polygon {
    fill: color-mix(in srgb, var(--map-sand) 20%, transparent);
    stroke: color-mix(in srgb, var(--map-sand) 40%, transparent);
  }
  .area.shallows polygon {
    fill: color-mix(in srgb, var(--dl-color-accent) 14%, transparent);
    stroke: color-mix(in srgb, var(--dl-color-accent) 50%, transparent);
  }
  .area.wall polygon {
    fill: color-mix(in srgb, var(--dl-color-warm) 10%, transparent);
    stroke: var(--dl-color-warm);
    stroke-dasharray: 8 4;
  }
  .area.wreck polygon {
    fill: color-mix(in srgb, currentColor 28%, transparent);
    stroke: currentColor;
  }
  .area.reeds polygon {
    fill: color-mix(in srgb, var(--dl-color-success) 18%, transparent);
    stroke: color-mix(in srgb, var(--dl-color-success) 60%, transparent);
  }
  .area.other polygon {
    fill: color-mix(in srgb, currentColor 8%, transparent);
    stroke: color-mix(in srgb, currentColor 40%, transparent);
  }
  .editable .area {
    cursor: pointer;
  }
  .area.selected polygon,
  .editable .area:hover polygon {
    stroke: var(--dl-color-accent);
    stroke-width: 3px;
  }
  .area-label.band {
    fill: color-mix(in srgb, var(--dl-color-accent) 70%, var(--dl-color-text));
    font-family: var(--dl-font-mono);
    stroke-width: 0.35em;
  }
  .area-label {
    fill: var(--dl-color-text-muted);
    font-family: var(--dl-font-mono);
    paint-order: stroke;
    stroke: var(--map-bg);
    stroke-width: 0.5em;
    stroke-linejoin: round;
  }
  .underlay image {
    pointer-events: none;
  }
  .arrow {
    fill: var(--dl-color-warm);
  }
  .line .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 14px;
    vector-effect: non-scaling-stroke;
  }
  .line .stroke {
    fill: none;
    stroke: currentColor;
    stroke-width: 2px;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .line.shoreline .stroke {
    stroke: var(--map-sand);
    stroke-width: 3px;
  }
  .line.shoreline .shore-band {
    fill: none;
    stroke: color-mix(in srgb, var(--map-sand) 22%, transparent);
    stroke-width: 12px;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .line.shoreline .line-label {
    fill: var(--map-sand);
  }
  .line.depth .stroke {
    stroke: color-mix(in srgb, var(--dl-color-accent) 70%, var(--dl-color-text));
    stroke-width: 1.5px;
  }
  .line.path .stroke {
    stroke: var(--dl-color-warm);
    stroke-dasharray: 8 5;
  }
  .line.wall .stroke {
    stroke: var(--dl-color-warm);
    stroke-dasharray: 8 3 1 3;
  }
  .line.pipe .stroke {
    stroke-width: 3.5px;
    opacity: 0.6;
  }
  .editable .line {
    cursor: pointer;
  }
  .line.selected .stroke,
  .editable .line:hover .stroke {
    stroke: var(--dl-color-accent);
    stroke-width: 3px;
  }
  .line-label {
    fill: var(--dl-color-text-muted);
    paint-order: stroke;
    stroke: var(--map-bg);
    stroke-width: 0.6em;
    stroke-linejoin: round;
  }
  .line.depth .line-label {
    fill: color-mix(in srgb, var(--dl-color-accent) 70%, var(--dl-color-text));
  }
  .vertex {
    fill: var(--map-bg);
    stroke: var(--dl-color-accent);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    cursor: grab;
  }
  .passage {
    stroke: color-mix(in srgb, currentColor 45%, transparent);
    stroke-width: 1.5px;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .draft {
    fill: none;
    stroke: var(--dl-color-accent);
    stroke-width: 2px;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;
  }
  .draft-point {
    fill: var(--dl-color-accent);
  }
  .draft-point.first {
    fill: var(--map-bg);
    stroke: var(--dl-color-accent);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }
  .edge .line {
    stroke: currentColor;
    stroke-width: 2px;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .edge.jump .line {
    stroke-dasharray: 6 5;
  }
  .edge.unsurveyed .line {
    stroke-dasharray: 2 4;
    opacity: 0.6;
  }
  .edge.route .line {
    stroke: var(--dl-color-accent);
    stroke-dasharray: 10 6;
  }
  .routed .edge:not(.on-route) .line {
    opacity: 0.14;
  }
  .routed .edge:not(.on-route) .distance {
    opacity: 0.35;
  }
  .edge.on-route .line {
    stroke: var(--dl-color-warm);
    stroke-width: 4px;
  }
  .sitemap {
    --way-in: #ef4444;
    --way-out: #22c55e;
  }
  .edge.on-route .line.way-in {
    stroke: var(--way-in);
  }
  .edge.on-route .line.way-out {
    stroke: var(--way-out);
  }
  .edge.on-route .line.way-both {
    stroke: var(--way-in);
  }
  .way-dash {
    fill: none;
    stroke: var(--way-out);
    stroke-width: 4px;
    stroke-dasharray: 7 7;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .route-arrow {
    fill: var(--dl-color-warm);
    stroke: var(--map-bg);
    stroke-width: 1px;
    stroke-linejoin: round;
  }
  .route-arrow.in {
    fill: var(--way-in);
  }
  .route-arrow.out {
    fill: var(--way-out);
  }
  .track {
    pointer-events: none;
  }
  .track-leg {
    stroke-width: 4px;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    opacity: 0.9;
  }
  .track-leg.in {
    stroke: var(--way-in);
  }
  .track-leg.out {
    stroke: var(--way-out);
  }
  .routed .node.off-route > :not(.upright),
  .routed .node.off-route .upright > :global(g) {
    opacity: 0.2;
  }
  .routed .node.off-route text {
    opacity: 0.45;
  }
  .turn-ring {
    fill: none;
    stroke: var(--dl-color-warm);
    stroke-width: 3px;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
  }
  .pin-shape {
    fill: var(--dl-color-warm);
    stroke: var(--map-bg);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  .pin-number {
    fill: #06101f;
    font-weight: 700;
  }
  .pin-note {
    fill: var(--dl-color-text);
    font-family: var(--dl-font-mono);
    paint-order: stroke;
    stroke: var(--map-bg);
    stroke-width: 0.6em;
    stroke-linejoin: round;
  }
  .editable .pin {
    cursor: pointer;
  }
  .pin.selected .pin-shape,
  .editable .pin:hover .pin-shape {
    fill: var(--dl-color-accent);
  }
  .edge .hit {
    stroke: transparent;
    stroke-width: 14px;
    vector-effect: non-scaling-stroke;
  }
  .editable .edge {
    cursor: pointer;
  }
  .editable .edge:hover .line,
  .edge.selected .line {
    stroke: var(--dl-color-accent);
    stroke-width: 3px;
  }
  .distance {
    fill: var(--dl-color-text-muted);
    paint-order: stroke;
    stroke: var(--map-bg);
    stroke-width: 0.8em;
    stroke-linejoin: round;
  }
  .node .hit {
    fill: transparent;
  }
  .editable .node {
    cursor: grab;
  }
  .node.selected,
  .editable .node:hover {
    color: var(--dl-color-accent);
    filter: drop-shadow(0 0 3px var(--dl-color-accent));
  }
  .node.selected :global(.object),
  .editable .node:hover :global(.object) {
    color: inherit;
  }
  .label {
    fill: currentColor;
    font-family: var(--dl-font-mono);
    font-weight: 600;
    paint-order: stroke;
    stroke: var(--map-bg);
    stroke-width: 0.6em;
    stroke-linejoin: round;
  }
  .depth {
    fill: var(--dl-color-accent);
    font-family: var(--dl-font-mono);
    paint-order: stroke;
    stroke: var(--map-bg);
    stroke-width: 0.6em;
    stroke-linejoin: round;
  }
  .compass line,
  .scale line {
    stroke: var(--dl-color-text-muted);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  .compass path {
    fill: var(--dl-color-text-muted);
  }
  .compass text,
  .not-to-scale {
    fill: var(--dl-color-text-faint);
    font-family: var(--dl-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .scale text {
    fill: var(--dl-color-text-muted);
  }
</style>
