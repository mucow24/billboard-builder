import { defineConfig, devices } from '@playwright/test';

const previewPort = 4173;
const playwrightEnv = { ...process.env };

// Playwright child processes set FORCE_COLOR, which makes Node warn if NO_COLOR is inherited too.
delete playwrightEnv.NO_COLOR;
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 8,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: {
      width: 1600,
      height: 1200,
    },
    launchOptions: {
      args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `npm run build && vite preview --host 127.0.0.1 --port ${previewPort}`,
    env: playwrightEnv,
    port: previewPort,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
