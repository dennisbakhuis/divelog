import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { OWNER_COOKIE } from './fixtures.mjs';
import { ADMIN_PAGES, PUBLIC_PAGES } from './pages.mjs';

/*
 * The accessibility sweep: every public page signed out and the main editor
 * pages signed in, in the dark palette the log ships with. Serious and
 * critical violations fail the run. Reduced motion keeps the scroll reveals
 * from leaving text mid-fade, which axe would measure as low contrast.
 */

test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

async function blocking(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
}

for (const path of PUBLIC_PAGES) {
  test(`${path} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await blocking(page)).toEqual([]);
  });
}

test.describe('signed in', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  for (const path of ADMIN_PAGES) {
    test(`${path} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.bar')).toBeVisible();
      expect(await blocking(page)).toEqual([]);
    });
  }

  test('the owner bar on a public page has no serious or critical axe violations', async ({
    page,
  }) => {
    await page.goto('/dive/1');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: '+ New dive' })).toBeVisible();
    expect(await blocking(page)).toEqual([]);
  });
});

test('the skip link moves focus to the page content', async ({ page }) => {
  await page.goto('/dive');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  let focused = page.locator(':focus');
  for (
    let i = 0;
    i < 5 && !(await focused.evaluate((el) => el.classList.contains('dl-skip-link')));
    i++
  ) {
    await page.keyboard.press('Tab');
    focused = page.locator(':focus');
  }
  await expect(focused).toHaveText('Skip to content');
  await page.keyboard.press('Enter');
  await expect(page.locator('#dl-main')).toBeFocused();
});
