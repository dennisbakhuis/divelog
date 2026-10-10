import { describe, expect, it, vi } from 'vitest';
import { publicPageImports } from './public-pages.js';
import { adminPageImports } from './admin-pages.js';
import { adminRoutes } from './admin.js';
import { publicRoutes } from './public.js';
import { withComponent } from './pages.js';

/*
 * The page maps are checked without compiling the pages: a dynamic import of a real page
 * compiles it (and everything it imports), which under a full parallel run was slow enough
 * to time out. The real imports run in the reference app's build and end-to-end tests.
 */
describe('page components', () => {
  it('has one per public and admin page', () => {
    expect(Object.keys(publicPageImports)).toHaveLength(10);
    expect(Object.keys(adminPageImports)).toHaveLength(18);
    expect(publicRoutes.length - Object.keys(publicPageImports).length).toBe(3);
    expect(adminRoutes).toHaveLength(18);
    for (const load of [...Object.values(publicPageImports), ...Object.values(adminPageImports)])
      expect(typeof load).toBe('function');
  });

  it('attaches the component for the page to the page data', async () => {
    const Gear = () => {};
    const Other = () => {};
    const imports = {
      gear: vi.fn(async () => ({ default: Gear })),
      other: vi.fn(async () => ({ default: Other })),
    };
    const data = { page: 'gear' as const, editHref: '/admin/gear', owner: null };
    const withPage = await withComponent(imports, data);
    expect(withPage).toMatchObject(data);
    expect(withPage.component).toBe(Gear);
    expect(imports.gear).toHaveBeenCalledOnce();
    expect(imports.other).not.toHaveBeenCalled();
  });
});
