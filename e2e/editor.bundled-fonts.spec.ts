import { readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { gotoEditor, waitForEditor } from './support/editor';
import { fontRequestPattern } from './support/fonts';

// One bundled file, and the family, weight and style its name parses to.
const HELD_FILE = 'Barlow-Regular.ttf';
const HELD_FAMILY = 'Barlow';

/** Whether the held file's face is registered with the browser. */
function heldFaceRegistered(page: Page): Promise<boolean> {
  return page.evaluate(
    (family) =>
      [...document.fonts].some(
        (face) =>
          face.family === family &&
          face.weight === '400' &&
          face.style === 'normal' &&
          face.status === 'loaded',
      ),
    HELD_FAMILY,
  );
}

// The loader's unit tests pin the order in which files of one family, weight and
// style register. No bundled family has two such files, so that is not exercised here.
test.describe('bundled fonts', () => {
  // The editor is usable while fonts are still arriving, and text drawn before
  // its font is registered keeps its fallback look. So every font must be usable
  // as soon as it loads, not once all of them have.
  test('registers the other bundled fonts while one is still loading', async ({ page }) => {
    const bundledFileCount = readdirSync(path.join(process.cwd(), 'src/assets/fonts')).filter(
      (name) => /\.(ttf|otf|woff2?)$/.test(name),
    ).length;
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(fontRequestPattern(HELD_FILE), async (route) => {
      await released;
      await route.continue();
    });

    await gotoEditor(page);
    await waitForEditor(page);
    try {
      await expect
        .poll(() => page.evaluate(() => document.fonts.size), {
          message: 'waiting for bundled fonts to be registered while one is held back',
          timeout: 30_000,
        })
        .toBeGreaterThan(bundledFileCount / 2);
      expect(await heldFaceRegistered(page)).toBe(false);
    } finally {
      release();
    }
    await expect.poll(() => heldFaceRegistered(page), { timeout: 30_000 }).toBe(true);
  });
});
