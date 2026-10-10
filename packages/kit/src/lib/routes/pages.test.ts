import { describe, expect, it } from 'vitest';
import { publicPageImports, withPublicPage } from './public-pages.js';
import { adminPageImports, withAdminPage } from './admin-pages.js';
import { adminRoutes } from './admin.js';
import { publicRoutes } from './public.js';

describe('page components', () => {
  it('has one per public and admin page', () => {
    expect(Object.keys(publicPageImports)).toHaveLength(10);
    expect(Object.keys(adminPageImports)).toHaveLength(18);
    expect(publicRoutes.length - Object.keys(publicPageImports).length).toBe(3);
    expect(adminRoutes).toHaveLength(18);
  });

  it('attaches the component to the page data', async () => {
    const data = {
      page: 'gear' as const,
      gear: null as never,
      editHref: '/admin/gear',
      owner: null,
    };
    const withPage = await withPublicPage(data);
    expect(withPage).toMatchObject(data);
    expect(withPage.component).toBe((await publicPageImports.gear()).default);
  });

  it('attaches admin components too', async () => {
    const data = await adminPageImports['person-new']();
    const loaded = await withAdminPage({ page: 'person-new', owner: 'me' });
    expect(loaded.component).toBe(data.default);
  });
});
