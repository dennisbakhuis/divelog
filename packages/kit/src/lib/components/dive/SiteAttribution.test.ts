import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import SiteAttribution from './SiteAttribution.svelte';
import { COMMONS_ATTRIBUTION } from '$lib/testing/sharing';

let cleanup: (() => void)[] = [];

function render(props: ComponentProps<typeof SiteAttribution>) {
  const target = document.createElement('div');
  const app = mount(SiteAttribution, { target, props });
  flushSync();
  cleanup.push(() => unmount(app));
  return target;
}

afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});

describe('SiteAttribution', () => {
  it('credits the commons with its licences, a linked source and the short commit', () => {
    const target = render({ origin: 'commons', attribution: COMMONS_ATTRIBUTION });
    const line = target.querySelector('.dl-attribution');
    expect(line?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Site data © divelog-sites contributors (ODbL), descriptions and maps CC BY-SA 4.0 · 3f0c1a2',
    );
    expect(line?.querySelector('a')?.getAttribute('href')).toBe(COMMONS_ATTRIBUTION.source);
  });

  it('does not link a source that is not a URL', () => {
    const target = render({
      origin: 'commons',
      attribution: { licence: 'ODbL', source: 'local-sites', ref: null },
    });
    expect(target.querySelector('a')).toBeNull();
    expect(target.textContent).toContain('© local-sites contributors');
    expect(target.querySelector('.dl-attribution-ref')).toBeNull();
  });

  it('says where a fork came from', () => {
    const target = render({ origin: 'fork', forkedFrom: 'commons@4' });
    expect(target.textContent).toContain('Forked from the commons at revision 4');
    expect(target.textContent).toContain('divelog-sites contributors');
    const old = render({ origin: 'fork', forkedFrom: 'commons@3f0c1a2' });
    expect(old.textContent).toContain('Forked from the commons');
    expect(old.textContent).not.toContain('at revision');
  });

  it('has a short form for one map', () => {
    const target = render({ origin: 'commons', attribution: COMMONS_ATTRIBUTION, variant: 'map' });
    expect(target.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Map © divelog-sites contributors, CC BY-SA 4.0 · 3f0c1a2',
    );
    const fork = render({ origin: 'fork', forkedFrom: 'commons@4', variant: 'map' });
    expect(fork.textContent).not.toContain('Forked');
  });

  it('renders nothing for a personal site', () => {
    const target = render({ origin: 'log' });
    expect(target.querySelector('.dl-attribution')).toBeNull();
  });
});
