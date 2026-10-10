<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Map as MapLibreMap } from 'maplibre-gl';
  import type { NearbySite } from '$lib/core/dive/types';
  import {
    absoluteTilesBase,
    archiveFor,
    minZoomFor,
    siteFlavor,
    startZoom,
    type TileIndex,
  } from '$lib/core/map/locator';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '$lib/styles/maplibre.css';
  // MapLibre derives its worker URL from import.meta.url, which Vite's dependency
  // pre-bundling breaks; an explicit asset URL works in dev and in the build.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let {
    lat,
    lon,
    name,
    siteType,
    access = null,
    nearby = [],
    children,
  }: {
    lat: number;
    lon: number;
    name: string;
    siteType: string;
    access?: { lat: number; lon: number } | null;
    nearby?: NearbySite[];
    /** Shown until the map has drawn, and for good when no tiles cover the site. */
    children?: Snippet;
  } = $props();

  let container: HTMLDivElement | undefined = $state();
  let ready = $state(false);

  function pin(className: string, title: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    el.title = title;
    return el;
  }

  function nearbyPin(other: NearbySite): HTMLAnchorElement {
    const el = document.createElement('a');
    el.className = 'nearby-pin';
    el.href = urls.site(other.slug);
    el.title = `${other.name} · ${other.distance_km} km`;
    const dot = document.createElement('i');
    const label = document.createElement('span');
    label.textContent = other.name;
    el.append(dot, label);
    return el;
  }

  onMount(() => {
    let map: MapLibreMap | undefined;
    let cancelled = false;

    (async () => {
      const [maplibre, { Protocol }, { layers }, index] = await Promise.all([
        import('maplibre-gl'),
        import('pmtiles'),
        import('@protomaps/basemaps'),
        fetch(urls.tiles('index.json'), { cache: 'no-cache' }).then((r) =>
          r.ok ? (r.json() as Promise<TileIndex>) : null,
        ),
      ]);
      if (cancelled || !container || !index) return;
      const archive = archiveFor(index, lat, lon);
      if (!archive) return;

      maplibre.setWorkerUrl(workerUrl);
      maplibre.addProtocol('pmtiles', new Protocol().tile);
      const base = absoluteTilesBase(urls.tilesBase, location.origin);
      const instance = new maplibre.Map({
        container,
        style: {
          version: 8,
          glyphs: `${base}/assets/fonts/{fontstack}/{range}.pbf`,
          sprite: `${base}/assets/sprites/v4/dark`,
          sources: {
            protomaps: {
              type: 'vector',
              url: `pmtiles://${base}/${archive.file}`,
              attribution: index.attribution,
            },
          },
          layers: layers('protomaps', siteFlavor(), { lang: 'en' }),
        },
        center: [lon, lat],
        zoom: startZoom(siteType),
        minZoom: minZoomFor(archive.bbox),
        maxZoom: 18,
        maxBounds: archive.bbox,
        cooperativeGestures: true,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map = instance;
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      instance.addControl(new maplibre.ScaleControl({ unit: 'metric' }), 'bottom-left');

      for (const other of nearby) {
        new maplibre.Marker({ element: nearbyPin(other) })
          .setLngLat([other.lon, other.lat])
          .addTo(instance);
      }
      if (access) {
        new maplibre.Marker({ element: pin('entry-pin', 'Entry point') })
          .setLngLat([access.lon, access.lat])
          .addTo(instance);
      }
      new maplibre.Marker({ element: pin('site-pin', name) }).setLngLat([lon, lat]).addTo(instance);

      instance.on('load', () => {
        if (access) {
          instance.addSource('access', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [
                  [access.lon, access.lat],
                  [lon, lat],
                ],
              },
            },
          });
          instance.addLayer({
            id: 'access-line',
            type: 'line',
            source: 'access',
            paint: { 'line-color': '#4cc9f0', 'line-width': 2, 'line-dasharray': [2, 2] },
          });
        }
        ready = true;
      });

      // An offshore wreck at the default zoom is a dot on empty water: back out
      // until some land or a reef gives the position meaning.
      const ensureContext = () => {
        const context = instance
          .queryRenderedFeatures()
          .filter((f) => !f.layer.id.startsWith('water'));
        if (instance.getZoom() <= 9 || context.length >= 4) return;
        instance.zoomTo(instance.getZoom() - 1, { duration: 0 });
        instance.once('idle', ensureContext);
      };
      instance.once('idle', ensureContext);
    })().catch(() => {
      // Tiles unavailable: the fallback stays.
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  });
</script>

<div class="locator ml" class:ready>
  <div class="canvas" bind:this={container} role="region" aria-label="Map of {name}"></div>
  {#if !ready}
    <div class="fallback">{@render children?.()}</div>
  {/if}
</div>

<style>
  .locator {
    position: relative;
    height: 100%;
    min-height: 340px;
    border-radius: inherit;
    overflow: hidden;
    background: var(--dl-color-bg-elevated);
  }
  .canvas,
  .fallback {
    position: absolute;
    inset: 0;
  }
  .canvas {
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .ready .canvas {
    opacity: 1;
  }
  .fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }
  .fallback :global(svg) {
    width: 100%;
    height: auto;
    max-height: 100%;
  }

  .locator :global(.site-pin) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--dl-color-warm);
    border: 2px solid var(--dl-color-bg);
    box-shadow: 0 0 0 6px var(--dl-color-warm-soft);
  }
  .locator :global(.entry-pin) {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--dl-color-accent);
    border: 2px solid var(--dl-color-bg);
  }
  .locator :global(.nearby-pin) {
    display: flex;
    align-items: center;
    gap: 5px;
    text-decoration: none;
    color: var(--dl-color-text-muted);
    font-size: 11px;
    white-space: nowrap;
    transform: translateX(3px);
  }
  .locator :global(.nearby-pin i) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dl-color-text-muted);
    border: 1.5px solid var(--dl-color-bg);
    flex: none;
  }
  .locator :global(.nearby-pin span) {
    display: none;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--dl-color-bg-elevated);
    border: 1px solid var(--dl-color-border-strong);
  }
  .locator :global(.nearby-pin:hover),
  .locator :global(.nearby-pin:focus-visible) {
    color: var(--dl-color-text);
    z-index: 2;
  }
  .locator :global(.nearby-pin:hover span),
  .locator :global(.nearby-pin:focus-visible span) {
    display: inline;
  }
</style>
