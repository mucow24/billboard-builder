import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command:
      'bash -lc \'export PATH="$HOME/.local/node-v22/bin:$PATH"; npm run build && npm run preview -- --host 127.0.0.1 --port 4173\'',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox','--disable-dev-shm-usage'] } : undefined },
    },
  ],
});
