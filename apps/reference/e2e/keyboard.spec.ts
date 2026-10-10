import { expect, test } from '@playwright/test';
import { OWNER_COOKIE, SITE_NAME } from './fixtures.mjs';

test.use({ reducedMotion: 'reduce' });

test('tabbing through a dive page reaches every control with a visible focus and a name', async ({
  page,
}) => {
  await page.goto('/dive/2');
  await page.waitForLoadState('networkidle');
  const seen: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ');
      return {
        name: name.trim(),
        outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
        shadow: style.boxShadow !== 'none',
        visible: rect.width > 0 && rect.height > 0,
        tag: el.tagName,
      };
    });
    if (!info) break;
    expect(info.name, `focus stop ${i} has a name`).not.toBe('');
    if (info.tag !== 'MAIN' && info.tag !== 'DIV')
      expect(info.outline || info.shadow, `focus stop "${info.name}" shows focus`).toBe(true);
    expect(info.visible, `focus stop "${info.name}" is on screen`).toBe(true);
    seen.push(info.name.replace(/^[←→\s]+/, ''));
  }
  expect(seen.indexOf('Skip to content')).toBeGreaterThanOrEqual(0);
  expect(seen.indexOf('Skip to content')).toBeLessThan(4);
  expect(seen).toContain('Dive log');
  expect(seen.some((name) => name.startsWith('Previous dive: #1'))).toBe(true);
  expect(seen.some((name) => name.startsWith('Next dive: '))).toBe(true);
});

test('the dive pager names its links and pages with [ and ]', async ({ page }) => {
  await page.goto('/dive/2');
  await page.waitForLoadState('networkidle');
  const top = page.getByRole('navigation', { name: 'Dive navigation', exact: true });
  await expect(top.getByRole('link', { name: `Previous dive: #1 ${SITE_NAME}` })).toBeVisible();
  await expect(top.getByRole('link', { name: /^Next dive: Coral Garden #3/ })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Dive navigation, end of page' }),
  ).toBeVisible();

  await page.keyboard.press(']');
  await expect(page).toHaveURL(/\/dive\/3$/);
  await page.keyboard.press('[');
  await expect(page).toHaveURL(/\/dive\/2$/);
});

test('the back link returns to the filtered log', async ({ page }) => {
  await page.goto('/dive?tag=training');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /^Dive #1, / }).click();
  await expect(page).toHaveURL(/\/dive\/1$/);
  const back = page
    .getByRole('navigation', { name: 'Dive navigation', exact: true })
    .getByRole('link', { name: 'Dive log', exact: true });
  await expect(back).toHaveAttribute('href', '/dive?tag=training');
  await page.keyboard.press(']');
  await expect(page).toHaveURL(/\/dive\/2$/);
  await expect(back).toHaveAttribute('href', '/dive?tag=training');
  await back.click();
  await expect(page).toHaveURL(/\/dive\?tag=training$/);
});

test('the sites filter lives in the URL', async ({ page }) => {
  await page.goto('/dive/sites');
  await page.waitForLoadState('networkidle');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('EG');
  await expect(page).toHaveURL(/\/dive\/sites\?country=EG$/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('EG');
  await expect(page.locator('.count')).toHaveText('1 sites');
});

test.describe('signed in', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  test('public pages offer to log a dive in context', async ({ page }) => {
    await page.goto('/dive/sites/nl-example-quarry');
    await expect(page.getByRole('link', { name: '+ Log a dive here' })).toHaveAttribute(
      'href',
      '/admin/dives/new?site=nl-example-quarry',
    );
    await page.goto('/dive/people/alex');
    await expect(page.getByRole('link', { name: '+ Log a dive with Alex' })).toHaveAttribute(
      'href',
      '/admin/dives/new?person=alex',
    );
    await page.goto('/dive/trips/red-sea-2025-03');
    await expect(page.getByRole('link', { name: '+ Log a dive on this trip' })).toHaveAttribute(
      'href',
      '/admin/dives/new?trip=red-sea-2025-03',
    );
    await page.goto('/dive');
    await expect(page.getByRole('link', { name: '+ New dive' })).toHaveAttribute(
      'href',
      '/admin/dives/new',
    );
  });
});
