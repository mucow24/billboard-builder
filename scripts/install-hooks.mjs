#!/usr/bin/env node
/**
 * Wire up the repo's git hooks. Runs from `npm install` via the
 * `prepare` script — must be cross-platform (cmd.exe and bash).
 */
import { execFileSync } from "node:child_process";

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});

// `--worktree` only works when extensions.worktreeConfig is enabled and
// we're actually inside a worktree. Failure here is expected and benign.
try {
  execFileSync("git", ["config", "--worktree", "core.hooksPath", ".githooks"], {
    stdio: "pipe",
  });
} catch {
  // Not a worktree (or worktreeConfig disabled) — main config above is enough.
}
