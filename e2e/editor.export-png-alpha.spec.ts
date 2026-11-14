import { promises as fs } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  captureDownload,
  clickToolbarPopoverItem,
  createEllipseFixture,
  createProjectDocument,
  createRectangleFixture,
  openFreshEditor,
  readStageDebug,
  uploadProject,
} from './support/editor';

/** The solid colours used in the fixture; every inked pixel must be one of them. */
const PALETTE = {
  magenta: [255, 0, 255],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  red: [255, 0, 0],
  cyan: [0, 255, 255],
} as const;

type ColourName = keyof typeof PALETTE;

interface AlphaScan {
  width: number;
  height: number;
  /** Partly transparent pixels of each colour that kept their colour. */
  translucent: Record<ColourName, number>;
  /** Pixels whose colour is none of the palette's, beyond rounding. */
  wrongCount: number;
  /** A few of those, for the failure message. */
  wrongSamples: Array<{ x: number; y: number; rgba: number[] }>;
}

/**
 * Export > PNG, decode the file in the page and check the colour of every
 * pixel that has any ink.
 */
async function exportAndScanColours(page: Page): Promise<AlphaScan> {
  const download = await captureDownload(page, async () => {
    await clickToolbarPopoverItem(page, 'Export', 'PNG');
  });
  const buffer = await fs.readFile(await download.path());
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

  return page.evaluate(
    async ({ url, palette }) => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('failed to decode exported png'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { width, height } = canvas;
      const { data } = ctx.getImageData(0, 0, width, height);

      const names = Object.keys(palette) as Array<keyof typeof palette>;
      const translucent = Object.fromEntries(names.map((name) => [name, 0])) as Record<
        keyof typeof palette,
        number
      >;
      let wrongCount = 0;
      const wrongSamples: Array<{ x: number; y: number; rgba: number[] }> = [];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const alpha = data[i + 3];
          // Below this a channel has too few levels left to name a colour.
          if (alpha < 8) continue;
          // The renderer works on colour * alpha in whole numbers, so a
          // channel can be off by a couple of those steps: 255 / alpha each.
          const tolerance = Math.ceil((3 * 255) / alpha) + 1;
          const match = names.find((name) =>
            palette[name].every((channel, c) => Math.abs(data[i + c] - channel) <= tolerance),
          );
          if (!match) {
            wrongCount += 1;
            if (wrongSamples.length < 8) {
              wrongSamples.push({ x, y, rgba: Array.from(data.slice(i, i + 4)) });
            }
          } else if (alpha < 250) {
            translucent[match] += 1;
          }
        }
      }
      return { width, height, translucent, wrongCount, wrongSamples };
    },
    { url: dataUrl, palette: PALETTE },
  );
}

test.describe('PNG export over a transparent background', () => {
  // Pixi renders colour * alpha. Its WebGL extract used to hand those values
  // to the file as if they were plain colour, so every partly transparent
  // pixel was darkened by its own alpha: half-opaque magenta came out as
  // half-opaque dark purple, and soft edges faded to black.
  test('keeps the colour of partly transparent pixels', async ({ page }) => {
    const items = [
      // Translucent all over.
      createRectangleFixture({
        id: 'half-opacity',
        name: 'Half opacity',
        x: 80,
        y: 80,
        width: 200,
        height: 200,
        fill: '#ff00ff',
        opacity: 0.5,
        zIndex: 0,
      }),
      // Antialiased edge.
      createEllipseFixture({
        id: 'ellipse',
        name: 'Ellipse',
        x: 420,
        y: 80,
        width: 240,
        height: 200,
        fill: '#00ff00',
        zIndex: 1,
      }),
      // A halo that fades through every alpha level.
      createRectangleFixture({
        id: 'blurred',
        name: 'Blurred',
        x: 120,
        y: 560,
        width: 240,
        height: 240,
        fill: '#0000ff',
        blurRadius: 6,
        zIndex: 2,
      }),
      // A translucent, soft drop shadow next to the opaque item casting it.
      createRectangleFixture({
        id: 'shadowed',
        name: 'Shadowed',
        x: 580,
        y: 560,
        width: 200,
        height: 200,
        fill: '#ff0000',
        shadow: { color: '#00ffff', blur: 0, offsetX: 60, offsetY: 60, opacity: 0.5 },
        zIndex: 3,
      }),
    ];

    await openFreshEditor(page);
    const project = createProjectDocument(items);
    expect(project.background).toBe('#ffffff00');
    await uploadProject(page, project, 'export-alpha.json');
    await expect.poll(async () => (await readStageDebug(page)).renderedItemCount).toBe(4);
    // Filters follow the zoom on screen; at 100% the canvas is drawn as exported.
    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();

    const scan = await exportAndScanColours(page);

    expect({ width: scan.width, height: scan.height }).toEqual({ width: 1024, height: 1024 });
    expect(scan.wrongSamples, 'pixels whose colour is not the item colour').toEqual([]);
    expect(scan.wrongCount).toBe(0);

    // Each kind of translucency is really in the file.
    expect(scan.translucent.magenta, 'half-opaque rectangle').toBeGreaterThan(30000);
    expect(scan.translucent.green, 'antialiased ellipse edge').toBeGreaterThan(100);
    expect(scan.translucent.blue, 'blur halo').toBeGreaterThan(1000);
    expect(scan.translucent.cyan, 'translucent drop shadow').toBeGreaterThan(5000);
    expect(scan.translucent.red, 'opaque rectangle casting the shadow').toBe(0);
  });
});
