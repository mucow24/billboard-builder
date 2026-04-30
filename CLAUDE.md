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

Run e2e tests via:

```
npm run e2e
```

The script is a thin wrapper around `playwright test`. Pass `--headed` (or
use `npm run e2e:headed`) to watch the browser drive itself.
