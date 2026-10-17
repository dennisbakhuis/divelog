import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { OWNER_COOKIE, SITE_NAME, SITE_SLUG } from './fixtures.mjs';

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Software WebGL is heavy when several workers draw maps at once; tests that do not tap the
 * map run the picker in its no-WebGL mode (the coordinates field only).
 */
async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'WebGLRenderingContext');
    Reflect.deleteProperty(window, 'WebGL2RenderingContext');
  });
}

test.describe('site creation and the site workspace', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  test('a site with a map in five actions: name, tap, create, OpenStreetMap, save', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    let actions = 0;
    await page.goto('/admin/sites/new');
    const name = page.getByRole('textbox', { name: 'Name', exact: true });
    await expect(name).toBeFocused();

    await name.fill('Benchmark Quarry');
    actions += 1;

    const picker = page.locator('.dl-picker');
    const tip = picker.getByText('Tap the map to place the pin');
    const off = picker.locator('.dl-picker-off');
    await expect(tip.or(off)).toBeVisible({ timeout: 15_000 });
    if (await tip.isVisible()) {
      const canvas = picker.locator('canvas');
      const box = (await canvas.boundingBox())!;
      await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    } else {
      await picker.getByRole('textbox', { name: 'Coordinates', exact: true }).fill('30, 10');
      await picker.getByRole('textbox', { name: 'Coordinates', exact: true }).press('Enter');
    }
    actions += 1;

    const country = page.getByRole('combobox', { name: 'Country', exact: true });
    await expect(country).not.toHaveValue('');
    const iso3 = (await country.inputValue()).toLowerCase();
    await expect(page.locator('.id-line')).toContainText(`${iso3}-benchmark-quarry`);
    await expect(page.locator('.id-line')).toContainText('available', { timeout: 15_000 });

    await page.getByRole('button', { name: 'Create & draw a map' }).click();
    actions += 1;

    await expect(page).toHaveURL(new RegExp(`/admin/sites/${iso3}-benchmark-quarry/maps$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Benchmark Quarry');
    await expect(page.getByRole('tab', { name: /^Maps/ })).toHaveAttribute('aria-selected', 'true');
    expect(actions).toBe(3);

    await page.getByRole('button', { name: 'Start from OpenStreetMap' }).click();
    actions += 1;
    await expect(page.getByText('new · not saved yet')).toBeVisible();
    await page.getByRole('button', { name: 'Save map', exact: true }).click();
    actions += 1;
    await expect(page.getByText('Map saved').first()).toBeVisible();
    await expect(page.locator('.map-row').first()).toContainText('revision 1');
    expect(actions).toBeLessThanOrEqual(5);
    expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
  });

  test('the nearby check offers an existing site instead of a duplicate', async ({ page }) => {
    await withoutWebGL(page);
    await page.goto('/admin/sites/new');
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(SITE_NAME);
    const nearby = page.locator('.nearby');
    await expect(nearby.locator('.hit')).toHaveCount(1, { timeout: 15_000 });
    await expect(nearby).toContainText('name matches');
    await nearby.getByRole('button', { name: `Use ${SITE_NAME} instead` }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/sites/${SITE_SLUG}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SITE_NAME);
  });

  test('a pasted position fills the country and the id', async ({ page }) => {
    await withoutWebGL(page);
    await page.goto('/admin/sites/new');
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Pasted Pit');
    const coords = page.getByRole('textbox', { name: 'Coordinates', exact: true });
    await coords.fill(`44°36'00"N 1°42'00"E`);
    await coords.press('Enter');
    await expect(coords).toHaveValue('44.600000, 1.700000');
    await expect(page.getByRole('combobox', { name: 'Country', exact: true })).toHaveValue('FRA');
    await expect(page.locator('.id-line')).toContainText('fra-pasted-pit');
    await expect(page.locator('.nearby')).toContainText('Fontaine de Truffe', { timeout: 15_000 });
  });

  test('the workspace switches tabs and keeps the maps deep link', async ({ page }) => {
    await withoutWebGL(page);
    await page.goto(`/admin/sites/${SITE_SLUG}/maps`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: /^Maps/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Location' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/sites/${SITE_SLUG}#location$`));
    await expect(page.getByRole('textbox', { name: 'Coordinates', exact: true })).toHaveValue(
      '52.090000, 5.120000',
    );
    await page.getByRole('tab', { name: 'Details' }).click();
    await page.getByRole('textbox', { name: 'Area / town' }).fill('Maarssen');
    await page.getByRole('tab', { name: 'Location' }).click();
    await page.getByRole('tab', { name: 'Details' }).click();
    await expect(page.getByRole('textbox', { name: 'Area / town' })).toHaveValue('Maarssen');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
  });

  test.describe('accessibility and the phone', () => {
    test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

    async function blocking(page: Page) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      return results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
    }

    test('the new-site form and every workspace tab pass axe', async ({ page }) => {
      await withoutWebGL(page);
      await page.goto('/admin/sites/new');
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(SITE_NAME);
      await expect(page.locator('.nearby .hit')).toHaveCount(1, { timeout: 15_000 });
      expect(await blocking(page)).toEqual([]);

      await page.goto(`/admin/sites/${SITE_SLUG}`);
      await page.waitForLoadState('networkidle');
      for (const tab of ['Details', 'Location', 'Photos', 'Dives']) {
        await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
        await page.waitForLoadState('networkidle');
        expect({ tab, violations: await blocking(page) }).toEqual({ tab, violations: [] });
      }
    });

    test('the new-site form fits a phone', async ({ page }) => {
      await withoutWebGL(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/admin/sites/new');
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const create = page.getByRole('button', { name: 'Create', exact: true });
      const box = (await create.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    });
  });
});
