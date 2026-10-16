import { defineConfig, devices } from '@playwright/test';

// Parallel checkouts can each preview on their own port: PREVIEW_PORT=4331 npx playwright test
const port = Number(process.env['PREVIEW_PORT'] ?? 4322);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  // CI runners have no GPU, so the 3D scenes render in software and slow everything down:
  // give assertions longer there, and retry a test before calling it failed.
  retries: process.env['CI'] ? 2 : 0,
  expect: { timeout: process.env['CI'] ? 15_000 : 5_000 },
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // Locally, drive the installed Edge; CI installs Playwright's Chromium.
    ...(process.env['CI'] ? {} : { channel: 'msedge' }),
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...(process.env['CI'] ? {} : { channel: 'msedge' }) } },
  ],
  webServer: {
    command: `npx astro preview --port ${port}`,
    port,
    reuseExistingServer: !process.env['CI'],
  },
});
