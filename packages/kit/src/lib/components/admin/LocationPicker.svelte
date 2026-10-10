<script lang="ts" module>
  /** Another point drawn on the picker for context: a nearby site, or the site for its entry. */
  export interface PickerMarker {
    lat: number;
    lon: number;
    label: string;
  }
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Map as MapLibreMap, Marker, StyleSpecification } from 'maplibre-gl';
  import {
    absoluteTilesBase,
    archiveForTile,
    PICKER_DETAIL_PROTOCOL,
    pickerStyle,
    startZoom,
    type TileIndex,
  } from '$lib/core/map/locator';
  import { countryBounds, loadCountries } from '$lib/core/map/countries';
  import { formatLatLon, nudge, parseLatLon, type LatLon } from '$lib/core/map/coords';
  import type { GeoSource, PickedPoint } from '$lib/core/admin/site-create';
  import { announce } from '$lib/core/ui/announce';
  import { mapWorkerUrl } from '$lib/components/map-worker';
  import { getDivelog } from '$lib/core/dive/context';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '$lib/styles/maplibre.css';

  const { urls } = getDivelog();

  let {
    value = null,
    onchange,
    label = 'Location',
    pinLabel = 'Site',
    siteType = '',
    country = '',
    near = null,
    markers = [],
    compact = false,
    error = '',
    id = '',
  }: {
    /** The pin, or null while nothing is placed. */
    value?: LatLon | null;
    /** A new position from a tap, a drag, a paste, the arrow keys or the device. */
    onchange: (point: PickedPoint) => void;
    /** Visible name of the picker (the coordinates field's label). */
    label?: string;
    /** What the pin stands for, in announcements ("Site", "Entry point"). */
    pinLabel?: string;
    /** Sets the zoom a placed pin is shown at. */
    siteType?: string;
    /** ISO3 code of the country to frame; with no pin yet the map follows it. */
    country?: string;
    /** Where to look first when there is no pin (the previous dive's site). */
    near?: LatLon | null;
    /** Other points for context. */
    markers?: PickerMarker[];
    /** A lower map, for a second picker on the same page. */
    compact?: boolean;
    /** A field error for the position (from the server or the form). */
    error?: string;
    id?: string;
  } = $props();

  const propsId = $props.id();
  const uid = $derived(id || `dl-picker-${propsId}`);
  const inputId = $derived(`${uid}-coords`);
  const hintId = $derived(`${uid}-hint`);
  const errorId = $derived(`${uid}-error`);
  const keysId = $derived(`${uid}-keys`);

  let container = $state<HTMLDivElement>();
  let mapState = $state<'loading' | 'ready' | 'off'>('loading');
  let map: MapLibreMap | undefined;
  let pin: Marker | undefined;
  let others: Marker[] = [];
  let maplibreModule: typeof import('maplibre-gl') | undefined;

  // svelte-ignore state_referenced_locally
  let text = $state(value ? formatLatLon(value.lat, value.lon) : '');
  let textFocused = $state(false);
  let pasteError = $state('');
  let locating = $state(false);
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const shownError = $derived(pasteError || error);

  $effect(() => {
    const v = value;
    untrack(() => {
      if (!textFocused) text = v ? formatLatLon(v.lat, v.lon) : '';
      syncPin(v);
    });
  });

  function emit(lat: number, lon: number, source: GeoSource) {
    pasteError = '';
    onchange({ lat, lon, source });
    announce(`${pinLabel} pin at ${formatLatLon(lat, lon, 5)}`);
  }

  function applyText(source: GeoSource = 'paste'): boolean {
    const raw = text.trim();
    if (!raw) {
      pasteError = '';
      return false;
    }
    const parsed = parseLatLon(raw);
    if (!parsed) {
      pasteError =
        'Not a position I can read. Try “52.09, 5.12”, “52°05′24″N 5°07′12″E” or a map link.';
      return false;
    }
    text = formatLatLon(parsed.lat, parsed.lon);
    emit(parsed.lat, parsed.lon, source);
    flyTo(parsed);
    return true;
  }

  function onPaste(e: ClipboardEvent) {
    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!parseLatLon(pasted)) return;
    e.preventDefault();
    text = pasted;
    applyText('paste');
  }

  function onTextKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    applyText('paste');
  }

  function locate() {
    if (!canLocate) return;
    locating = true;
    pasteError = '';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locating = false;
        const lat = Math.round(position.coords.latitude * 1e6) / 1e6;
        const lon = Math.round(position.coords.longitude * 1e6) / 1e6;
        emit(lat, lon, 'geolocation');
        flyTo({ lat, lon });
      },
      (err) => {
        locating = false;
        pasteError =
          err.code === err.PERMISSION_DENIED
            ? 'Location access was refused; tap the map or paste the position instead.'
            : 'Could not get the device location.';
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function frameCountry() {
    if (!map || !country) return;
    const bounds = await countryBounds(country);
    if (!bounds || !map) return;
    const [w, s, e, n] = bounds;
    if (w > e) map.fitBounds([w - 360, s, e, n], { padding: 24, duration: 600, maxZoom: 9 });
    else map.fitBounds([w, s, e, n], { padding: 24, duration: 600, maxZoom: 9 });
  }

  $effect(() => {
    const c = country;
    const ready = mapState === 'ready';
    if (c && ready && !untrack(() => value)) void frameCountry();
  });

  function flyTo(point: LatLon) {
    if (!map) return;
    const zoom = Math.max(map.getZoom(), startZoom(siteType) - 1);
    map.easeTo({ center: [point.lon, point.lat], zoom, duration: 500 });
  }

  function syncPin(v: LatLon | null) {
    if (!map || !maplibreModule) return;
    if (!v) {
      pin?.remove();
      pin = undefined;
      return;
    }
    if (!pin) {
      const el = document.createElement('div');
      el.className = 'picker-pin';
      el.setAttribute('aria-hidden', 'true');
      pin = new maplibreModule.Marker({ element: el, draggable: true, anchor: 'center' })
        .setLngLat([v.lon, v.lat])
        .addTo(map);
      pin.on('dragend', () => {
        const at = pin!.getLngLat();
        emit(round(at.lat), round(wrap(at.lng)), 'pick');
      });
    } else {
      pin.setLngLat([v.lon, v.lat]);
    }
    if (!map.getBounds().contains([v.lon, v.lat])) map.easeTo({ center: [v.lon, v.lat] });
  }

  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

  function drawMarkers(list: PickerMarker[]) {
    if (!map || !maplibreModule) return;
    for (const m of others) m.remove();
    others = list.map((m) => {
      const el = document.createElement('div');
      el.className = 'picker-other';
      const dot = document.createElement('i');
      const name = document.createElement('span');
      name.textContent = m.label;
      el.append(dot, name);
      el.setAttribute('aria-hidden', 'true');
      return new maplibreModule!.Marker({ element: el, anchor: 'left' })
        .setLngLat([m.lon, m.lat])
        .addTo(map!);
    });
  }

  $effect(() => {
    const list = markers;
    if (mapState === 'ready') untrack(() => drawMarkers(list));
  });

  function onMapKeydown(e: KeyboardEvent) {
    if (!map) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      map.zoomIn();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      map.zoomOut();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const c = map.getCenter();
      emit(round(c.lat), round(wrap(c.lng)), 'pick');
      return;
    }
    if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight'
    ) {
      e.preventDefault();
      if (!value) {
        const offset = (map.getContainer().clientHeight || 300) / 8;
        const dx = e.key === 'ArrowLeft' ? -offset : e.key === 'ArrowRight' ? offset : 0;
        const dy = e.key === 'ArrowUp' ? -offset : e.key === 'ArrowDown' ? offset : 0;
        map.panBy([dx * (e.shiftKey ? 3 : 1), dy * (e.shiftKey ? 3 : 1)], { duration: 150 });
        return;
      }
      const next = nudge(value, e.key, map.getZoom(), e.shiftKey);
      emit(next.lat, next.lon, 'pick');
    }
  }

  function webglAvailable(): boolean {
    if (typeof WebGLRenderingContext === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  function cssColour(name: string, fallback: string): string {
    if (!container) return fallback;
    const v = getComputedStyle(container).getPropertyValue(name).trim();
    return v || fallback;
  }

  onMount(() => {
    if (!webglAvailable()) {
      mapState = 'off';
      return;
    }
    let cancelled = false;
    (async () => {
      const [maplibre, { Protocol }, basemaps, index, countries] = await Promise.all([
        import('maplibre-gl'),
        import('pmtiles'),
        import('@protomaps/basemaps').catch(() => null),
        fetch(urls.tiles('index.json'), { cache: 'no-cache' })
          .then((r) => (r.ok ? (r.json() as Promise<TileIndex>) : null))
          .catch(() => null),
        loadCountries(),
      ]);
      if (cancelled || !container) return;
      maplibreModule = maplibre;
      const workerUrl = mapWorkerUrl();
      if (workerUrl) maplibre.setWorkerUrl(workerUrl);
      const protocol = new Protocol();
      maplibre.addProtocol('pmtiles', protocol.tile);
      const base = absoluteTilesBase(urls.tilesBase, location.origin);
      if (index?.archives.length) {
        maplibre.addProtocol(PICKER_DETAIL_PROTOCOL, (params, abort) => {
          const m = new RegExp(`^${PICKER_DETAIL_PROTOCOL}://(\\d+)/(\\d+)/(\\d+)$`).exec(
            params.url,
          );
          const archive = m && archiveForTile(index, +m[1], +m[2], +m[3]);
          if (!m || !archive) return Promise.resolve({ data: new Uint8Array() });
          return protocol.tile(
            { ...params, url: `pmtiles://${base}/${archive.file}/${m[1]}/${m[2]}/${m[3]}` },
            abort,
          );
        });
      }
      const style = pickerStyle({
        base,
        index,
        layers: basemaps?.layers ?? null,
        outline: { type: 'FeatureCollection', features: countries.map((c) => c.feature) },
        colours: {
          water: cssColour('--dl-color-bg', '#0a1a30'),
          land: cssColour('--dl-color-surface-2', '#132a47'),
          border: cssColour('--dl-color-border-strong', '#3d5a7a'),
        },
      });
      const start = value ?? near;
      const instance = new maplibre.Map({
        container,
        style: style as unknown as StyleSpecification,
        center: start ? [start.lon, start.lat] : [10, 30],
        zoom: value ? startZoom(siteType) : near ? 9 : 1.2,
        maxZoom: 19,
        cooperativeGestures: matchMedia('(pointer: coarse)').matches,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        keyboard: false,
        doubleClickZoom: true,
      });
      map = instance;
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      instance.addControl(new maplibre.ScaleControl({ unit: 'metric' }), 'bottom-left');
      instance.on('click', (e) => emit(round(e.lngLat.lat), round(wrap(e.lngLat.lng)), 'pick'));
      instance.on('load', () => {
        mapState = 'ready';
        syncPin(value);
        drawMarkers(markers);
      });
      instance.on('error', () => {
        // a missing tile or glyph: the outlines and the pin keep working
      });
      const canvas = instance.getCanvas();
      canvas.setAttribute('aria-label', `${label}: map`);
      canvas.setAttribute('aria-describedby', keysId);
    })().catch(() => {
      mapState = 'off';
    });
    return () => {
      cancelled = true;
      for (const m of others) m.remove();
      pin?.remove();
      map?.remove();
      map = undefined;
      pin = undefined;
    };
  });
</script>

<div class="dl-picker" class:compact>
  {#if mapState !== 'off'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dl-picker-map ml" onkeydown={onMapKeydown}>
      <div class="dl-picker-canvas" bind:this={container}></div>
      {#if mapState === 'loading'}
        <p class="dl-picker-status">Loading the map…</p>
      {:else if !value}
        <p class="dl-picker-status dl-picker-tip">Tap the map to place the pin</p>
      {/if}
    </div>
    <p class="dl-picker-keys" id={keysId}>
      Tap or click to place the pin, drag it to adjust. With the map focused: arrow keys move the
      pin (Shift for larger steps), + and − zoom, Enter places the pin at the centre.
    </p>
  {:else}
    <p class="dl-picker-off">
      The map is not available in this browser; paste or type the position below.
    </p>
  {/if}

  <div class="dl-picker-controls">
    <div class="dl-picker-field">
      <label for={inputId}>{label}</label>
      <div class="dl-picker-row">
        <input
          id={inputId}
          class="dl-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="lat, lon"
          bind:value={text}
          aria-describedby={shownError ? `${errorId} ${hintId}` : hintId}
          aria-invalid={shownError ? 'true' : undefined}
          onfocus={() => (textFocused = true)}
          onblur={() => {
            textFocused = false;
            if (text.trim() && (!value || text !== formatLatLon(value.lat, value.lon)))
              applyText('paste');
          }}
          onpaste={onPaste}
          onkeydown={onTextKeydown}
        />
        <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => applyText()}
          >Set</button
        >
      </div>
      {#if shownError}<p class="dl-picker-error" id={errorId}>{shownError}</p>{/if}
      <p class="dl-picker-hint" id={hintId}>
        Paste “lat, lon” in either order, degrees-minutes-seconds or a map link.
      </p>
    </div>
    <div class="dl-picker-actions">
      {#if canLocate}
        <button
          type="button"
          class="dl-btn dl-btn-ghost dl-btn-sm"
          disabled={locating}
          onclick={locate}>{locating ? 'Locating…' : 'Use my location'}</button
        >
      {/if}
      {#if country && mapState === 'ready'}
        <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={frameCountry}
          >Zoom to country</button
        >
      {/if}
      {#if value && mapState === 'ready'}
        <button type="button" class="dl-btn dl-btn-ghost dl-btn-sm" onclick={() => flyTo(value!)}
          >Show the pin</button
        >
      {/if}
    </div>
  </div>
</div>

<style>
  .dl-picker {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-2);
  }
  .dl-picker-map {
    position: relative;
    height: clamp(260px, 48vh, 460px);
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    overflow: hidden;
    background: var(--dl-color-bg);
  }
  .compact .dl-picker-map {
    height: clamp(200px, 32vh, 300px);
  }
  .dl-picker-canvas {
    position: absolute;
    inset: 0;
  }
  .dl-picker-status {
    position: absolute;
    left: 50%;
    bottom: var(--dl-space-3);
    transform: translateX(-50%);
    margin: 0;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--dl-color-bg-elevated);
    border: 1px solid var(--dl-color-border-strong);
    color: var(--dl-color-text);
    font-size: var(--dl-text-sm);
    pointer-events: none;
    white-space: nowrap;
  }
  .dl-picker-keys,
  .dl-picker-hint,
  .dl-picker-off {
    margin: 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
  }
  .dl-picker-off {
    padding: var(--dl-space-3);
    border: 1px dashed var(--dl-color-border-control);
    border-radius: var(--dl-radius);
  }
  .dl-picker-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--dl-space-2) var(--dl-space-4);
  }
  .dl-picker-field {
    flex: 1 1 280px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .dl-picker-field label {
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .dl-picker-row {
    display: flex;
    gap: var(--dl-space-2);
  }
  .dl-picker-row input {
    flex: 1 1 auto;
    min-width: 0;
    font-family: var(--dl-font-mono);
  }
  .dl-picker-error {
    margin: 0;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-error);
  }
  .dl-picker-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dl-space-2);
    padding-top: 22px;
  }
  .dl-picker-map :global(.picker-pin) {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--dl-color-warm);
    border: 3px solid var(--dl-color-bg);
    box-shadow: 0 0 0 6px var(--dl-color-warm-soft);
    cursor: grab;
  }
  .dl-picker-map :global(.picker-other) {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-xs);
    pointer-events: none;
  }
  .dl-picker-map :global(.picker-other i) {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--dl-color-accent);
    border: 1.5px solid var(--dl-color-bg);
  }
  .dl-picker-map :global(.picker-other span) {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--dl-color-bg-elevated);
    white-space: nowrap;
  }
  .dl-picker-map :global(canvas:focus-visible) {
    outline: var(--dl-focus-ring);
    outline-offset: -3px;
  }
  @media (max-width: 700px) {
    .dl-picker-map {
      height: min(62vh, 420px);
    }
    .dl-picker-actions {
      padding-top: 0;
    }
  }
</style>
