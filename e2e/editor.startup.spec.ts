import { promises as fs } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  BUNDLED_FONT_REQUEST,
  captureDownload,
  clickItem,
  clickToolbarPopoverItem,
  createEllipseFixture,
  createGroupedProjectDocument,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  holdBundledFonts,
  openFavoritesTab,
  openFreshEditor,
  openLayersTab,
  uploadProject,
  waitForBundledFonts,
  waitForEditor,
} from './support/editor';
import { readPersistedCanvasDocument } from './support/persistence';

/** Waits until the autosaved canvas holds exactly the layers with these names. */
async function expectSavedCanvasLayers(page: Page, names: string[]) {
  await expect
    .poll(
      async () => {
        const saved = await readPersistedCanvasDocument(page);
        const nodes = Array.isArray(saved?.nodes) ? (saved.nodes as Array<{ name?: string }>) : null;
        return nodes?.map((node) => node.name) ?? null;
      },
      { message: `waiting for the autosaved canvas to hold the layers ${names.join(', ')}` },
    )
    .toEqual(names);
}

/** A row of the Layers tab, which labels a shape by its kind. */
function layerRow(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

// The editor used to be usable while startup was still waiting for the bundled
// fonts (about 38 MB). When they were in, startup replaced the canvas with the
// saved one, and nothing was autosaved before that. These tests keep the bundled
// fonts from arriving for as long as they need.
test.describe('editor startup', () => {
  test('SU-01 keeps a favorite inserted while the bundled fonts are still loading', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([createRectangleFixture({ id: 'saved-rect', name: 'Saved Rect' })]),
      'saved-canvas.json',
    );
    await clickItem(page, 'saved-rect');
    await page.getByRole('button', { name: 'Save as favorite' }).click();
    await expect(page.getByRole('status')).toHaveText('Added to favorites');
    await expectSavedCanvasLayers(page, ['Saved Rect']);

    const bundledFonts = await holdBundledFonts(page);
    await page.reload();
    await waitForEditor(page);

    await openFavoritesTab(page);
    await page.getByRole('button', { name: /^Insert / }).click();
    await openLayersTab(page);
    // The saved layer and the inserted one.
    await expect(page.locator('.layer-row')).toHaveCount(2);

    bundledFonts.release();
    await waitForBundledFonts(page);
    await expect(page.locator('.layer-row')).toHaveCount(2);
    await expectSavedCanvasLayers(page, ['Saved Rect', 'Saved Rect']);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(page.locator('.layer-row')).toHaveCount(2);
  });

  test('SU-02 keeps a project opened while the bundled fonts are still loading', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([createRectangleFixture({ id: 'saved-rect', name: 'Saved Rect' })]),
      'saved-canvas.json',
    );
    await expectSavedCanvasLayers(page, ['Saved Rect']);

    const bundledFonts = await holdBundledFonts(page);
    await page.reload();
    await waitForEditor(page);

    // The saved canvas is there as soon as the editor is.
    await openLayersTab(page);
    await expect(layerRow(page, 'Rectangle')).toBeVisible();

    await uploadProject(
      page,
      createProjectDocument([createEllipseFixture({ id: 'opened-ellipse', name: 'Opened Ellipse' })]),
      'opened-project.json',
    );
    await expect(layerRow(page, 'Ellipse')).toBeVisible();

    bundledFonts.release();
    await waitForBundledFonts(page);
    await expect(layerRow(page, 'Ellipse')).toBeVisible();
    await expect(layerRow(page, 'Rectangle')).toHaveCount(0);
    await expectSavedCanvasLayers(page, ['Opened Ellipse']);

    await page.reload();
    await waitForEditor(page);
    await openLayersTab(page);
    await expect(layerRow(page, 'Ellipse')).toBeVisible();
    await expect(layerRow(page, 'Rectangle')).toHaveCount(0);
  });

  test('SU-03 saves a canvas renamed while the bundled fonts are still loading', async ({ page }) => {
    const bundledFonts = await holdBundledFonts(page);
    await openFreshEditor(page);

    await page.getByTestId('canvas-name-display').click();
    await page.getByTestId('canvas-name-input').fill('Early Rename');
    await page.getByTestId('canvas-name-input').press('Enter');
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Early Rename');
    await expect
      .poll(async () => (await readPersistedCanvasDocument(page))?.name, {
        message: 'waiting for the renamed canvas to be autosaved',
      })
      .toBe('Early Rename');

    // Still without the bundled fonts.
    await page.reload();
    await waitForEditor(page);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Early Rename');

    bundledFonts.release();
    await waitForBundledFonts(page);
    await expect(page.getByTestId('canvas-name-display')).toHaveText('Early Rename');
  });

  // The saved canvas goes on screen with its fonts already registered, because
  // text drawn before its font is registered keeps its fallback look. Its fonts
  // load first and on their own, so it does not wait for the other 190-odd files.
  test('SU-04 shows the saved canvas once its own fonts are in, before the other bundled fonts', async ({ page }) => {
    const text = 'Hamburgefonstiv';
    const fontSize = 96;
    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(
      page,
      {
        ...createProjectDocument([
          createTextFixture({
            id: 'saved-text',
            text,
            fontFamily: 'Cal Sans',
            fontSize,
            x: 60,
            y: 100,
            width: 900,
            height: 140,
          }),
        ]),
        fonts: [{ family: 'Cal Sans', sourceName: 'CalSans-Regular.ttf', kind: 'bundled' }],
      },
      'saved-text.json',
    );
    await expectSavedCanvasLayers(page, ['Text']);

    const requested: string[] = [];
    let releaseCanvasFont = () => {};
    let releaseOtherFonts = () => {};
    const canvasFontReleased = new Promise<void>((resolve) => {
      releaseCanvasFont = resolve;
    });
    const otherFontsReleased = new Promise<void>((resolve) => {
      releaseOtherFonts = resolve;
    });
    await page.route(BUNDLED_FONT_REQUEST, async (route) => {
      const file = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
      requested.push(file);
      await (file.startsWith('CalSans-') ? canvasFontReleased : otherFontsReleased);
      await route.continue();
    });
    await page.reload();

    // While the canvas font is on its way: nothing else has been asked for, and
    // the editor is not there to be used yet.
    await expect.poll(() => requested.length, { timeout: 30_000 }).toBeGreaterThan(0);
    // Room for anything else that is going to be requested or shown to do so.
    await page.waitForTimeout(500);
    expect(requested.filter((file) => !file.startsWith('CalSans-'))).toEqual([]);
    await expect(page.getByTestId('canvas-stage-root')).toHaveCount(0);
    await expect(page.locator('#boot-shell')).toBeVisible();

    releaseCanvasFont();
    await waitForEditor(page);
    await expect(page.locator('#boot-shell')).toHaveCount(0);
    await openLayersTab(page);
    await expect(layerRow(page, 'Text')).toBeVisible();
    // The other fonts are being fetched now, and are still held back.
    await expect.poll(() => requested.length).toBeGreaterThan(1);
    expect(
      await page.evaluate(() =>
        [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/^["']|["']$/g, '')),
      ),
    ).toEqual(['Cal Sans']);

    // The canvas drew the text with that font: the ink is as wide as the font
    // makes it, which no fallback font matches.
    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await download.path());
    const widths = await page.evaluate(
      async ({ pngBase64, sample, size }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${pngBase64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let left = Infinity;
        let right = -Infinity;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (data[(y * canvas.width + x) * 4 + 3] > 128) {
              left = Math.min(left, x);
              right = Math.max(right, x);
            }
          }
        }
        const inkWidth = (family: string) => {
          context.font = `${size}px ${JSON.stringify(family)}`;
          const metrics = context.measureText(sample);
          return metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
        };
        return {
          drawn: right - left + 1,
          canvasFont: inkWidth('Cal Sans'),
          fallbackFont: inkWidth('No Such Font'),
        };
      },
      { pngBase64: png.toString('base64'), sample: text, size: fontSize },
    );
    expect(Math.abs(widths.canvasFont - widths.fallbackFont)).toBeGreaterThan(20);
    expect(Math.abs(widths.drawn - widths.canvasFont)).toBeLessThanOrEqual(3);

    releaseOtherFonts();
    await waitForBundledFonts(page);
    await expect(page.getByText('Missing fonts')).toHaveCount(0);
  });
});
