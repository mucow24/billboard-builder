import { defineConfig, devices } from '@playwright/test';

const previewPort = 4173;
const playwrightEnv = { ...process.env };

// Playwright child processes set FORCE_COLOR, which makes Node warn if NO_COLOR is inherited too.
delete playwrightEnv.NO_COLOR;
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? undefined : 12,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      scale: 'device',
    },
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
  },
  webServer: {
    command: `npm run build && vite preview --host 127.0.0.1 --port ${previewPort}`,
    env: playwrightEnv,
    port: previewPort,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.CI
          ? {
              headless: false,
              launchOptions: {
                args: ['--use-gl=egl', '--use-angle=gl', '--ignore-gpu-blocklist'],
              },
            }
          : {}),
      },
    },
  ],
});
