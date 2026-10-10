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

test.describe('site maps', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  test('Start from OpenStreetMap, then Save map, gives the site a map', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(`/admin/sites/${SITE_SLUG}/maps`);
    await expect(page.getByRole('tab', { name: 'Maps', selected: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start from OpenStreetMap' }).click();
    await expect(page.getByText('new · not saved yet')).toBeVisible();
    await expect(page.locator('.editor .line.shoreline')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save map', exact: true }).click();
    await expect(page.getByText('Map saved').first()).toBeVisible();
    await expect(page.locator('.map-row').first()).toContainText(SITE_NAME);
    await expect(page.locator('.map-row').first()).toContainText('revision 1');
    await expect(page.getByText('new · not saved yet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save map', exact: true })).toBeDisabled();
    expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  });

  test('single-key shortcuts act only on the focused canvas', async ({ page }) => {
    await page.goto(`/admin/sites/${SITE_SLUG}/maps`);
    await page.getByRole('button', { name: 'Blank stick map' }).click();
    const tool = page.getByRole('radiogroup', { name: 'Drawing tool' });
    await expect(tool.getByRole('radio', { name: /Station/ })).toBeChecked();
    await page.keyboard.press('c');
    await expect(tool.getByRole('radio', { name: /Station/ })).toBeChecked();
    await page.getByRole('group', { name: 'Drawing canvas' }).focus();
    await page.keyboard.press('c');
    await expect(tool.getByRole('radio', { name: /Connect/ })).toBeChecked();
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await page.getByRole('switch', { name: 'Enable single-key shortcuts' }).uncheck();
    await page.getByRole('group', { name: 'Drawing canvas' }).focus();
    await page.keyboard.press('m');
    await expect(tool.getByRole('radio', { name: /Connect/ })).toBeChecked();
  });
});
