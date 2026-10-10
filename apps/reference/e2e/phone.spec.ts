import { expect, test, type Page } from '@playwright/test';
import { OWNER_COOKIE, SITE_SLUG } from './fixtures.mjs';
import { ADMIN_PAGES, PUBLIC_PAGES } from './pages.mjs';

/*
 * The phone smoke: every page at 390 × 844 renders its heading and nothing scrolls sideways;
 * on every editor page the admin bar stays on one screen and its menu opens and closes; the
 * dive and site forms keep their save bar on screen; the map and route editors fit.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** The save bar is on screen and fits its width. */
async function expectSaveBarOnScreen(page: Page) {
  const bar = page.locator('.save-bar').first();
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(845);
  expect(box.y).toBeLessThan(844);
}

for (const path of PUBLIC_PAGES) {
  test(`${path} fits a 390 px screen`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test('the login page fits a 390 px screen', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test.describe('signed in', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  for (const path of ADMIN_PAGES) {
    test(`${path} fits a phone and keeps the admin bar on one screen`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.getByRole('link', { name: '+ New dive' }).first()).toBeVisible();
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
      const bar = await page.locator('header.bar').evaluate((el) => ({
        right: el.getBoundingClientRect().right,
        rows: [...el.children].map((c) => Math.round(c.getBoundingClientRect().right)),
      }));
      expect(bar.right).toBeLessThanOrEqual(390);
      for (const right of bar.rows) expect(right).toBeLessThanOrEqual(390);
      if (await page.locator('.save-bar').count()) await expectSaveBarOnScreen(page);
    });
  }

  test('the dive editor keeps its save bar on screen while scrolling the form', async ({
    page,
  }) => {
    await page.goto('/admin/dives/1');
    await page.waitForLoadState('networkidle');
    await expectSaveBarOnScreen(page);
    await page.mouse.wheel(0, 2000);
    await expectSaveBarOnScreen(page);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the site editor keeps its save bar on screen', async ({ page }) => {
    await page.goto(`/admin/sites/${SITE_SLUG}`);
    await page.waitForLoadState('networkidle');
    await expectSaveBarOnScreen(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the map editor fits a phone with its tools in a bottom strip', async ({ page }) => {
    await page.goto(`/admin/sites/${SITE_SLUG}/maps`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Blank site map' }).click();
    await expect(page.getByRole('group', { name: 'Drawing canvas' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const tools = page.getByRole('radiogroup', { name: 'Drawing tool' });
    await expect(tools).toBeVisible();
    for (const radio of await tools.getByRole('radio').all()) {
      const box = (await radio.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const toggle = page.getByRole('button', { name: /details$/ });
    const before = await toggle.getAttribute('aria-expanded');
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-expanded', before!);
    await expect(page.getByRole('button', { name: 'Save map', exact: true })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the route editor in the dive form fits a phone', async ({ page }) => {
    await page.goto(`/admin/dives/new?site=${SITE_SLUG}`);
    await page.waitForLoadState('networkidle');
    const closed = page.locator('form details:not([open]) > summary');
    for (let i = 0; i < 20 && (await closed.count()); i++) await closed.first().click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expectSaveBarOnScreen(page);
  });
});
