import { defineConfig, devices } from '@playwright/test';

// The e2e server has no fixed port. scripts/e2e-server.mjs serves this
// checkout's build on a free port assigned by the operating system and prints
// its address; `webServer.wait` below captures that address into
// process.env.E2E_BASE_URL. Playwright starts the server before it starts any
// worker, and every worker evaluates this file again, so `use.baseURL` below
// resolves to the server this run started. (In the main process the variable
// is still unset when this file is first evaluated; nothing there needs it.)
//
// Do not add `port`, `url` or `reuseExistingServer` to `webServer`: with any
// of them Playwright probes an address and accepts whatever answers there,
// which is how a run used to end up testing another checkout's build.
const playwrightEnv = { ...process.env };

// Playwright child processes set FORCE_COLOR, which makes Node warn if NO_COLOR is inherited too.
delete playwrightEnv.NO_COLOR;
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 8,
  retries: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL,
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
    command: 'npm run build && node scripts/e2e-server.mjs',
    env: playwrightEnv,
    // Ready when this run's own server process says so. The named group is
    // stored in process.env under its upper-cased name.
    wait: {
      stderr: /^E2E preview server: serving .* at (?<E2E_BASE_URL>http:\/\/127\.0\.0\.1:\d+)/m,
    },
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
