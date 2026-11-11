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

The e2e step builds and serves the checkout it runs in, on a port of its
own (see "E2E Tests" below), so gates in several checkouts or worktrees can
run at the same time without waiting for each other.

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

### Server and port

Every run builds this checkout (`npm run build`) and serves `dist/` with
its own server, `scripts/e2e-server.mjs`. There is no fixed port (it used
to be 4173): the server binds port 0, so the operating system assigns a
free port, and Playwright takes the address from the line the server
prints:

```
[WebServer] E2E preview server: serving <checkout>\dist at http://127.0.0.1:<port>
```

That line is in the output of every run and names the build under test.
The address reaches the specs as `baseURL` through `E2E_BASE_URL`, which
Playwright sets from that line; setting the variable yourself has no effect.

- Runs in different checkouts never share a server or a port, so they can
  overlap freely. No port check is needed before `npm run e2e`,
  `npm run preflight` or `git push`.
- A server that is already running is never reused, whatever port it is
  on. Each run rebuilds, including when only test files changed.
- Two runs in the *same* checkout still share one `dist/` folder; do not
  overlap those.
