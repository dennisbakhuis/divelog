import { defineConfig, devices } from '@playwright/test';

const STUB_PORT = 8399;
const APP_PORT = 4399;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node e2e/stub-backend.mjs ${STUB_PORT}`,
      url: `http://localhost:${STUB_PORT}/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm preview --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}/health`,
      reuseExistingServer: false,
      env: {
        DIVELOG_BACKEND_URL: `http://localhost:${STUB_PORT}`,
        DIVELOG_SITE_NAME: 'Reference dive log',
        DIVELOG_OWNER_NAME: 'Sam',
        DIVELOG_SITE_URL: `http://localhost:${APP_PORT}`,
      },
    },
  ],
});
