# Billboard Builder

## Preflight Gate

Every push is gated by a local pre-push hook that runs the full quality
suite. Nothing reaches the remote unless all checks pass.

```
npm run preflight
```

This runs, in order: clean-tree check, lint, typecheck, unit/integration
tests, and e2e tests. The git pre-push hook calls this automatically.

The same gate is enforced on Claude Code via `.claude/settings.json` —
any `git push` or `gh pr create` triggers the preflight automatically.

| Flag | Effect |
|---|---|
| `--skip-clean-check` | Skip the dirty-tree check (used by Claude Code hooks) |
| `--skip-e2e` | Skip e2e tests (convenience during local dev) |

**Escape hatch:** `git push --no-verify` bypasses the pre-push hook.
Use sparingly — the gate exists to prevent broken code from reaching the remote.

### Hook setup

Hooks activate automatically on `npm install` (via the `prepare` script).
If hooks aren't firing, run: `git config core.hooksPath .githooks`

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
