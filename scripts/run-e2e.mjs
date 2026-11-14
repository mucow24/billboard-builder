#!/usr/bin/env node
/**
 * E2E test runner — thin wrapper around `playwright test` so the npm
 * scripts have a single entrypoint to call.
 *
 * Usage:  node scripts/run-e2e.mjs [playwright args...]
 *   e.g.  node scripts/run-e2e.mjs --headed
 */
import { execFileSync } from "node:child_process";
import { constants, setPriority } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "node_modules", "@playwright", "test", "cli.js");
const args = process.argv.slice(2);

// Run the suite below normal priority. Every process started from here
// (Playwright, its workers, the build, the server, the browsers) inherits
// it, so the tests still use every idle core but give way to whatever the
// person at the machine is doing.
try {
  setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
} catch {
  // Not allowed here; run at the inherited priority.
}

try {
  execFileSync(process.execPath, [cli, "test", ...args], {
    stdio: "inherit",
    cwd: root,
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
