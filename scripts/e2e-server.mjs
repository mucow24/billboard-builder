#!/usr/bin/env node
/**
 * E2E preview server — serves this checkout's production build (dist/) on a
 * free port and announces the address on stderr.
 *
 * Started by playwright.config.ts as its webServer, right after
 * `npm run build`. The port is 0, so the operating system assigns a free one
 * at the moment the server binds: two checkouts running e2e at the same time
 * can never end up on the same port, and there is no fixed port for a stale
 * or foreign server to sit on.
 *
 * Playwright reads the address from the line printed below (webServer.wait
 * in playwright.config.ts) and uses it as the tests' baseURL. Keep the line
 * and that regular expression in sync.
 *
 * Usage:  node scripts/e2e-server.mjs
 */
import { resolve } from "node:path";
import { preview } from "vite";

const root = resolve(import.meta.dirname, "..");
const host = "127.0.0.1";

const server = await preview({
  root,
  preview: { host, port: 0, strictPort: true },
});

const { port } = server.httpServer.address();
const distDir = resolve(root, server.config.build.outDir);

// stderr, because Playwright shows a webServer's stderr by default: every
// run then says which checkout's build it is testing.
console.error(`E2E preview server: serving ${distDir} at http://${host}:${port}`);
