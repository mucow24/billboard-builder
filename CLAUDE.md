# Billboard Builder

## E2E Tests

E2E snapshots target **Linux Chromium only**. Always run e2e tests via:

```
npm run e2e
```

This works from both Windows and WSL — the script (`scripts/run-e2e.mjs`)
automatically delegates to WSL when invoked on Windows.

**Never run `npx playwright test` directly on Windows** — there are no win32
snapshots and the tests will fail.

To update snapshots: `npm run e2e:update-snapshots`
