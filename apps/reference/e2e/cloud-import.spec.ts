import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { OWNER_COOKIE } from './fixtures.mjs';

/*
 * The Shearwater Cloud export import against the stub: picking the export on a phone by
 * touch, linking a dive to a log dive, joining two, unticking one, correcting the clock and
 * importing; the same by keyboard alone; the way in from the Dives page; and axe on the open
 * preview. The stub answers from the query, so any bytes will do.
 */

test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

const EXPORT = {
  name: 'Shearwater Cloud (owner@example.com) 2026-10-21.db',
  mimeType: 'application/octet-stream',
  buffer: Buffer.from('SQLite format 3\0'),
};
const ENDPOINT = '/api/v1/admin/import/shearwater-cloud';

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
});

async function open(page: Page) {
  await page.goto('/admin/import');
  await page.waitForLoadState('networkidle');
}

/** The query of the next import request the page sends. */
function nextImport(page: Page): Promise<Record<string, string>> {
  return page
    .waitForRequest((r: Request) => r.method() === 'POST' && r.url().includes(ENDPOINT))
    .then((r) => Object.fromEntries(new URL(r.url()).searchParams));
}

const preview = (page: Page) => page.getByRole('region', { name: /^Preview: Shearwater Cloud/ });
const dives = (page: Page) => preview(page).getByRole('group', { name: 'Dives to import' });
const older = (page: Page) =>
  preview(page).locator('details', { hasText: 'Older dives not in your log' });
const item = (page: Page, n: number) =>
  dives(page)
    .getByRole('listitem')
    .filter({ hasText: `Perdix AI #${n}` });
const belongsTo = (page: Page, n: number) =>
  item(page, n).getByRole('combobox', { name: 'Belongs to' });

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('picks the export, links and joins dives, corrects the clock and imports', async ({
    page,
  }) => {
    await open(page);
    const cloud = page.getByLabel('Shearwater Cloud export');
    await expect(cloud).not.toHaveAttribute('accept');
    const perdix = page.getByLabel('Shearwater Perdix');
    const cloudCard = (await page.locator('.cloud').boundingBox())!;
    const perdixCard = (await perdix.locator('xpath=..').boundingBox())!;
    expect(cloudCard.y).toBeLessThan(perdixCard.y);
    await expect(
      page.getByText('open the Profile tab and tap Export (*.db)', { exact: false }),
    ).toBeVisible();

    const dryRun = nextImport(page);
    await cloud.setInputFiles(EXPORT);
    expect(await dryRun).toEqual({ dry_run: 'true' });
    await expect(preview(page)).toBeFocused();
    await expect(preview(page)).toContainText('1 dive already in the log');
    await expect(preview(page)).toContainText("can't be read: Log 120 ends early");
    await expect(preview(page)).toContainText('4 of 5 dives selected');
    const boxes = dives(page).getByRole('checkbox');
    await expect(boxes).toHaveCount(4);
    for (const box of await boxes.all()) await expect(box).toBeChecked();
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await expect(older(page)).not.toHaveAttribute('open');
    await expect(older(page).locator('summary')).toContainText('1');
    const olderBox = older(page).getByRole('checkbox', { name: /Perdix AI #117/ });
    await expect(olderBox).toBeHidden();
    await older(page).locator('summary').tap();
    await expect(olderBox).toBeVisible();
    await expect(olderBox).not.toBeChecked();

    await expect(belongsTo(page, 121)).toHaveValue('2');
    await expect(item(page, 121)).toContainText('add profile to dive #2');
    await expect(belongsTo(page, 122)).toHaveCount(0);
    await belongsTo(page, 121).selectOption({ label: 'Dive #1 · 21:30 · 440 min apart' });
    await expect(item(page, 121)).toContainText('add profile to dive #1');

    await belongsTo(page, 123).selectOption({ label: 'Same dive as #122 (surfaced 10 min)' });
    await expect(item(page, 123).getByRole('checkbox')).toHaveCount(0);
    await expect(item(page, 123)).toContainText('same dive as #122');
    await expect(item(page, 122)).toContainText('Perdix AI #122 + #123, one dive');
    await expect(item(page, 122)).toContainText('27.8 m, 69 min');
    await expect(preview(page)).toContainText('3 of 4 dives selected');
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    const row = dives(page).locator('label', { hasText: 'Perdix AI #119' });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await row.tap();
    await expect(row.getByRole('checkbox')).not.toBeChecked();
    await expect(preview(page)).toContainText('2 of 4 dives selected');

    const offset = preview(page).getByRole('textbox', { name: 'Clock offset' });
    await offset.tap();
    await offset.fill('+7 h');
    const rerun = nextImport(page);
    await offset.press('Enter');
    expect(await rerun).toEqual({ dry_run: 'true', clock_offset_min: '420' });
    await expect(dives(page)).toContainText('18 Oct 2026 16:20 (computer 09:20)');
    await expect(row.getByRole('checkbox')).not.toBeChecked();
    await expect(belongsTo(page, 121)).toHaveValue('1');
    await expect(belongsTo(page, 121).locator('option:checked')).toHaveText(
      'Dive #1 · 21:30 · 20 min apart',
    );
    await expect(item(page, 123).getByRole('checkbox')).toHaveCount(0);

    const commit = nextImport(page);
    const importButton = preview(page).getByRole('button', { name: 'Import', exact: true });
    expect((await importButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await importButton.tap();
    expect(await commit).toEqual({
      only: '121,122,123',
      link: '121:1',
      join: '122+123',
      clock_offset_min: '420',
    });
    const done = page.getByRole('region', { name: 'Imported' });
    await expect(done).toBeFocused();
    await expect(done).toContainText('1 new draft created');
    await expect(done).toContainText('Profiles added to #1');
    await expect(done.getByRole('link', { name: 'Review drafts' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test('works by keyboard alone', async ({ page }) => {
  await open(page);
  let focused: string | null = null;
  for (let i = 0; i < 60 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLInputElement) || el.type !== 'file') return null;
      return el.closest('label')?.querySelector('strong')?.textContent ?? '';
    });
  }
  expect(focused, 'the first import card in focus order').toBe('Shearwater Cloud export');
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Space');
  const dryRun = nextImport(page);
  await (await chooser).setFiles(EXPORT);
  await dryRun;
  await expect(preview(page)).toBeFocused();

  await page.keyboard.press('Tab');
  const offset = preview(page).getByRole('textbox', { name: 'Clock offset' });
  await expect(offset).toBeFocused();
  await page.keyboard.type('-30 min');
  const rerun = nextImport(page);
  await page.keyboard.press('Enter');
  expect(await rerun).toEqual({ dry_run: 'true', clock_offset_min: '-30' });
  await expect(dives(page)).toContainText('(computer 09:20)');
  await expect(offset).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(dives(page).getByRole('checkbox', { name: /Perdix AI #123/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(belongsTo(page, 123)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dives(page).getByRole('checkbox', { name: /Perdix AI #122/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(dives(page).getByRole('checkbox', { name: /Perdix AI #121/ })).not.toBeChecked();
  await page.keyboard.press('Tab');
  await expect(belongsTo(page, 121)).toBeFocused();
  await expect(belongsTo(page, 121)).toHaveValue('2');
  await page.keyboard.press('Tab');
  await expect(dives(page).getByRole('checkbox', { name: /Perdix AI #119/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(older(page).locator('summary')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(preview(page).getByRole('button', { name: 'Import', exact: true })).toBeFocused();
  const commit = nextImport(page);
  await page.keyboard.press('Enter');
  expect(await commit).toEqual({ only: '119,122,123', link: '121:2', clock_offset_min: '-30' });
  await expect(page.getByRole('region', { name: 'Imported' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /^#\d+$/ }).first()).toBeFocused();
});

test('Import from Shearwater on the Dives page lands on the export input', async ({ page }) => {
  await page.goto('/admin/dives');
  await page.waitForLoadState('networkidle');
  const link = page.getByRole('link', { name: 'Import from Shearwater' });
  await expect(link).toHaveAttribute('href', '/admin/import#shearwater-cloud');
  await link.click();
  await expect(page).toHaveURL(/\/admin\/import#shearwater-cloud$/);
  await expect(page.getByLabel('Shearwater Cloud export')).toBeFocused();
  await expect(page.locator('#shearwater-cloud')).toBeInViewport();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`the open preview has no serious or critical axe violations at ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await page.getByLabel('Shearwater Cloud export').setInputFiles(EXPORT);
    await expect(dives(page).getByRole('checkbox')).toHaveCount(4);
    await expect(belongsTo(page, 121)).toBeVisible();
    await older(page).locator('summary').click();
    await expect(older(page).getByRole('checkbox')).toBeVisible();
    await preview(page).getByRole('textbox', { name: 'Clock offset' }).fill('soon');
    await preview(page).getByRole('textbox', { name: 'Clock offset' }).press('Enter');
    await expect(preview(page)).toContainText('+7 h, -30 min or +1:30');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    const serious = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }));
    expect(serious).toEqual([]);
  });
}
