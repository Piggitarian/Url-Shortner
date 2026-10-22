import { defineConfig } from '@playwright/test';

// Browser verification · Step 1: Use one worker and retain traces only when a flow fails.
export default defineConfig({
  testDir: './test/browser',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:5001', headless: true, trace: 'retain-on-failure',
    launchOptions: process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
  },
  reporter: 'list',
});
