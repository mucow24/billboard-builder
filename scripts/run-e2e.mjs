#!/usr/bin/env node
/**
 * Cross-platform e2e test runner.
 *
 * E2E snapshots are Linux-only.  When invoked on Windows this script
 * re-executes itself inside WSL so that Playwright uses the Linux
 * Chromium renderer, keeping snapshots consistent.
 *
 * Usage:  node scripts/run-e2e.mjs [playwright args...]
 *   e.g.  node scripts/run-e2e.mjs --headed
 *         node scripts/run-e2e.mjs --update-snapshots
 */
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";

const args = process.argv.slice(2);

if (process.platform === "win32") {
  // Convert the Windows project root to its WSL path.
  // wslpath needs forward slashes — backslashes are swallowed by the WSL layer.
  const winRoot = resolve(import.meta.dirname, "..").replaceAll("\\", "/");
  const wslRoot = execFileSync("wsl", ["wslpath", "-u", winRoot], {
    encoding: "utf-8",
  }).trim();

  // Run playwright inside WSL, forwarding any extra CLI args.
  const result = (() => {
    try {
      execFileSync(
        "wsl",
        [
          "bash",
          "-ic",
          `cd '${wslRoot}' && npx playwright test ${args.map((a) => `'${a}'`).join(" ")}`,
        ],
        { stdio: "inherit" },
      );
      return { status: 0 };
    } catch (e) {
      return { status: e.status ?? 1 };
    }
  })();

  process.exit(result.status);
} else {
  // Already on Linux / WSL — run directly.
  const result = (() => {
    try {
      execFileSync("npx", ["playwright", "test", ...args], {
        stdio: "inherit",
        cwd: resolve(import.meta.dirname, ".."),
      });
      return { status: 0 };
    } catch (e) {
      return { status: e.status ?? 1 };
    }
  })();

  process.exit(result.status);
}
