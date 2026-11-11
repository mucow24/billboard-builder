import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import opentype from 'opentype.js';

import { gotoEditor, waitForEditor } from './support/editor';
import { fontRequestPattern } from './support/fonts';

// Two bundled files whose names parse to the same family, weight and style
// ("Futura", regular, upright). They are different designs with different glyph
// widths, and the browser renders the family with whichever face it was given last.
// These tests need such a pair in the bundled set: without one they have nothing
// to exercise, and the loader's unit tests are what pins the registration order.
const FAMILY = 'Futura';
const SAME_VARIANT_FILES = ['Futura Book.otf', 'Futura Regular.ttf'];

const PROBE_GLYPHS = ['H', 'W', 'a'];
const PROBE_FONT_SIZE = 1000;

/** The advance width of each probe glyph in a bundled font file, in px at the probe size. */
function bundledGlyphAdvances(fontFile: string): number[] {
  const bytes = readFileSync(path.join(process.cwd(), 'src/assets/fonts', fontFile));
  const font = opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return PROBE_GLYPHS.map(
    (glyph) => ((font.charToGlyph(glyph).advanceWidth ?? 0) * PROBE_FONT_SIZE) / font.unitsPerEm,
  );
}

/** How many faces for the family's regular variant are registered with the browser. */
function registeredSameVariantFaces(page: Page): Promise<number> {
  return page.evaluate(
    (family) =>
      [...document.fonts].filter(
        (face) =>
          face.family === family &&
          face.weight === '400' &&
          face.style === 'normal' &&
          face.status === 'loaded',
      ).length,
    FAMILY,
  );
}

/**
 * Open the editor with one of the same-variant files held back until the other
 * has arrived, so that its load is the one that finishes last.
 */
async function openEditorWithFontLoadingLast(page: Page, lastFile: string) {
  const otherFilesArrived = Promise.all(
    SAME_VARIANT_FILES.filter((file) => file !== lastFile).map((file) =>
      page.waitForEvent('requestfinished', (request) =>
        fontRequestPattern(file).test(request.url()),
      ),
    ),
  );
  const heldRequest = fontRequestPattern(lastFile);
  await page.route(heldRequest, async (route) => {
    await otherFilesArrived;
    // Give the faces that have arrived time to finish loading. A loader that
    // registers each face as its load finishes then reliably registers the held
    // one last; nothing here is needed for a correct loader to pass.
    await page.waitForTimeout(500);
    await route.continue();
  });

  await gotoEditor(page);
  await waitForEditor(page);
  await otherFilesArrived;
  await expect
    .poll(() => registeredSameVariantFaces(page), {
      message: `waiting for both ${FAMILY} regular faces to be registered`,
      timeout: 30_000,
    })
    .toBe(SAME_VARIANT_FILES.length);
  await page.unroute(heldRequest);
}

/** The same-variant files whose glyph widths match what the browser measures for the family. */
async function filesTheFamilyRendersWith(page: Page): Promise<string[]> {
  const measured = await page.evaluate(
    ({ family, glyphs, fontSize }) => {
      const context = document.createElement('canvas').getContext('2d');
      if (!context) throw new Error('2D canvas is unavailable.');
      context.font = `normal 400 ${fontSize}px "${family}"`;
      return glyphs.map((glyph) => context.measureText(glyph).width);
    },
    { family: FAMILY, glyphs: PROBE_GLYPHS, fontSize: PROBE_FONT_SIZE },
  );
  return SAME_VARIANT_FILES.filter((file) =>
    bundledGlyphAdvances(file).every((advance, index) => Math.abs(advance - measured[index]) < 1),
  );
}

// Which face the browser picks among several with the same family, weight and
// style depends on the order they reach document.fonts, and only a real browser
// loading the real files shows what the canvas then draws with.
test.describe('bundled fonts', () => {
  test('renders a family that has two files for one weight and style with the same file, whichever finishes loading last', async ({ page }) => {
    const renderedWith: string[][] = [];
    for (const lastToLoad of SAME_VARIANT_FILES) {
      await openEditorWithFontLoadingLast(page, lastToLoad);
      renderedWith.push(await filesTheFamilyRendersWith(page));
    }

    // The probe tells the two files apart: a load renders with exactly one of them...
    expect(renderedWith[0]).toHaveLength(1);
    // ...and it is the same one however the loads were timed.
    expect(renderedWith[1]).toEqual(renderedWith[0]);
  });

  // The editor is usable while fonts are still arriving, and text drawn before
  // its font is registered keeps its fallback look. So only files of one variant
  // may wait for each other: every other font must be usable as soon as it loads.
  test('registers the other bundled fonts while one is still loading', async ({ page }) => {
    const bundledFileCount = readdirSync(path.join(process.cwd(), 'src/assets/fonts')).filter(
      (name) => /\.(ttf|otf|woff2?)$/.test(name),
    ).length;
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(fontRequestPattern(SAME_VARIANT_FILES[0]), async (route) => {
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
      // The held file's own variant is the exception: its later file waits for it.
      expect(await registeredSameVariantFaces(page)).toBe(0);
    } finally {
      release();
    }
    await expect
      .poll(() => registeredSameVariantFaces(page), { timeout: 30_000 })
      .toBe(SAME_VARIANT_FILES.length);
  });
});
