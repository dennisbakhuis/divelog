import { expect, test, type Page, type Request } from '@playwright/test';
import { OWNER_COOKIE } from './fixtures.mjs';
import { BUDDY_MAIL, linkFor, mailsTo } from './sign-link';

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

    // Typing into <input type=time> depends on the OS clock format (a 12-hour
    // runner wants AM/PM too), so the times are filled; tabbing still proves the order.
    await tabTo(page, 'dl-dive-time_in');
    await page.locator('#dl-dive-time_in').fill('09:15');
    await tabTo(page, 'dl-dive-time_out');
    await page.locator('#dl-dive-time_out').fill('10:03');
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

  test('a dive without depth or duration is not sent, and the fields say why', async ({ page }) => {
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

  test('a buddy signs a dive through the mailed link, mailed once however often it is saved', async ({
    page,
    browser,
    baseURL,
    request,
  }) => {
    await page.goto('/admin/dives/new');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Date').fill('2023-06-10');
    await page.getByLabel('Duration (min)').fill('41');
    await page.getByLabel('Max depth (m)').fill('16');
    await page.locator('#dl-dive-people_ids').fill('ale');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Alex' })).toBeVisible();
    const ask = page.getByRole('checkbox', { name: 'E-mail buddies to sign' });
    await ask.check();

    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/admin/dives'),
    );
    const asked = page.waitForResponse((r) => /\/admin\/dives\/\d+\/sign-requests$/.test(r.url()));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const { number } = (await (await created).json()) as { number: number };
    expect((await asked).request().postDataJSON()).toEqual({ people: null, resend: false });
    await expect(page.locator('.toast-message', { hasText: 'Sent to Alex' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/dives/${number}$`));

    const link = await linkFor(request, number);
    expect(link).toMatch(new RegExp(`^/dive/${number}\\?sign=`));
    const mailed = (await mailsTo(request)).filter((m) => m.text.includes(`/dive/${number}?`));
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).toMatchObject({ to: BUDDY_MAIL, subject: 'Sam logged a dive with you' });

    const buddy = await browser.newContext({ baseURL });
    expect(await buddy.cookies()).toEqual([]);
    const signing = await buddy.newPage();
    await signing.goto(link!);
    await expect(
      signing.getByText('Hi Alex, Sam logged this dive with you. Sign it:'),
    ).toBeVisible();
    await expect(signing).toHaveURL(new RegExp(`/dive/${number}$`));
    await signing.getByLabel('Comment').fill('Cold feet, great vis.');
    const signed = signing.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/v1/dive/sign/'),
    );
    await signing.getByRole('button', { name: 'Sign the dive' }).click();
    expect((await signed).status()).toBe(200);
    await expect(signing.getByText('Thank you, Alex')).toBeVisible();
    await signing.goto(link!);
    await expect(signing.getByText(/You signed this dive on \d+ \w+/)).toBeVisible();
    await expect(signing.getByRole('button', { name: 'Sign the dive' })).toHaveCount(0);
    const shown = signing.getByRole('region', { name: 'Buddy notes' });
    await expect(shown).toContainText('“Cold feet, great vis.”');
    await expect(shown.getByRole('link', { name: 'Alex' })).toHaveAttribute(
      'href',
      '/dive/people/alex',
    );
    await buddy.close();

    await page.reload();
    await page.waitForLoadState('networkidle');
    const notes = page.locator('details', {
      has: page.locator('summary', { hasText: 'Buddy notes' }),
    });
    if (!(await notes.evaluate((d) => (d as HTMLDetailsElement).open)))
      await notes.locator('summary').click();
    await expect(notes.locator('li').first()).toContainText('signed on');
    await expect(notes.locator('li').first()).toContainText('“Cold feet, great vis.”');
    const publicLabel = notes.locator('label.check').first();
    await expect(publicLabel).toContainText('Public');
    expect(await publicLabel.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');

    await page.getByLabel('Max depth (m)').fill('16.5');
    await expect(ask).toBeChecked();
    const again = page.waitForResponse((r) => /\/admin\/dives\/\d+\/sign-requests$/.test(r.url()));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect(((await (await again).json()) as { sent: string[] }).sent).toEqual([]);
    await expect(page.locator('.toast-message', { hasText: 'Nobody new to ask' })).toBeVisible();
    expect(
      (await mailsTo(request)).filter((m) => m.text.includes(`/dive/${number}?`)),
    ).toHaveLength(1);
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

test.describe('the dive pages on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  for (const path of ['/admin', '/admin/dives/new', '/admin/dives/3', '/admin/import']) {
    test(`${path} does not scroll sideways at 390 px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const save = page.locator('.save-bar');
      if (await save.count()) {
        const box = await save.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      }
    });
  }
});
