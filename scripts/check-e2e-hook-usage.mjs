/**
 * Checks that e2e tests classified as user-flow (identified by matrix IDs like
 * CS-01, ST-01, GT-04, etc.) do not use dragCanvasHookToPoint for their primary
 * interaction. Hook-based interactions belong in geometry/precision or
 * support/debug tests only.
 *
 * Usage: node scripts/check-e2e-hook-usage.js
 * Exit code 0 = clean, 1 = violations found.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const E2E_DIR = join(import.meta.dirname, '..', 'e2e');
const MATRIX_ID_PATTERN = /^\s*test\(\s*[`'"]((?:[A-Z]{2,3}-\d+\s*)+)/;
const HOOK_CALL_PATTERN = /dragCanvasHookToPoint\s*\(/;
const SUPPRESS_PATTERN = /\/\/\s*hook-ok:/;
const GEOMETRY_PREFIX = /^geometry:/i;

const violations = [];

for (const file of readdirSync(E2E_DIR)) {
  if (!file.endsWith('.spec.ts')) continue;

  const filePath = join(E2E_DIR, file);
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let currentTest = null;
  let currentTestLine = 0;
  let braceDepth = 0;
  let inTest = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const testMatch = line.match(MATRIX_ID_PATTERN);

    if (testMatch) {
      const testName = line.match(/test\(\s*[`'"]([^`'"]+)/)?.[1] ?? '';
      if (GEOMETRY_PREFIX.test(testName.replace(/^[A-Z]{2,3}-\d+\s*/g, '').trim())) {
        currentTest = null;
        continue;
      }
      currentTest = testMatch[1].trim();
      currentTestLine = i + 1;
      braceDepth = 0;
      inTest = true;
    }

    if (inTest) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0 && currentTest && i > currentTestLine) {
        inTest = false;
        currentTest = null;
      }
    }

    if (currentTest && HOOK_CALL_PATTERN.test(line) && !SUPPRESS_PATTERN.test(line)) {
      violations.push({
        file,
        line: i + 1,
        matrixIds: currentTest,
      });
    }
  }
}

if (violations.length > 0) {
  console.error('User-flow tests must not use dragCanvasHookToPoint for primary interactions.');
  console.error('These tests claim to prove real user flows but use synthetic hook dispatches:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  (${v.matrixIds})`);
  }
  console.error('\nUse dragRealHandle() or page.mouse with boundingBox() coordinates instead.');
  console.error('If this test is intentionally geometry/precision, prefix its name with "geometry:".');
  process.exit(1);
} else {
  console.log('All user-flow e2e tests use real interactions.');
}
