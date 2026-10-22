import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { OWNER_COOKIE } from './fixtures.mjs';

/*
 * The Shearwater Cloud export import against the stub: picking the export on a phone by
 * touch, linking a dive to a log dive, joining two, unticking one, correcting the clock and
 * importing; splitting the cave dive at its surface breaks and linking a part; the same by
 * keyboard alone; the way in from the Dives page; and axe on the open preview. The stub answers
 * from the query, so any bytes will do.
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

/** Every import request's query from now on, in order. */
function track(page: Page): Record<string, string>[] {
  const sent: Record<string, string>[] = [];
  page.on('request', (r: Request) => {
    if (r.method() === 'POST' && r.url().includes(ENDPOINT))
      sent.push(Object.fromEntries(new URL(r.url()).searchParams));
  });
  return sent;
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
const rowBoxes = (page: Page) => dives(page).getByRole('checkbox', { name: /^Perdix AI/ });
const splitAt = (page: Page) =>
  item(page, 124).getByRole('group', { name: 'Split this dive at' }).getByRole('checkbox');
const parts = (page: Page) =>
  item(page, 124).getByRole('list', { name: 'Parts of Perdix AI #124' }).getByRole('listitem');
const partSelect = (page: Page, n: number) =>
  parts(page)
    .nth(n - 1)
    .getByRole('combobox', { name: 'Belongs to' });

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
    await expect(preview(page)).toContainText('6 of 7 dives selected');
    await expect(parts(page)).toHaveCount(2);
    const boxes = rowBoxes(page);
    await expect(boxes).toHaveCount(5);
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
    await expect(preview(page)).toContainText('5 of 6 dives selected');
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    const row = dives(page).locator('label', { hasText: 'Perdix AI #119' });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await row.tap();
    await expect(row.getByRole('checkbox')).not.toBeChecked();
    await expect(preview(page)).toContainText('4 of 6 dives selected');

    const offset = preview(page).getByRole('textbox', { name: 'Clock offset' });
    await offset.tap();
    await offset.fill('+7 h');
    const rerun = nextImport(page);
    await offset.press('Enter');
    expect(await rerun).toEqual({
      dry_run: 'true',
      split: '124@1740',
      clock_offset_min: '420',
    });
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
      only: '121,122,123,124',
      link: '121:1',
      join: '122+123',
      split: '124@1740',
      clock_offset_min: '420',
    });
    const done = page.getByRole('region', { name: 'Imported' });
    await expect(done).toBeFocused();
    await expect(done).toContainText('2 new drafts created');
    await expect(done).toContainText('Profiles added to #1');
    await expect(done.getByRole('link', { name: 'Review drafts' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('splits the cave dive at its surface breaks and links a part', async ({ page }) => {
    await open(page);
    const sent = track(page);
    await page.getByLabel('Shearwater Cloud export').setInputFiles(EXPORT);
    await expect(parts(page)).toHaveCount(2);
    expect(sent).toEqual([{ dry_run: 'true' }, { dry_run: 'true', split: '124@1740' }]);
    await expect(item(page, 124).locator('label.dive-row')).toContainText('split into 2 dives');
    await expect(belongsTo(page, 124)).toHaveCount(0);
    await expect(splitAt(page)).toHaveCount(2);
    await expect(
      item(page, 124).getByRole('checkbox', { name: '29 min · surfaced 10 min (11:29–11:39)' }),
    ).toBeChecked();
    const late = item(page, 124).getByRole('checkbox', {
      name: '55 min · surfaced 2 min (11:55–11:57)',
    });
    await expect(late).not.toBeChecked();
    await expect(parts(page).nth(0)).toContainText('Part 1 · 11:00 · 29 min · 24.6 m');
    await expect(parts(page).nth(0)).toContainText('add profile to dive #4');
    await expect(parts(page).nth(1)).toContainText('Part 2 · 11:39 · 31 min · 12.3 m');
    await expect(parts(page).nth(1)).toContainText('add profile to dive #5');
    await expect(parts(page).getByRole('combobox')).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    const lateRow = item(page, 124).locator('label', { hasText: '55 min · surfaced 2 min' });
    expect((await lateRow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await lateRow.tap();
    await expect(late).toBeChecked();
    await expect(preview(page).getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await expect(parts(page)).toHaveCount(3);
    expect(sent[2]).toEqual({ dry_run: 'true', split: '124@1740,124@3300' });
    await expect(parts(page).nth(2)).toContainText('Part 3 · 11:57 · 13 min · 6.2 m');
    await expect(partSelect(page, 3)).toHaveValue('own');
    await partSelect(page, 3).selectOption({ label: 'Dive #7 · 13:00 · 63 min apart' });
    await expect(parts(page).nth(2)).toContainText('add profile to dive #7');
    await expect(preview(page)).toContainText('7 of 8 dives selected');
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    const commit = nextImport(page);
    await preview(page).getByRole('button', { name: 'Import', exact: true }).tap();
    expect(await commit).toEqual({
      only: '119,121,122,123,124',
      link: '121:2,124.3:7',
      split: '124@1740,124@3300',
    });
    const done = page.getByRole('region', { name: 'Imported' });
    await expect(done).toContainText('Profiles added to #3, #2, #4, #5, #7');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('the previous imports on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('show each import as a card with the file name on top', async ({ page }) => {
    await open(page);
    const table = page.getByRole('table', { name: 'Previous imports, newest first' });
    const name = 'Shearwater Cloud (owner@example.com) 2026-10-21.db';
    const file = table.locator('td.file');
    await expect(file).toHaveText(name);
    await expect(table.locator('thead')).toBeAttached();
    const lines = await file.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines).toBeLessThanOrEqual(2);
    expect((await file.boundingBox())!.width).toBeGreaterThanOrEqual(250);

    const link = table.getByRole('link', { name: /^download/ });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport({ ratio: 1 });
    const width = await page.evaluate(() => window.innerWidth);
    const box = (await link.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);

    const when = table.locator('td.when');
    const counts = table.locator('td.count');
    await expect(when).toHaveText('2026-10-22 11:57');
    await expect(counts).toHaveText(['2 created', '1 updated']);
    const fileBox = (await file.boundingBox())!;
    const tops = await Promise.all(
      [when, counts.nth(0), counts.nth(1), link].map(async (l) => (await l.boundingBox())!.y),
    );
    for (const top of tops) {
      expect(top).toBeGreaterThanOrEqual(fileBox.y + fileBox.height);
      expect(Math.abs(top - tops[0])).toBeLessThan(6);
    }

    expect(
      await table.evaluate((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth),
    ).toBeLessThanOrEqual(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test('the previous imports stay a table on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const table = page.getByRole('table', { name: 'Previous imports, newest first' });
  await expect(table.getByRole('columnheader', { name: 'Created' })).toBeVisible();
  await expect(table.locator('.count-label').first()).toBeHidden();
  const [when, file] = await Promise.all(
    ['td.when', 'td.file'].map(async (cell) => (await table.locator(cell).boundingBox())!),
  );
  expect(file.x).toBeGreaterThan(when.x + when.width - 1);
  expect(Math.abs(file.y - when.y)).toBeLessThan(2);
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
  await expect(parts(page)).toHaveCount(2);

  await page.keyboard.press('Tab');
  const offset = preview(page).getByRole('textbox', { name: 'Clock offset' });
  await expect(offset).toBeFocused();
  await page.keyboard.type('-30 min');
  const rerun = nextImport(page);
  await page.keyboard.press('Enter');
  expect(await rerun).toEqual({
    dry_run: 'true',
    split: '124@1740',
    clock_offset_min: '-30',
  });
  await expect(dives(page)).toContainText('(computer 09:20)');
  await expect(offset).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(dives(page).getByRole('checkbox', { name: /Perdix AI #124/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(splitAt(page).nth(0)).toBeFocused();
  await expect(splitAt(page).nth(0)).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(splitAt(page).nth(1)).toBeFocused();
  const split = nextImport(page);
  await page.keyboard.press('Space');
  expect(await split).toEqual({
    dry_run: 'true',
    split: '124@1740,124@3300',
    clock_offset_min: '-30',
  });
  await expect(parts(page)).toHaveCount(3);
  await expect(splitAt(page).nth(1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(partSelect(page, 2)).toBeFocused();
  await expect(partSelect(page, 2)).toHaveValue('5');
  await page.keyboard.press('Tab');
  await expect(partSelect(page, 3)).toBeFocused();
  await expect(partSelect(page, 3)).toHaveValue('own');
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
  expect(await commit).toEqual({
    only: '119,122,123,124',
    link: '121:2,124.2:5',
    split: '124@1740,124@3300',
    clock_offset_min: '-30',
  });
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
    await expect(rowBoxes(page)).toHaveCount(5);
    await expect(belongsTo(page, 121)).toBeVisible();
    await expect(parts(page)).toHaveCount(2);
    await splitAt(page).nth(1).check();
    await expect(partSelect(page, 3)).toBeVisible();
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
