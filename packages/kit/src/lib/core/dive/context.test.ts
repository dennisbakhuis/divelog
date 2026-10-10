import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import ContextProbe from './__fixtures__/ContextProbe.svelte';
import ProviderProbe from './__fixtures__/ProviderProbe.svelte';
import { DEFAULT_CONFIG, type DivelogConfig } from './config';
import { divelogContext, divelogFor, getDivelog, type Divelog } from './context';
import { adminApi, adminJson, configureAdminClient } from '$lib/core/admin/client';

const custom: DivelogConfig = {
  ...DEFAULT_CONFIG,
  basePath: '/logbook',
  apiBase: '/backend',
};

function read(
  component: typeof ContextProbe | typeof ProviderProbe,
  props = {},
  context?: Map<symbol, Divelog>,
) {
  let seen: Divelog | undefined;
  const target = document.createElement('div');
  const app = mount(component as typeof ProviderProbe, {
    target,
    props: { config: custom, onread: (d: Divelog) => (seen = d), ...props },
    context,
  });
  unmount(app);
  return seen as Divelog;
}

describe('divelog context', () => {
  afterEach(() => {
    configureAdminClient(DEFAULT_CONFIG.apiBase);
    vi.unstubAllGlobals();
  });

  it('falls back to the default config without a provider', () => {
    const divelog = read(ContextProbe);
    expect(divelog.config).toBe(DEFAULT_CONFIG);
    expect(divelog.urls.dive(1)).toBe('/dive/1');
    expect(read(ContextProbe)).toBe(divelog);
  });

  it('reads the provider config and points the admin client at its API', async () => {
    const divelog = read(ProviderProbe);
    expect(divelog.config).toBe(custom);
    expect(divelog.urls.dive(1)).toBe('/logbook/1');

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await adminJson(adminApi('dives'));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/backend/admin/dives');
  });

  it('accepts a context map built for mount', () => {
    const divelog = read(ContextProbe, {}, divelogContext(custom));
    expect(divelog.urls.site('x')).toBe('/logbook/sites/x');
  });

  it('builds the published value from a config', () => {
    expect(divelogFor(custom).urls.log()).toBe('/logbook');
  });

  it('cannot be read outside a component', () => {
    expect(() => getDivelog()).toThrow();
  });
});
