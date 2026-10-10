<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
  import type { CountryStat, DiveListItem, MapSite } from '$lib/core/dive/types';
  import {
    absoluteTilesBase,
    archiveForTile,
    DETAIL_MIN_ZOOM,
    detailMaxZoom,
    siteFlavor,
    type TileIndex,
  } from '$lib/core/map/locator';
  import {
    HOME_VIEW,
    jumpTargets,
    sameView,
    sitesToGeoJSON,
    tallySites,
    type BBox,
    type GlobeView,
    type SiteFeature,
    type SiteProperties,
  } from '$lib/core/map/globe';
  import {
    colourScale,
    SIZE_MODES,
    type ColourMode,
    type MapOptionsPatch,
    type SizeMode,
  } from '$lib/core/dive/stats-view';
  import { flagEmoji, formatDate, formatMinutes, pluralize } from '$lib/core/dive/format';
  import { reducedMotion } from '$lib/components/anim/motion';
  import MapKey from './MapKey.svelte';
  import MapOptions from './MapOptions.svelte';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '$lib/styles/maplibre.css';
  import { mapWorkerUrl } from '$lib/components/map-worker';
  import { getDivelog } from '$lib/core/dive/context';
  import Disclosure from '$lib/components/ui/Disclosure.svelte';

  const { urls } = getDivelog();

  let {
    sites,
    countries = [],
    dives = [],
    filtered = false,
    activeSite = '',
    size = 'dives',
    colour = 'type',
    fit = null,
    view = $bindable(null),
    onSelect,
    onOptions,
    children,
  }: {
    sites: MapSite[];
    countries?: CountryStat[];
    /** The dives the filters keep; the dots take their numbers from these and a popup lists them. */
    dives?: DiveListItem[];
    /** True when `dives` is a selection, so sites with none of them fade. */
    filtered?: boolean;
    activeSite?: string;
    size?: SizeMode;
    colour?: ColourMode;
    /** Frame these bounds at first instead of the whole spinning world, as a trip page wants. */
    fit?: BBox | null;
    /**
     * The camera, kept in sync with the globe; set from outside (a restored page
     * snapshot) it moves the globe there and skips the intro spin.
     */
    view?: GlobeView | null;
    /** Pins the log to a site, or unpins it with an empty slug. */
    onSelect?: (slug: string) => void;
    onOptions?: (patch: MapOptionsPatch) => void;
    /** The static map, shown until the globe has drawn and for good without tiles or WebGL. */
    children?: Snippet;
  } = $props();

  const MAX_ZOOM = 18;
  const SPIN_DEGREES = 8;
  const SPIN_MS = 4000;
  const POPUP_DIVES = 6;
  const FIT_OPTIONS = { padding: 60, maxZoom: 7, pitch: 0, bearing: 0 };
  const LABELS_KEY = 'dive-globe-labels';

  let container: HTMLDivElement | undefined = $state();
  let map: MapLibreMap | undefined;
  let ready = $state(false);
  let loaded = $state(false);
  let spinning = $state(false);
  /** False when the globe never spins: a fitted view or reduced motion. */
  let canSpin = $state(false);
  let popupEl = $state<HTMLElement>();
  let popupOpener: HTMLElement | null = null;
  let inView = $state<MapSite[]>([]);
  // Set by the home button: pick the spin back up once the fly-home has landed.
  let resumeSpin = false;
  let hovered = $state<SiteProperties | null>(null);
  let pointer = $state({ x: 0, y: 0, flip: false });
  let touch = $state(false);
  let labels = $state(true);
  let selectedSlug = $state<string | null>(null);

  const scale = $derived(colourScale(sites, colour));
  const targets = $derived(jumpTargets(sites, countries));
  const totalDives = $derived(sites.reduce((n, s) => n + s.dives, 0));
  const tally = $derived(filtered ? tallySites(dives) : null);

  // Paint expressions cannot read CSS custom properties, so the dot colours are
  // resolved against the map element (the `--dl-*` tokens live on the
  // DivelogProvider wrapper) once the component is in the browser.
  const resolved: Record<string, string> = {};
  function resolve(value: string): string {
    const token = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    if (!token || !container) return value;
    resolved[token] ??= getComputedStyle(container).getPropertyValue(token).trim() || value;
    return resolved[token];
  }

  const data = $derived(sitesToGeoJSON(sites, { size, colour, activeSite, tally, resolve }));

  $effect(() => {
    const next = data;
    if (!loaded || !map) return;
    (map.getSource('sites') as GeoJSONSource | undefined)?.setData(next);
  });

  $effect(() => {
    const on = labels;
    if (!loaded || !map) return;
    map.setLayoutProperty('site-label', 'visibility', on ? 'visible' : 'none');
  });

  function setLabels(on: boolean) {
    labels = on;
    try {
      localStorage.setItem(LABELS_KEY, on ? '1' : '0');
    } catch {
      // Private mode or blocked storage: the choice just does not stick.
    }
  }

  // The popup reads the live feature, so it follows the filters while it is open.
  const selected = $derived(
    selectedSlug ? (data.features.find((f) => f.properties.slug === selectedSlug) ?? null) : null,
  );
  const selectedDives = $derived(
    selected
      ? dives
          .filter((d) => d.site?.slug === selected.properties.slug)
          .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
      : [],
  );

  /** Close the site popup; with `restore`, focus returns to whatever opened it. */
  function closePopup(restore = false) {
    if (!selectedSlug) return;
    selectedSlug = null;
    const target = popupOpener;
    popupOpener = null;
    if (restore && target?.isConnected) target.focus();
  }

  function openPopup(feature: SiteFeature) {
    const active = document.activeElement;
    if (!selectedSlug)
      popupOpener = active instanceof HTMLElement && active !== document.body ? active : null;
    selectedSlug = feature.properties.slug;
    hovered = null;
    map?.easeTo({ center: feature.geometry.coordinates, duration: 700 });
    void tick().then(() => popupEl?.focus());
  }

  /** Open a site's popup from the keyboard list of the sites in view. */
  function openFromList(slug: string) {
    const feature = data.features.find((f) => f.properties.slug === slug);
    if (feature) {
      stopSpin();
      openPopup(feature);
    }
  }

  function toggleSpin() {
    if (spinning) {
      stopSpin();
      return;
    }
    spinning = true;
    spin();
  }

  /** The sites inside the camera's bounds, most dived first: the keyboard path to the dots. */
  function updateInView(instance: MapLibreMap) {
    const bounds = instance.getBounds();
    inView = sites
      .filter((s) => bounds.contains([s.lon, s.lat]))
      .sort((a, b) => b.dives - a.dives || a.name.localeCompare(b.name));
  }

  // The last camera the globe itself reported; any other `view` came from outside.
  let emitted: GlobeView | null = null;
  $effect(() => {
    const next = view;
    if (!next || !map || sameView(next, emitted)) return;
    stopSpin();
    emitted = next;
    map.jumpTo(next);
  });

  function currentView(instance: MapLibreMap): GlobeView {
    const { lng, lat } = instance.getCenter();
    return {
      center: [lng, lat],
      zoom: instance.getZoom(),
      bearing: instance.getBearing(),
      pitch: instance.getPitch(),
    };
  }

  function homeControl(): import('maplibre-gl').IControl {
    let root: HTMLDivElement | undefined;
    return {
      onAdd() {
        root = document.createElement('div');
        root.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'globe-home';
        button.title = 'Whole world';
        button.setAttribute('aria-label', 'Whole world');
        button.innerHTML =
          '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z"/></svg>';
        button.addEventListener('click', flyHome);
        root.append(button);
        return root;
      },
      onRemove() {
        root?.remove();
      },
    };
  }

  function stopSpin() {
    resumeSpin = false;
    if (!spinning) return;
    spinning = false;
    map?.stop();
  }

  function spin() {
    if (!spinning || !map) return;
    const center = map.getCenter();
    map.easeTo({
      center: [center.lng + SPIN_DEGREES, center.lat],
      duration: SPIN_MS,
      easing: (t) => t,
      essential: false,
    });
  }

  function flyHome() {
    stopSpin();
    closePopup();
    if (fit) {
      map?.fitBounds(fit, { ...FIT_OPTIONS, duration: 1600 });
      return;
    }
    resumeSpin = !reducedMotion();
    map?.flyTo({ ...HOME_VIEW, duration: 1600 });
  }

  function flyTo(bounds: BBox) {
    stopSpin();
    closePopup();
    map?.fitBounds(bounds, { ...FIT_OPTIONS, duration: 1600 });
  }

  function select(slug: string) {
    onSelect?.(activeSite === slug ? '' : slug);
  }

  onMount(() => {
    let cancelled = false;
    touch = window.matchMedia('(pointer: coarse)').matches;
    try {
      labels = localStorage.getItem(LABELS_KEY) !== '0';
    } catch {
      labels = true;
    }

    (async () => {
      const [maplibre, { Protocol }, { layers }, index] = await Promise.all([
        import('maplibre-gl'),
        import('pmtiles'),
        import('@protomaps/basemaps'),
        fetch(urls.tiles('index.json'), { cache: 'no-cache' }).then((r) =>
          r.ok ? (r.json() as Promise<TileIndex>) : null,
        ),
      ]);
      if (cancelled || !container || !index?.world) return;

      const workerUrl = mapWorkerUrl();
      if (workerUrl) maplibre.setWorkerUrl(workerUrl);
      const protocol = new Protocol();
      maplibre.addProtocol('pmtiles', protocol.tile);
      const base = absoluteTilesBase(urls.tilesBase, location.origin);
      // Past the world archive's zoom the regional archives take over: each tile
      // request is routed to the archive that covers it, and comes back empty elsewhere.
      maplibre.addProtocol('detail', (params, abort) => {
        const m = /^detail:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
        const archive = m && archiveForTile(index, +m[1], +m[2], +m[3]);
        if (!archive) return Promise.resolve({ data: new Uint8Array() });
        return protocol.tile(
          { ...params, url: `pmtiles://${base}/${archive.file}/${m[1]}/${m[2]}/${m[3]}` },
          abort,
        );
      });
      const detailZoom = detailMaxZoom(index);
      const flavor = siteFlavor();
      const detailLayers =
        detailZoom >= DETAIL_MIN_ZOOM
          ? layers('detail', flavor, { lang: 'en' }).map((layer) => ({
              ...layer,
              id: `detail-${layer.id}`,
              minzoom: Math.max(layer.minzoom ?? 0, DETAIL_MIN_ZOOM),
            }))
          : [];
      const bg = resolve('var(--dl-color-bg)');
      const accent = resolve('var(--dl-color-accent)');
      const warm = resolve('var(--dl-color-warm)');
      const text = resolve('var(--dl-color-text)');

      const instance = new maplibre.Map({
        container,
        style: {
          version: 8,
          projection: { type: 'globe' },
          sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
          glyphs: `${base}/assets/fonts/{fontstack}/{range}.pbf`,
          sprite: `${base}/assets/sprites/v4/dark`,
          sources: {
            protomaps: {
              type: 'vector',
              url: `pmtiles://${base}/${index.world.file}`,
              attribution: index.attribution,
            },
            ...(detailLayers.length
              ? {
                  detail: {
                    type: 'vector' as const,
                    tiles: ['detail://{z}/{x}/{y}'],
                    minzoom: DETAIL_MIN_ZOOM,
                    maxzoom: detailZoom,
                  },
                }
              : {}),
          },
          layers: [...layers('protomaps', flavor, { lang: 'en' }), ...detailLayers],
        },
        ...(view ?? (fit ? {} : HOME_VIEW)),
        ...(view || !fit ? {} : { bounds: fit, fitBoundsOptions: FIT_OPTIONS }),
        minZoom: 0.8,
        maxZoom: MAX_ZOOM,
        maxPitch: 60,
        cooperativeGestures: true,
        attributionControl: { compact: true },
      });
      map = instance;
      if (view) emitted = view;
      instance.addControl(new maplibre.NavigationControl({ visualizePitch: true }), 'top-right');
      instance.addControl(homeControl(), 'top-right');
      const fullscreen = new maplibre.FullscreenControl();
      instance.addControl(fullscreen, 'top-right');
      instance.addControl(new maplibre.ScaleControl({ unit: 'metric' }), 'bottom-left');
      // Fullscreen leaves nothing to scroll past, so one finger may move the globe there.
      fullscreen.on('fullscreenstart', () => instance.cooperativeGestures.disable());
      fullscreen.on('fullscreenend', () => instance.cooperativeGestures.enable());

      instance.on('load', () => {
        instance.addSource('sites', {
          type: 'geojson',
          data,
          cluster: true,
          clusterRadius: 32,
          clusterMaxZoom: 8,
          clusterProperties: { dives: ['+', ['get', 'sel']], total: ['+', ['get', 'total']] },
        });
        // A cluster with nothing in the selection keeps its size from the whole log, faded.
        const clusterCount = [
          'case',
          ['>', ['get', 'dives'], 0],
          ['get', 'dives'],
          ['get', 'total'],
        ];
        const clusterFaded = ['==', ['get', 'dives'], 0];
        const clusterRadius = [
          '+',
          9,
          ['*', 13, ['sqrt', ['/', clusterCount, Math.max(totalDives, 1)]]],
        ];
        instance.addLayer({
          id: 'cluster-halo',
          type: 'circle',
          source: 'sites',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': accent,
            'circle-opacity': ['case', clusterFaded, 0.04, 0.18] as never,
            'circle-radius': ['*', clusterRadius, 1.8] as never,
          },
        });
        instance.addLayer({
          id: 'cluster-circle',
          type: 'circle',
          source: 'sites',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': accent,
            'circle-opacity': ['case', clusterFaded, 0.3, 1] as never,
            'circle-radius': clusterRadius as never,
            'circle-stroke-color': bg,
            'circle-stroke-width': 2,
            'circle-stroke-opacity': ['case', clusterFaded, 0.3, 1] as never,
          },
        });
        instance.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'sites',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['to-string', clusterCount] as never,
            'text-font': ['Noto Sans Medium'],
            'text-size': 12,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': bg, 'text-opacity': ['case', clusterFaded, 0.5, 1] as never },
        });
        instance.addLayer({
          id: 'site-halo',
          type: 'circle',
          source: 'sites',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'fill'],
            'circle-opacity': ['case', ['==', ['get', 'dim'], 1], 0.04, 0.18],
            'circle-radius': ['*', ['get', 'r'], 2.2],
          },
        });
        instance.addLayer({
          id: 'site-dot',
          type: 'circle',
          source: 'sites',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'fill'],
            'circle-opacity': ['case', ['==', ['get', 'dim'], 1], 0.3, 1],
            'circle-radius': ['get', 'r'],
            'circle-stroke-color': ['case', ['==', ['get', 'active'], 1], warm, bg],
            'circle-stroke-width': ['case', ['==', ['get', 'active'], 1], 2.5, 1.2],
            'circle-stroke-opacity': ['case', ['==', ['get', 'dim'], 1], 0.3, 1],
          },
        });
        instance.addLayer({
          id: 'site-label',
          type: 'symbol',
          source: 'sites',
          filter: ['!', ['has', 'point_count']],
          layout: {
            visibility: labels ? 'visible' : 'none',
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11.5,
            'text-max-width': 9,
            'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
            'text-radial-offset': ['/', ['+', ['get', 'r'], 4], 11.5],
            'text-justify': 'auto',
            'text-optional': true,
          },
          paint: {
            'text-color': text,
            'text-halo-color': bg,
            'text-halo-width': 1.4,
            'text-opacity': ['case', ['==', ['get', 'dim'], 1], 0.35, 1],
          },
        });
        loaded = true;
        ready = true;
        updateInView(instance);
        const canvasEl = instance.getCanvas();
        canvasEl.setAttribute('role', 'img');
        canvasEl.setAttribute(
          'aria-label',
          `Globe of ${pluralize(sites.length, 'dive site')}; use the list of sites in view below to open one`,
        );

        canSpin = !reducedMotion() && !fit;
        if (canSpin && !view) {
          spinning = true;
          spin();
        }
      });

      instance.on('moveend', () => {
        updateInView(instance);
        emitted = currentView(instance);
        view = emitted;
        if (resumeSpin) {
          resumeSpin = false;
          spinning = true;
        }
        spin();
      });
      // A fly-to leaves the pointer where it was, so no mouseleave ever fires.
      instance.on('movestart', () => (hovered = null));
      for (const event of ['mousedown', 'touchstart', 'wheel', 'dragstart'] as const) {
        instance.on(event, stopSpin);
      }
      instance.getCanvas().addEventListener('keydown', stopSpin);

      const canvas = instance.getCanvas();
      instance.on('mousemove', 'site-dot', (e) => {
        canvas.style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature) return;
        hovered = feature.properties as SiteProperties;
        pointer = {
          x: e.point.x,
          y: e.point.y,
          flip: e.point.x > instance.getCanvas().clientWidth / 2,
        };
      });
      instance.on('mouseleave', 'site-dot', () => {
        canvas.style.cursor = '';
        hovered = null;
      });
      instance.on('mouseenter', 'cluster-circle', () => (canvas.style.cursor = 'pointer'));
      instance.on('mouseleave', 'cluster-circle', () => (canvas.style.cursor = ''));

      instance.on('click', (e: MapMouseEvent) => {
        const hit = instance.queryRenderedFeatures(e.point, {
          layers: ['site-dot', 'cluster-circle'],
        });
        if (!hit.length) closePopup();
      });
      instance.on('click', 'site-dot', (e: MapMouseEvent) => {
        const feature = instance.queryRenderedFeatures(e.point, { layers: ['site-dot'] })[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        openPopup({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: feature.geometry.coordinates as [number, number],
          },
          properties: feature.properties as SiteProperties,
        });
      });
      instance.on('click', 'cluster-circle', async (e: MapMouseEvent) => {
        const feature = instance.queryRenderedFeatures(e.point, { layers: ['cluster-circle'] })[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const source = instance.getSource('sites') as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id as number);
        instance.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.min(zoom + 0.4, MAX_ZOOM),
          duration: 900,
        });
      });
    })().catch(() => {
      // No tiles or no WebGL: the static map stays.
    });

    return () => {
      cancelled = true;
      map?.remove();
      map = undefined;
    };
  });
</script>

{#snippet sizeHint()}
  dot size = {SIZE_MODES.find((m) => m.mode === size)?.label} · click a dot for its dives
{/snippet}

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && selectedSlug) closePopup(true);
  }}
/>

<div class="globe ml" class:ready>
  <div class="stage">
    <div class="canvas" bind:this={container}></div>
    {#if !ready}
      <div class="fallback">{@render children?.()}</div>
    {/if}
    <div
      class="tooltip"
      class:visible={hovered}
      class:flip={pointer.flip}
      style="left: {pointer.x}px; top: {pointer.y}px"
      aria-hidden="true"
    >
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
    {#if ready && !selected}
      <p class="how">
        {touch
          ? 'two fingers to turn and zoom · tap a dot for its dives'
          : 'drag to turn · ⌘/ctrl + scroll to zoom · click a dot for its dives'}
      </p>
    {/if}
    {#if selected}
      {@const site = selected.properties}
      <div class="popup" role="dialog" aria-label={site.name} tabindex="-1" bind:this={popupEl}>
        <button type="button" class="close" aria-label="Close" onclick={() => closePopup(true)}
          ><span aria-hidden="true">×</span></button
        >
        <header>
          <strong
            >{flagEmoji(site.country_code)}
            <a href={urls.site(site.slug)}>{site.name}</a></strong
          >
          <span class="dl-num faint"
            >{site.site_type} · {site.first_year === site.last_year
              ? site.last_year
              : `${site.first_year}–${site.last_year}`}</span
          >
        </header>
        <p class="dl-num stats">
          {#if site.dim && tally && !tally.has(site.slug)}
            None of the {pluralize(site.total, 'dive')} here match the current filters.
          {:else}
            {pluralize(site.dives, 'dive')} · {formatMinutes(site.minutes)} · max {site.max_depth_m} m
            {#if site.total !== site.dives}<span class="faint">· {site.total} in all</span>{/if}
          {/if}
        </p>
        {#if selectedDives.length}
          <ul class="dives">
            {#each selectedDives.slice(0, POPUP_DIVES) as dive (dive.number)}
              <li>
                <a href={urls.dive(dive.number)}>
                  <span class="dl-num no">#{dive.number}</span>
                  {#if dive.title}<span class="title">{dive.title}</span>{/if}
                  <span class="dl-num faint"
                    >{formatDate(dive.date)} · {dive.max_depth_m} m · {formatMinutes(
                      dive.duration_min,
                    )}</span
                  >
                </a>
              </li>
            {/each}
          </ul>
        {/if}
        <footer>
          {#if onSelect}
            <button
              type="button"
              class="chip"
              class:active={activeSite === site.slug}
              onclick={() => select(site.slug)}
            >
              {#if activeSite === site.slug}
                Unpin the log ×
              {:else if selectedDives.length > POPUP_DIVES}
                All {selectedDives.length} in the log ↓
              {:else}
                Pin the log to this site ↓
              {/if}
            </button>
          {/if}
          <a class="chip" href={urls.site(site.slug)}>Site page →</a>
        </footer>
      </div>
    {/if}
  </div>

  {#if ready}
    <div class="chips">
      {#if canSpin}
        <button
          type="button"
          class="chip"
          class:active={!spinning}
          aria-pressed={!spinning}
          onclick={toggleSpin}>Pause rotation</button
        >
      {/if}
      <button type="button" class="chip" onclick={flyHome}>{fit ? '↺ Trip' : '🌍 World'}</button>
      {#each targets as target (target.code)}
        <button type="button" class="chip" onclick={() => flyTo(target.bounds)}>
          {target.label} <span class="dl-num">{target.dives}</span>
        </button>
      {/each}
    </div>
  {/if}

  <MapKey {colour} {scale} hint={sizeHint} />
  {#if ready || onOptions}
    <MapOptions {size} {colour} labels={ready ? labels : null} {onOptions} onLabels={setLabels} />
  {/if}

  {#if ready}
    <Disclosure summary="Sites in view" count={inView.length} class="in-view">
      {#if inView.length}
        <ul class="in-view-list">
          {#each inView as site (site.slug)}
            <li>
              <button
                type="button"
                class="in-view-site"
                aria-pressed={selectedSlug === site.slug}
                onclick={() => openFromList(site.slug)}
              >
                <span aria-hidden="true">{flagEmoji(site.country_code)}</span>
                {site.name}
                <span class="dl-num faint">{pluralize(site.dives, 'dive')}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="in-view-none">No dive sites in view; zoom out or pick a country above.</p>
      {/if}
    </Disclosure>
  {/if}
</div>

<style>
  .globe {
    position: relative;
  }
  .stage {
    position: relative;
    aspect-ratio: 16 / 10;
    min-height: 420px;
    overflow: hidden;
    border-radius: var(--dl-radius);
    background:
      radial-gradient(
        ellipse 60% 70% at 50% 50%,
        color-mix(in srgb, var(--dl-color-accent) 12%, transparent),
        transparent 70%
      ),
      var(--dl-color-bg);
  }
  @media (max-width: 640px) {
    .stage {
      aspect-ratio: auto;
      height: 72vh;
      border-radius: 0;
      margin: 0 calc(-1 * var(--dl-space-page-x, 16px));
    }
  }
  .canvas,
  .fallback {
    position: absolute;
    inset: 0;
  }
  .canvas {
    opacity: 0;
    transition: opacity 0.6s ease;
  }
  .ready .canvas {
    opacity: 1;
  }
  .canvas :global(.maplibregl-canvas) {
    outline: none;
  }
  .fallback {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .fallback :global(.map) {
    width: 100%;
    max-height: 100%;
    background: transparent;
    border: 0;
  }
  /* The globe draws its own key below the stage. */
  .fallback :global(.legend) {
    display: none;
  }
  .how {
    position: absolute;
    left: 12px;
    bottom: 28px;
    margin: 0;
    font-family: var(--dl-font-mono);
    font-size: 11px;
    color: var(--dl-color-text-faint);
    pointer-events: none;
  }
  .tooltip {
    position: absolute;
    transform: translate(14px, 14px);
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
    white-space: nowrap;
    z-index: 2;
  }
  .tooltip.flip {
    transform: translate(calc(-100% - 14px), 14px);
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
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 14px 8px 2px;
  }
  .chip {
    font: inherit;
    font-size: 13px;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-strong);
    border-radius: 999px;
    padding: 5px 12px;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }
  .chip:hover,
  .chip:focus-visible {
    border-color: var(--dl-color-accent);
    background: var(--dl-color-bg-elevated);
  }
  .chip .dl-num {
    color: var(--dl-color-text-muted);
    font-size: 12px;
    margin-left: 4px;
  }
  .chip.active {
    border-color: var(--dl-color-accent);
    color: var(--dl-color-accent);
  }
  .popup {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 3;
    width: min(320px, calc(100% - 24px));
    max-height: calc(100% - 24px);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px 12px;
    border-radius: var(--dl-radius);
    background: color-mix(in srgb, var(--dl-color-bg-elevated) 94%, transparent);
    border: 1px solid var(--dl-color-border-strong);
    box-shadow: var(--dl-shadow-md);
    backdrop-filter: blur(6px);
    font-size: 13.5px;
  }
  .popup:focus {
    outline: none;
  }
  .popup:focus-visible {
    outline: var(--dl-focus-ring);
    outline-offset: var(--dl-focus-offset);
  }
  .globe :global(.in-view) {
    margin-top: 12px;
  }
  .globe :global(.in-view .dl-disclosure-summary) {
    font-size: var(--dl-text-md);
    min-height: 40px;
  }
  .in-view-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 4px 12px;
    max-height: 320px;
    overflow: auto;
  }
  .in-view-site {
    display: flex;
    gap: 6px;
    align-items: baseline;
    width: 100%;
    min-height: 32px;
    padding: 4px 8px;
    font: inherit;
    font-size: var(--dl-text-md);
    text-align: left;
    color: var(--dl-color-text);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--dl-radius-sm);
    cursor: pointer;
  }
  .in-view-site:hover,
  .in-view-site[aria-pressed='true'] {
    border-color: var(--dl-color-accent);
  }
  .in-view-site .faint {
    margin-left: auto;
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-sm);
  }
  .in-view-none {
    margin: 0;
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-md);
  }
  .popup header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 24px;
  }
  .popup header strong {
    font-size: 15px;
  }
  .popup header a {
    color: var(--dl-color-text);
    text-decoration: none;
  }
  .popup header a:hover {
    color: var(--dl-color-accent);
  }
  .popup .faint {
    color: var(--dl-color-text-faint);
    font-size: 12px;
  }
  .popup .stats {
    margin: 0;
    color: var(--dl-color-text-muted);
    font-size: 12.5px;
  }
  .popup .close {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--dl-color-text-muted);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
  .popup .close:hover {
    background: var(--dl-color-surface-2);
    color: var(--dl-color-text);
  }
  .dives {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--dl-color-border);
  }
  .dives a {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--dl-color-border);
    text-decoration: none;
    color: var(--dl-color-text);
  }
  .dives a:hover .title {
    color: var(--dl-color-accent);
  }
  .dives .no {
    color: var(--dl-color-text-muted);
    font-size: 12px;
    grid-row: 1 / -1;
    padding-top: 2px;
  }
  .dives .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .popup footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .popup footer .chip {
    text-decoration: none;
  }
  @media (max-width: 640px) {
    .popup {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      max-height: 60%;
      border-radius: var(--dl-radius) var(--dl-radius) 0 0;
    }
  }
</style>
