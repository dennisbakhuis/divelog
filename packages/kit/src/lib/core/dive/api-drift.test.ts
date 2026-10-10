import { describe, expectTypeOf, it } from 'vitest';
import type { components } from './api';
import type {
  DiveMapAnnotation,
  MapArea,
  MapEdge,
  MapLine,
  MapNode,
  SiteMap,
  SiteMapOut,
} from './sitemap.js';

type Schemas = components['schemas'];

// sitemap.ts stays hand-written because it carries behaviour; these checks are compile-time
// (svelte-check) and catch drift between it and the backend schemas in either direction.
describe('hand-written map types match the generated API schema', () => {
  it('reads what the API sends', () => {
    expectTypeOf<Schemas['SiteMapOut']>().toExtend<SiteMapOut>();
    expectTypeOf<Schemas['DiveMapAnnotation-Output']>().toExtend<DiveMapAnnotation>();
    expectTypeOf<Schemas['MapNode-Output']>().toExtend<MapNode>();
    expectTypeOf<Schemas['MapEdge-Output']>().toExtend<MapEdge>();
    expectTypeOf<Schemas['MapArea-Output']>().toExtend<MapArea>();
    expectTypeOf<Schemas['MapLine-Output']>().toExtend<MapLine>();
  });

  it('sends what the API accepts', () => {
    expectTypeOf<SiteMap>().toExtend<Schemas['SiteMap']>();
    expectTypeOf<DiveMapAnnotation>().toExtend<Schemas['DiveMapAnnotation-Input']>();
  });
});
