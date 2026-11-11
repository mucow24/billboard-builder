import fs from 'node:fs/promises';

import { expect, test, type Browser, type Page } from '@playwright/test';

import {
  captureDownload,
  clickItem,
  clickToolbarPopoverItem,
  createProjectDocument,
  createTextFixture,
  gotoEditor,
  holdBundledFonts,
  openPropertiesTab,
  readStageDebug,
  uploadProject,
  waitForEditor,
  waitForBundledFonts,
} from './support/editor';
import { bundledFontPath, fontRequestPattern, hasFontFamily, waitForFontFamily } from './support/fonts';
import { expectPersistedCanvasFontFiles, uploadNamedFontFromPath } from './support/persistence';

/**
 * The canvas draws text with whatever the browser has for its font family at
 * that moment. A family whose font file has not been registered yet is drawn in
 * a fallback font, and nothing about the text layer changes when the file does
 * arrive. These tests put text on the canvas first and let its font arrive
 * afterwards. The canvas has to end up exactly as it does when the font was
 * there from the start.
 *
 * Export > PNG is the canvas as Pixi drew it, so the checks compare exports.
 */

interface Layer {
  name: string;
  /** The part of the canvas this layer owns: its box plus room for ink that leaves it. */
  cell: { x: number; y: number; width: number; height: number };
  item: Record<string, unknown>;
}

// Large enough that the canvas never fits the window above 100%, wherever it
// is opened from. Past 100% text is rasterised at the zoom level, and two
// exports only compare pixel for pixel when both were rasterised at one scale.
const CELL = { width: 640, height: 480 };
const CANVAS = { width: CELL.width * 2, height: CELL.height * 2 };

function layer(index: number, name: string, overrides: Record<string, unknown>): Layer {
  const cell = {
    x: (index % 2) * CELL.width,
    y: Math.floor(index / 2) * CELL.height,
    ...CELL,
  };
  return {
    name,
    cell,
    item: createTextFixture({
      id: `late-font-layer-${index}`,
      name,
      zIndex: index + 1,
      x: cell.x + 120,
      y: cell.y + 60,
      width: 240,
      height: 140,
      ...overrides,
    }),
  };
}

/**
 * `fonts` lists the font file of every family the layers use, as a saved project
 * does. The editor adds a missing entry itself once the family is registered,
 * and any change to the document re-renders every layer; with the entries in
 * place, the only thing that can redraw a layer here is its font arriving.
 */
function buildDocument(layers: Layer[], fonts: Array<Record<string, unknown>>) {
  return {
    ...createProjectDocument(layers.map((entry) => entry.item)),
    canvas: CANVAS,
    fonts,
  };
}

// A family that is registered long before the test touches the canvas. Its
// layer must look the same throughout, and must not be drawn again.
const CONTROL_FAMILY = 'Arizonia';
const CONTROL_TEXT = 'Steady';
const CONTROL_FONT = { family: CONTROL_FAMILY, sourceName: 'Arizonia-Regular.ttf', kind: 'bundled' };
const controlLayer = (index: number) =>
  layer(index, 'Control', { text: CONTROL_TEXT, fontFamily: CONTROL_FAMILY, fontSize: 64 });

async function exportPng(page: Page): Promise<Buffer> {
  expect((await readStageDebug(page)).viewport.zoom).toBeLessThanOrEqual(1);
  const download = await captureDownload(page, async () => {
    await clickToolbarPopoverItem(page, 'Export', 'PNG');
  });
  return fs.readFile(await download.path());
}

/** How many pixels of each layer's cell differ between two exports of the canvas. */
async function differingPixels(
  page: Page,
  layers: Layer[],
  first: Buffer,
  second: Buffer,
): Promise<Record<string, number>> {
  return page.evaluate(
    async ({ images, cells }) => {
      const [left, right] = await Promise.all(
        images.map(async (base64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          context.drawImage(image, 0, 0);
          return context;
        }),
      );
      return Object.fromEntries(
        cells.map(({ name, cell }) => {
          const a = left.getImageData(cell.x, cell.y, cell.width, cell.height).data;
          const b = right.getImageData(cell.x, cell.y, cell.width, cell.height).data;
          let differing = 0;
          for (let offset = 0; offset < a.length; offset += 4) {
            if (
              a[offset] !== b[offset] ||
              a[offset + 1] !== b[offset + 1] ||
              a[offset + 2] !== b[offset + 2] ||
              a[offset + 3] !== b[offset + 3]
            ) {
              differing += 1;
            }
          }
          return [name, differing];
        }),
      );
    },
    {
      images: [first.toString('base64'), second.toString('base64')],
      cells: layers.map(({ name, cell }) => ({ name, cell })),
    },
  );
}

const identical = (layers: Layer[]) => Object.fromEntries(layers.map(({ name }) => [name, 0]));

/** Waits until the canvas exports exactly as `reference`, layer by layer. */
async function expectCanvasToMatch(page: Page, layers: Layer[], reference: Buffer, message: string) {
  await expect
    .poll(async () => differingPixels(page, layers, await exportPng(page), reference), {
      message,
      timeout: 15_000,
    })
    .toEqual(identical(layers));
}

/**
 * Records every text the page draws on a 2D canvas, which is how Pixi
 * rasterises a text layer: one `fillText` per line.
 */
async function recordDrawnText(page: Page) {
  await page.addInitScript(() => {
    const drawn: string[] = [];
    (window as unknown as { __drawnText: string[] }).__drawnText = drawn;
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text: string, ...rest: [number, number, number?]) {
      drawn.push(text);
      return fillText.call(this, text, ...rest);
    };
  });
}

function timesDrawn(page: Page, text: string): Promise<number> {
  return page.evaluate(
    (wanted) =>
      (window as unknown as { __drawnText: string[] }).__drawnText.filter((entry) => entry === wanted).length,
    text,
  );
}

/** Opens the editor and waits until startup, and with it every bundled font, has finished. */
async function openEditorAfterStartup(page: Page) {
  await gotoEditor(page);
  await waitForEditor(page);
  await waitForBundledFonts(page);
}

/**
 * A fresh browser profile: nothing saved, no fonts held back. What `run` exports
 * there is what the canvas looks like when nothing arrived late.
 */
async function inFreshProfile<T>(browser: Browser, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Selects a layer on the canvas, which puts its font picker in the Properties tab. */
async function selectLayer(page: Page, entry: Layer) {
  await clickItem(page, String(entry.item.id));
  await openPropertiesTab(page);
  await expect(page.getByTestId('font-family-picker-trigger')).toBeVisible();
}

test.describe('text drawn before its font arrived', () => {
  test('is redrawn when its bundled font finishes loading', async ({ browser, page }) => {
    // Every glyph of this font is one em wide, far wider than any fallback font.
    const lateFile = 'PressStart-2P-Regular.ttf';
    const lateFamily = 'Press Start 2P';
    const layers = [
      layer(0, 'Late plain', { text: 'Late', fontFamily: lateFamily, fontSize: 48 }),
      // 288 px wide in the late font, so it wraps in the 240 px box; a fallback
      // font fits it on one line. Centred vertically, the text starts higher
      // once it is measured with the right font.
      layer(1, 'Late wrapped', {
        text: 'LATE FONT',
        fontFamily: lateFamily,
        fontSize: 32,
        align: 'center',
        verticalAlign: 'middle',
      }),
      controlLayer(2),
    ];
    const lateLayers = layers.slice(0, 2);
    const project = buildDocument(layers, [
      { family: lateFamily, sourceName: lateFile, kind: 'bundled' },
      CONTROL_FONT,
    ]);

    const reference = await inFreshProfile(browser, async (referencePage) => {
      await openEditorAfterStartup(referencePage);
      await waitForFontFamily(referencePage, lateFamily);
      await uploadProject(referencePage, project, 'late-font.json');
      return exportPng(referencePage);
    });

    await recordDrawnText(page);
    const lateFont = await holdBundledFonts(page, fontRequestPattern(lateFile));
    await gotoEditor(page);
    await waitForEditor(page);
    await waitForFontFamily(page, CONTROL_FAMILY);
    expect(await hasFontFamily(page, lateFamily)).toBe(false);

    await uploadProject(page, project, 'late-font.json');
    const whileLoading = await differingPixels(page, layers, await exportPng(page), reference);
    // The late font is not there yet: its layers are in a fallback font.
    for (const { name } of lateLayers) {
      expect(whileLoading[name], `${name}: drawn in a fallback font while its font is loading`).toBeGreaterThan(200);
    }
    expect(whileLoading.Control, 'Control: its font was there already').toBe(0);

    const lateDrawsBefore = await timesDrawn(page, 'Late');
    const controlDrawsBefore = await timesDrawn(page, CONTROL_TEXT);
    expect(controlDrawsBefore).toBeGreaterThan(0);

    lateFont.release();
    await waitForFontFamily(page, lateFamily);

    // Nobody touches the canvas: the layer is drawn again on its own...
    await expect
      .poll(() => timesDrawn(page, 'Late'), { message: 'the late layer is drawn again once its font is registered' })
      .toBeGreaterThan(lateDrawsBefore);
    // ...and only the layers whose font arrived.
    expect(await timesDrawn(page, CONTROL_TEXT), 'the control layer is not drawn again').toBe(controlDrawsBefore);

    await expectCanvasToMatch(
      page,
      layers,
      reference,
      'the canvas ends up as it is when the project is loaded after startup',
    );
  });

  test('is redrawn when its uploaded font is imported, and drawn the same after a reload', async ({
    browser,
    page,
  }) => {
    // A script face: the tail of its j swings far left of the glyph's own box,
    // so the layer is cut off unless it is measured with this font.
    const uploadedBytes = bundledFontPath('PinyonScript-Regular.ttf');
    const uploadedFile = 'Late-Upload-Regular.ttf';
    const uploadedFamily = 'Late Upload';
    const layers = [
      layer(0, 'Uploaded j', { text: 'j', fontFamily: uploadedFamily, fontSize: 100 }),
      layer(1, 'Uploaded words', {
        text: 'Joyful\nquay',
        fontFamily: uploadedFamily,
        fontSize: 48,
        align: 'right',
        verticalAlign: 'bottom',
      }),
      controlLayer(2),
    ];
    const uploadedLayers = layers.slice(0, 2);
    const project = buildDocument(layers, [
      { family: uploadedFamily, sourceName: uploadedFile, kind: 'uploaded' },
      CONTROL_FONT,
    ]);

    // The font is imported first, then the project that uses it is opened.
    const reference = await inFreshProfile(browser, async (referencePage) => {
      await openEditorAfterStartup(referencePage);
      const starter = controlLayer(0);
      await uploadProject(referencePage, buildDocument([starter], [CONTROL_FONT]), 'starter.json');
      await selectLayer(referencePage, starter);
      await uploadNamedFontFromPath(referencePage, uploadedBytes, uploadedFile);
      await waitForFontFamily(referencePage, uploadedFamily);
      await uploadProject(referencePage, project, 'uploaded-font.json');
      return exportPng(referencePage);
    });

    await openEditorAfterStartup(page);
    await uploadProject(page, project, 'uploaded-font.json');
    const beforeImport = await differingPixels(page, layers, await exportPng(page), reference);
    for (const { name } of uploadedLayers) {
      expect(beforeImport[name], `${name}: drawn in a fallback font before its font is imported`).toBeGreaterThan(200);
    }
    expect(beforeImport.Control, 'Control: its font was there already').toBe(0);

    await test.step('importing the font redraws the text that was waiting for it', async () => {
      await selectLayer(page, layers[2]);
      await uploadNamedFontFromPath(page, uploadedBytes, uploadedFile);
      await waitForFontFamily(page, uploadedFamily);
      await expectCanvasToMatch(
        page,
        layers,
        reference,
        'the canvas ends up as it is when the font was imported before the project was opened',
      );
    });

    await test.step('a reload, which restores the font from storage, draws it the same', async () => {
      await expectPersistedCanvasFontFiles(page, [uploadedFile, CONTROL_FONT.sourceName]);
      await page.reload();
      await waitForEditor(page);
      await waitForFontFamily(page, uploadedFamily);
      await expectCanvasToMatch(
        page,
        layers,
        reference,
        'the canvas ends up after the reload as it was before it',
      );
    });
  });
});
