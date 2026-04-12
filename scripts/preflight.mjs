#!/usr/bin/env node
/**
 * Preflight gate — runs all quality checks before allowing a push.
 *
 * Usage:  node scripts/preflight.mjs [flags]
 *
 * Flags:
 *   --skip-clean-check   Skip the clean-working-tree check
 *   --skip-e2e           Skip e2e tests (convenience for local dev)
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const skipClean = args.has("--skip-clean-check");
const skipE2e = args.has("--skip-e2e");

const steps = [
  ...(!skipClean ? [{ label: "Checking working tree is clean", fn: checkClean }] : []),
  { label: "Lint", fn: () => run("npm", ["run", "lint"]) },
  { label: "Typecheck", fn: () => run("npm", ["run", "typecheck"]) },
  { label: "Unit/integration tests", fn: () => run("npm", ["test"]) },
  ...(!skipE2e ? [{ label: "E2e tests", fn: () => run("npm", ["run", "e2e"]) }] : []),
];

const total = steps.length;
const totalStart = Date.now();

console.log("\n=== Preflight Gate ===\n");

for (let i = 0; i < steps.length; i++) {
  const { label, fn } = steps[i];
  const tag = `[${i + 1}/${total}]`;
  process.stdout.write(`${tag} ${label}...`);
  const start = Date.now();
  try {
    fn();
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  OK  (${sec}s)`);
  } catch {
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  FAILED  (${sec}s)`);
    console.log(`\n=== Preflight FAILED at step ${i + 1}: ${label} ===\n`);
    process.exit(1);
  }
}

const totalSec = ((Date.now() - totalStart) / 1000).toFixed(1);
console.log(`\n=== All checks passed (${totalSec}s) ===\n`);

// ── helpers ──────────────────────────────────────────────────────────

function run(cmd, cmdArgs) {
  execFileSync(cmd, cmdArgs, { stdio: "inherit", cwd: root, shell: true });
}

function checkClean() {
  const out = execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf-8",
    cwd: root,
  }).trim();
  if (out) {
    console.log("\n");
    console.log(out);
    throw new Error("Working tree is not clean");
  }
}
