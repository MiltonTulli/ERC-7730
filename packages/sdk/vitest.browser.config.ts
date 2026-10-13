import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/browser/**/*.test.ts'],
    testTimeout: 60_000,
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
      headless: true,
    },
  },
});
