import { expect, test, type Page } from '@playwright/test';
import { OWNER_COOKIE } from './fixtures.mjs';
import { ADMIN_PAGES, PUBLIC_PAGES } from './pages.mjs';

/* A phone-width smoke: every page renders its heading and nothing scrolls sideways. */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

for (const path of PUBLIC_PAGES) {
  test(`${path} fits a 390 px screen`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test.describe('signed in', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  for (const path of ADMIN_PAGES) {
    test(`${path} keeps the admin bar on one screen`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: '+ New dive' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
      const menu = page.getByRole('button', { name: /^Menu/ });
      await expect(menu).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
      await menu.click();
      const panel = page.getByRole('dialog', { name: 'Admin menu' });
      await expect(panel.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await expect(panel.getByRole('link', { name: 'view site' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(menu).toBeFocused();
      const bar = await page.locator('.bar').evaluate((el) => ({
        right: el.getBoundingClientRect().right,
        rows: [...el.children].map((c) => Math.round(c.getBoundingClientRect().right)),
      }));
      expect(bar.right).toBeLessThanOrEqual(390);
      for (const right of bar.rows) expect(right).toBeLessThanOrEqual(390);
    });
  }
});
