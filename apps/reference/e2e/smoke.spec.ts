import { expect, test, type Page } from '@playwright/test';
import {
  COMMONS_NAME,
  COMMONS_SLUG,
  DIVE_NUMBERS,
  OWNER_COOKIE,
  SITE_NAME,
  SITE_SLUG,
} from './fixtures.mjs';

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
  { path: `/dive/sites/${COMMONS_SLUG}`, heading: new RegExp(COMMONS_NAME) },
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
  const dives = page.locator('.tile dd').first();
  await expect(dives.locator('.dl-visually-hidden')).toHaveText(String(DIVE_NUMBERS.length));
  await expect(dives.locator('[aria-hidden="true"]')).toHaveText(String(DIVE_NUMBERS.length));
});

test('a commons site credits the commons and a personal site does not', async ({ page }) => {
  await page.goto(`/dive/sites/${COMMONS_SLUG}`);
  const line = page.locator('.dl-attribution');
  await expect(line).toHaveText(
    'Site data © divelog-sites contributors (ODbL), descriptions and maps CC BY-SA 4.0 · 3f0c1a2',
  );
  await expect(line.getByRole('link', { name: 'divelog-sites' })).toHaveAttribute(
    'href',
    'https://github.com/divelog/divelog-sites',
  );
  await page.goto(`/dive/sites/${SITE_SLUG}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(SITE_NAME);
  await expect(page.locator('.dl-attribution')).toHaveCount(0);
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

test.describe('signed in', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: OWNER_COOKIE, value: '1', url: baseURL! }]);
  });

  test('the new-site page adopts a site from the commons search', async ({ page }) => {
    const errors = watchConsole(page);
    await page.addInitScript(() => Reflect.deleteProperty(window, 'WebGLRenderingContext'));
    await page.goto('/admin/sites/new');
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
    await page.getByText('Search the commons by name instead').click();
    await page.getByRole('searchbox', { name: 'Search the commons' }).fill('fontaine');
    const hits = page.locator('.commons-search .hits li');
    await expect(hits).toHaveCount(1);
    await expect(hits.first()).toContainText('Fontaine de Truffe');
    await expect(hits.first()).toContainText('commons');
    await expect(page.locator('.commons-search .known')).toContainText('Fontaine Saint-George');
    await hits.first().getByRole('button', { name: 'Use this site' }).click();
    await expect(page).toHaveURL(/\/admin\/sites\/fra-fontaine-de-truffe$/);
    expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  });

  test('the admin bar shows the commons, its notices and a commons pull', async ({ page }) => {
    await page.goto('/admin/sites/new');
    await page.getByRole('button', { name: 'Repository: clean' }).click();
    const status = page.getByRole('dialog', { name: 'Repository status' });
    await expect(status).toContainText('log 81b54bf');
    await expect(status).toContainText('commons 3f0c1a2 · clean');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '1 notice' }).click();
    const notices = page.getByRole('dialog', { name: 'Repo notices' });
    await expect(notices).toContainText('site fra-commons-cave: overlay written');
    await expect(notices.getByRole('link', { name: 'edit' })).toHaveAttribute(
      'href',
      `/admin/sites/${COMMONS_SLUG}`,
    );
    await page.getByRole('button', { name: 'pull commons' }).click();
    const pull = page.getByRole('dialog', { name: 'Commons pull' });
    await expect(pull).toContainText('Commons 3f0c1a2 → 9a8b7c6');
    await expect(pull).toContainText('log pinned');
    await expect(pull.getByRole('link', { name: COMMONS_SLUG })).toHaveAttribute(
      'href',
      `/admin/sites/${COMMONS_SLUG}`,
    );
    await expect(pull).toContainText('r2 → r4');
  });
});
