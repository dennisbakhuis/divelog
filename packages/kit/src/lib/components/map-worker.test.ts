import { describe, expect, it } from 'vitest';
import { mapWorkerUrl, setMapWorkerUrl } from './map-worker';

describe('map worker URL', () => {
  it('is unset until the app sets it', () => {
    expect(mapWorkerUrl()).toBeNull();
    setMapWorkerUrl('/assets/worker.js');
    expect(mapWorkerUrl()).toBe('/assets/worker.js');
  });
});
