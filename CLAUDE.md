# Billboard Builder

## E2E Tests

Always run e2e tests via:

```
npm run e2e
```

This works from both Windows and WSL — the script (`scripts/run-e2e.mjs`)
automatically delegates to WSL when invoked on Windows.

**Never run `npx playwright test` directly on Windows.**

### Screenshot / visual-regression tests

Screenshot tests are **excluded** from the default `npm run e2e` run because
the snapshots are environment-sensitive (WSL vs CI rendering differences).

| Command | What it does |
|---|---|
| `npm run e2e` | Functional tests only (skips visual) |
| `npm run e2e:screenshots` | Visual/screenshot tests only |
| `npm run e2e:screenshots:update` | Regenerate screenshot baselines |
| `npm run e2e:all` | Everything (functional + visual) |
