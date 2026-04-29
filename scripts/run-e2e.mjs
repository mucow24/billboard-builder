#!/usr/bin/env node
/**
 * E2E test runner — thin wrapper around `playwright test` so the npm
 * scripts have a single entrypoint to call.
 *
 * Usage:  node scripts/run-e2e.mjs [playwright args...]
 *   e.g.  node scripts/run-e2e.mjs --headed
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "node_modules", "@playwright", "test", "cli.js");
const args = process.argv.slice(2);

try {
  execFileSync(process.execPath, [cli, "test", ...args], {
    stdio: "inherit",
    cwd: root,
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
