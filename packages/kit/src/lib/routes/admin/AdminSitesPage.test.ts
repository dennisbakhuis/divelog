import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AdminSitesPage from './AdminSitesPage.svelte';
import { commonsSite, fakeSite, forkSite, stalePinSite } from '$lib/testing/sharing.js';

const sites = [fakeSite(), commonsSite(), stalePinSite(), forkSite()];

function render() {
  const target = document.createElement('div');
  const app = mount(AdminSitesPage, {
    target,
    props: { data: { page: 'sites', sites, regions: [], owner: 'owner@example.com' } },
  });
  flushSync();
  return { target, app };
}

const names = (target: HTMLElement) =>
  [...target.querySelectorAll('tbody tr td:first-child a')].map((a) => a.textContent);

describe('AdminSitesPage origins', () => {
  it('badges each site with its origin and flags stale pins', () => {
    const { target, app } = render();
    const badges = [...target.querySelectorAll('tbody [data-origin]')].map((b) => b.textContent);
    expect(badges).toEqual(['personal', 'commons', 'commons', 'fork']);
    expect(target.querySelector('[data-origin="fork"]')?.getAttribute('title')).toBe(
      'forked from commons@4',
    );
    expect(target.querySelectorAll('.stale')).toHaveLength(2);
    unmount(app);
  });

  it('filters by origin', () => {
    const { target, app } = render();
    const select = target.querySelector<HTMLSelectElement>('#sites-origin')!;
    const pick = (value: string) => {
      select.value = value;
      select.dispatchEvent(new Event('change'));
      flushSync();
    };
    expect(names(target)).toHaveLength(4);
    pick('personal');
    expect(names(target)).toEqual(['Example Quarry', 'Goul de la Tannerie']);
    pick('commons');
    expect(names(target)).toEqual(['Émergence du Ressel', 'Cabouy']);
    pick('stale');
    expect(names(target)).toEqual(['Cabouy', 'Goul de la Tannerie']);
    expect(target.textContent).toContain('2 shown');
    pick('all');
    expect(names(target)).toHaveLength(4);
    unmount(app);
  });

  it('labels its filters and offers a new site', () => {
    const { target, app } = render();
    for (const id of ['sites-q', 'sites-country', 'sites-origin'])
      expect(target.querySelector(`label[for="${id}"]`)).not.toBeNull();
    expect(target.querySelector('a.new')?.getAttribute('href')).toBe('/admin/sites/new');
    unmount(app);
  });
});
