import { expect, test, type Page, type Request } from '@playwright/test';
import { OWNER_COOKIE } from './fixtures.mjs';

const isCreate = (r: Request) => r.method() === 'POST' && r.url().endsWith('/api/v1/admin/dives');

/** Press Tab until the element with `id` has focus: reaching a field the keyboard way. */
async function tabTo(page: Page, id: string, limit = 80) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => document.activeElement?.id)) === id) return;
  }
  throw new Error(`Tab never reached #${id}`);
}

test.describe('logging a dive', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ locale: 'en-GB', timezoneId: 'Europe/Amsterdam' });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  test('a repeat dive at the same site with the same buddies takes six actions', async ({
    page,
  }) => {
    let actions = 0;
    const act = async (step: () => Promise<unknown>) => {
      actions += 1;
      await step();
    };

    await act(() => page.goto('/admin/dives/new'));
    await page.waitForLoadState('networkidle');
    await act(() =>
      page.getByRole('button', { name: 'Same as previous dive', exact: true }).click(),
    );
    await act(() => page.getByLabel('Max depth (m)').fill('17.5'));
    await act(() => page.getByLabel('Duration (min)').fill('48'));
    await act(() => page.getByLabel('Time in').fill('11:20'));
    const created = page.waitForRequest(isCreate);
    await act(() => page.getByRole('button', { name: 'Save', exact: true }).click());

    const body = (await created).postDataJSON();
    expect(actions).toBeLessThanOrEqual(6);
    expect(body).toMatchObject({
      site_id: 'eg-coral-garden',
      people_ids: ['robin'],
      trip_id: 'red-sea-2025-03',
      max_depth_m: 17.5,
      duration_min: 48,
      time_in: '11:20',
      suit: '5 mm',
      visibility: 'public',
    });
    expect(body.tanks).toHaveLength(1);
    await expect(page).toHaveURL(/\/admin\/dives\/\d+$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dive #');
  });

  test('a dive can be logged with the keyboard alone', async ({ page }) => {
    await page.goto('/admin/dives/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New dive');

    await tabTo(page, 'dl-dive-time_in');
    await page.keyboard.type('0915');
    await tabTo(page, 'dl-dive-time_out');
    await page.keyboard.type('1003');
    await expect(page.getByLabel('Duration (min)')).toHaveValue('48');

    await tabTo(page, 'dl-dive-max_depth_m');
    await page.keyboard.type('21.4');

    await tabTo(page, 'dl-dive-site_id');
    await page.keyboard.type('quarry');
    await page.keyboard.press('Enter');
    await expect(page.locator('#dl-dive-site_id')).toHaveValue('Example Quarry');

    await tabTo(page, 'dl-dive-people_ids');
    await page.keyboard.type('ale');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Alex' })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dives\/new$/);

    const created = page.waitForRequest(isCreate);
    await page.keyboard.press('Control+s');
    const body = (await created).postDataJSON();
    expect(body).toMatchObject({
      site_id: 'nl-example-quarry',
      people_ids: ['alex'],
      time_in: '09:15',
      time_out: '10:03',
      duration_min: 48,
      max_depth_m: 21.4,
    });
    await expect(page).toHaveURL(/\/admin\/dives\/\d+$/);
  });

  test('a dive without depth or duration is not sent, and the fields say why', async ({
    page,
  }) => {
    let posted = false;
    page.on('request', (r) => {
      if (isCreate(r)) posted = true;
    });
    await page.goto('/admin/dives/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const duration = page.getByLabel('Duration (min)');
    await expect(duration).toHaveAttribute('aria-invalid', 'true');
    await expect(duration).toBeFocused();
    await expect(page.getByLabel('Max depth (m)')).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toBe(false);
  });

  test('the dive list filters by status through the URL', async ({ page }) => {
    await page.goto('/admin/dives?status=draft');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Drafts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/dives$/);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('link', { name: '+ New dive' }).first()).toBeVisible();
  });
});
