import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { OWNER_COOKIE, SITE_SLUG } from './fixtures.mjs';
import { ADMIN_PAGES, PUBLIC_PAGES, SIGNED_OUT_ADMIN_PAGES } from './pages.mjs';

/*
 * The accessibility sweep: every public page signed out and signed in (with the owner bar),
 * every editor page signed in, and the login page, on a desktop and on a phone, in the dark
 * palette the log ships with. Serious and critical violations fail the run; moderate and
 * minor ones are attached to the test as `axe-moderate.json` so they can be listed. Reduced
 * motion keeps the scroll reveals from leaving text mid-fade, which axe would measure as low
 * contrast.
 */

test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

type Finding = { id: string; impact: string | null | undefined; help: string; nodes: string[] };

async function sweep(page: Page, info: TestInfo): Promise<Finding[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const findings = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  const minor = findings.filter((f) => f.impact !== 'serious' && f.impact !== 'critical');
  if (minor.length)
    await info.attach('axe-moderate.json', {
      body: JSON.stringify({ url: page.url(), findings: minor }, null, 2),
      contentType: 'application/json',
    });
  return findings.filter((f) => f.impact === 'serious' || f.impact === 'critical');
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width} px`, () => {
    test.use({ viewport });

    for (const path of PUBLIC_PAGES) {
      test(`${path} has no serious or critical axe violations`, async ({ page }, info) => {
        await open(page, path);
        expect(await sweep(page, info)).toEqual([]);
      });
    }

    for (const path of SIGNED_OUT_ADMIN_PAGES) {
      test(`${path} (signed out) has no serious or critical axe violations`, async ({
        page,
      }, info) => {
        await open(page, path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await sweep(page, info)).toEqual([]);
      });
    }

    test.describe('signed in', () => {
      test.beforeEach(async ({ context, baseURL }) => {
        await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
      });

      for (const path of ADMIN_PAGES) {
        test(`${path} has no serious or critical axe violations`, async ({ page }, info) => {
          await open(page, path);
          await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          expect(await sweep(page, info)).toEqual([]);
        });
      }

      for (const path of PUBLIC_PAGES) {
        test(`${path} with the owner bar has no serious or critical axe violations`, async ({
          page,
        }, info) => {
          await open(page, path);
          if (path !== '/')
            await expect(page.getByRole('group', { name: 'Owner actions' }).first()).toBeVisible();
          expect(await sweep(page, info)).toEqual([]);
        });
      }

      test('the map editor with a draft open has no serious or critical axe violations', async ({
        page,
      }, info) => {
        await open(page, `/admin/sites/${SITE_SLUG}/maps`);
        await page.getByRole('button', { name: 'Blank stick map' }).click();
        await expect(page.getByRole('group', { name: 'Drawing canvas' })).toBeVisible();
        expect(await sweep(page, info)).toEqual([]);
        await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
        expect(await sweep(page, info)).toEqual([]);
      });

      test('the dive form with every section open has no serious or critical axe violations', async ({
        page,
      }, info) => {
        await open(page, '/admin/dives/1');
        const closed = page.locator('form details:not([open]) > summary');
        for (let i = 0; i < 20 && (await closed.count()); i++) await closed.first().click();
        await expect(closed).toHaveCount(0);
        expect(await sweep(page, info)).toEqual([]);
      });
    });
  });
}

test('the skip link moves focus to the page content', async ({ page }) => {
  await open(page, '/dive');
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
