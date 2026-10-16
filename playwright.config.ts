import { defineConfig, devices } from '@playwright/test';

const port = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
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
