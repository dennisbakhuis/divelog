/**
 * What the page switches render. Page components are imported on demand so
 * each keeps its own chunk behind the catch-all routes; client safe, as the
 * route tables with the loaders stay on the server.
 */
import type { Component } from 'svelte';
import type { Snapshot } from '@sveltejs/kit';
import type { PageOwner } from './table.js';

/**
 * A page component may export a `snapshot` (SvelteKit's contract) to keep
 * view state across history navigation.
 */
export type PageComponent<D> = Component<{ data: D }, { snapshot?: Snapshot }>;

type PageModule<D> = { default: PageComponent<D> | Component<Record<string, never>> };

/** Each key imports a component that takes that page's data, or no props at all. */
export type PageImports<P extends string, D> = {
  [K in P]: () => Promise<PageModule<Extract<D, { page: K }> & PageOwner>>;
};

/** Page data with the component that renders it. */
export type WithComponent<D> = D & { component: PageComponent<D> };

/** Import the component for `data.page` and attach it to the data. */
export async function withComponent<D extends { page: string }>(
  imports: Record<string, () => Promise<{ default: unknown }>>,
  data: D,
): Promise<WithComponent<D>> {
  // Each map is checked per key by `satisfies PageImports`; indexed by the
  // union key, its component is seen as taking the whole data union.
  const component = (await imports[data.page]()).default as PageComponent<D>;
  return { ...data, component };
}
