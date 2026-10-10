import { expect, test, type Page } from '@playwright/test';
import { DIVE_NUMBERS, SITE_NAME, SITE_SLUG } from './fixtures.mjs';

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const PAGES: { path: string; heading: RegExp }[] = [
  { path: '/', heading: /Reference dive log/ },
  { path: '/dive', heading: /Every dive/ },
  { path: '/dive/1', heading: new RegExp(SITE_NAME) },
  { path: '/dive/sites', heading: /2 places/ },
  { path: `/dive/sites/${SITE_SLUG}`, heading: new RegExp(SITE_NAME) },
  { path: '/dive/trips', heading: /1 trip/ },
  { path: '/dive/people', heading: /2 people/ },
  { path: '/dive/gear', heading: /The gear behind the log/ },
];

for (const { path, heading } of PAGES) {
  test(`${path} renders`, async ({ page }) => {
    const errors = watchConsole(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

test('the home page shows the dive tile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Open the log →')).toBeVisible();
  await expect(page.locator('.tile dd').first()).toHaveText(String(DIVE_NUMBERS.length));
});

test('/admin sends visitors to the login page', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
});

test('/dive/og/dive/1.png is a PNG card', async ({ request }) => {
  const response = await request.get('/dive/og/dive/1.png');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
  expect((await response.body()).byteLength).toBeGreaterThan(10_000);
});

test('sitemap.xml lists every dive', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const body = await response.text();
  for (const number of DIVE_NUMBERS) expect(body).toContain(`/dive/${number}</loc>`);
});

test('the app proxies the API and media to the server', async ({ request }) => {
  expect((await request.get('/api/v1/dive/summary')).status()).toBe(200);
  const media = await request.get('/media/photos/x.png');
  expect(media.headers()['content-type']).toBe('image/png');
});
