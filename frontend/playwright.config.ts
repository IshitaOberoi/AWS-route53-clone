import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests. By default Playwright starts a fresh, seeded backend (port 8000) and the
 * production frontend build (port 3000). Set BASE_URL to run against an existing deployment
 * instead (e.g. the live demo): `BASE_URL=https://… npx playwright test --grep @smoke`.
 */
const externalBaseUrl = process.env.BASE_URL;
const baseURL = externalBaseUrl ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // one SQLite database, shared by every test
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: 'node e2e/start-backend.mjs',
          url: 'http://localhost:8000/api/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: process.env.E2E_DEV
            ? 'npm run dev'
            : process.env.E2E_SKIP_BUILD
              ? 'npm run start'
              : 'npm run build && npm run start',
          url: 'http://localhost:3000/login',
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
          env: { BACKEND_URL: 'http://localhost:8000' },
        },
      ],
});
