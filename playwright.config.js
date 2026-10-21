import { defineConfig } from '@playwright/test';

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
