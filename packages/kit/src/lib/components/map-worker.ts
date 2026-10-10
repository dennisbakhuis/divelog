/**
 * Where MapLibre's worker lives. MapLibre derives it from `import.meta.url`,
 * which Vite's dependency pre-bundling breaks, and a library cannot carry a
 * Vite `?worker&url` import of its own (the consumer's pre-bundler cannot load
 * it). So the app imports the asset and hands its URL over once:
 *
 *   import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
 *   setMapWorkerUrl(workerUrl);
 */
let workerUrl: string | null = null;

/** Set the URL of MapLibre's worker for every map the kit draws. */
export function setMapWorkerUrl(url: string): void {
  workerUrl = url;
}

/** The URL set with `setMapWorkerUrl`, or null to leave MapLibre's own guess. */
export function mapWorkerUrl(): string | null {
  return workerUrl;
}
