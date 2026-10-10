import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SITE_SLUG } from './fixtures.mjs';

/*
 * Seed of the accessibility sweep: public pages, signed out, in the dark
 * palette the log ships with. Serious and critical violations fail the run.
 * Reduced motion keeps the scroll reveals from leaving text mid-fade, which
 * axe would measure as low contrast.
 */

test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

const PAGES = ['/dive', '/dive/1', `/dive/sites/${SITE_SLUG}`];

for (const path of PAGES) {
  test(`${path} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }));
    expect(blocking).toEqual([]);
  });
}

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
