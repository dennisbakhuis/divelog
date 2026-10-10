/**
 * Test helpers for code built on the kit: a divelog with a scripted backend,
 * request events for loaders and hooks, and sample records for the sharing
 * features (commons sites, forks, stale pins and routes, repo notices).
 * Imports `vitest`, so use it from tests only.
 */
export { fakeDivelog, fakeEvent, thrown, type Responses } from './fake';
export {
  COMMONS_ATTRIBUTION,
  commonsSite,
  drawnRef,
  fakeCommonsHits,
  fakeCommonsPull,
  fakeMap,
  fakeRepoStatus,
  fakeSite,
  forkSite,
  staleAnnotation,
  stalePinSite,
} from './sharing';
