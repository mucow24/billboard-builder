import { promises as fs } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  captureDownload,
  clickToolbarPopoverItem,
  createProjectDocument,
  createRectangleFixture,
  openFreshEditor,
  readStageDebug,
  uploadProject,
} from './support/editor';

interface InkBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface ExportScan {
  width: number;
  height: number;
  /** Pixels where the blurred magenta rectangle is at least half as strong as its fill. */
  blurBody: InkBox | null;
  /** Every pixel the blurred rectangle touches, faint halo included. */
  blurHalo: InkBox | null;
  /** The opaque green rectangle that casts a shadow. */
  shadowBody: InkBox | null;
  /** The black shadow it casts, wherever the rectangle does not cover it. */
  shadowInk: InkBox | null;
}

/**
 * Export > PNG, then measure where the two filtered rectangles landed in the
 * file. The export is the only pixel-accurate readback of what Pixi drew.
 */
async function exportAndScan(page: Page): Promise<ExportScan> {
  const download = await captureDownload(page, async () => {
    await clickToolbarPopoverItem(page, 'Export', 'PNG');
  });
  const buffer = await fs.readFile(await download.path());
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

  return page.evaluate(async (url) => {
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

    type Box = { left: number; top: number; right: number; bottom: number };
    const grow = (box: Box | null, x: number, y: number): Box =>
      box
        ? {
            left: Math.min(box.left, x),
            top: Math.min(box.top, y),
            right: Math.max(box.right, x + 1),
            bottom: Math.max(box.bottom, y + 1),
          }
        : { left: x, top: y, right: x + 1, bottom: y + 1 };

    let blurBody: Box | null = null;
    let blurHalo: Box | null = null;
    let shadowBody: Box | null = null;
    let shadowInk: Box | null = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // On the white background magenta fades to white through its green
        // channel alone: 0 is solid magenta, 255 is bare background.
        const magentaTint = r > 200 && b > 200;
        const green = g > 200 && r < 80 && b < 80;
        const black = r < 60 && g < 60 && b < 60;
        if (magentaTint && g < 235) {
          blurHalo = grow(blurHalo, x, y);
          if (g < 128) blurBody = grow(blurBody, x, y);
        }
        if (green) shadowBody = grow(shadowBody, x, y);
        if (black) shadowInk = grow(shadowInk, x, y);
      }
    }
    return { width, height, blurBody, blurHalo, shadowBody, shadowInk };
  }, dataUrl);
}

function expectBoxNear(actual: InkBox | null, expected: InkBox, tolerance: number) {
  expect(actual).not.toBeNull();
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(actual![side] - expected[side]), `${side} edge`).toBeLessThanOrEqual(tolerance);
  }
}

test.describe('PNG export of filtered items', () => {
  // Blur and drop shadow are Pixi filters. Pixi places a filter's working area
  // with the item's on-screen transform, so an export that draws the canvas at
  // its own scale used to show a blurred item cropped to its on-screen size and
  // moved by the viewport's pan, and a blur as strong as the zoom level.
  test('keeps blurred and shadowed items in place at any zoom and pan', async ({ page }) => {
    const blurred = createRectangleFixture({
      id: 'blurred-rect',
      name: 'Blurred',
      x: 520,
      y: 480,
      width: 360,
      height: 400,
      fill: '#ff00ff',
      blurRadius: 6,
      zIndex: 0,
    });
    const shadowed = createRectangleFixture({
      id: 'shadowed-rect',
      name: 'Shadowed',
      x: 120,
      y: 140,
      width: 240,
      height: 200,
      fill: '#00ff00',
      shadow: { color: '#000000', blur: 0, offsetX: 40, offsetY: 30, opacity: 1 },
      zIndex: 1,
    });

    await openFreshEditor(page);
    // An opaque background, so the file holds plain blended colours to measure.
    await uploadProject(
      page,
      { ...createProjectDocument([blurred, shadowed]), background: '#ffffffff' },
      'export-filters.json',
    );
    await expect.poll(async () => (await readStageDebug(page)).renderedItemCount).toBe(2);

    const blurBox = { left: 520, top: 480, right: 880, bottom: 880 };
    const shadowBodyBox = { left: 120, top: 140, right: 360, bottom: 340 };
    // The shadow shows to the right of and below the rectangle that casts it.
    const shadowInkBox = { left: 120 + 40, top: 140 + 30, right: 360 + 40, bottom: 340 + 30 };

    const scans: Array<{ zoom: number; scan: ExportScan }> = [];
    const record = async () => {
      const zoom = (await readStageDebug(page)).viewport.zoom;
      scans.push({ zoom, scan: await exportAndScan(page) });
    };

    // Fitted to the window: zoomed out and panned to the middle.
    await record();
    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await record();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await record();

    expect(new Set(scans.map(({ zoom }) => zoom)).size).toBe(3);

    for (const { zoom, scan } of scans) {
      await test.step(`zoom ${zoom}`, () => {
        expect({ width: scan.width, height: scan.height }).toEqual({ width: 1024, height: 1024 });
        // A blurred edge is at half strength where the sharp edge was.
        expectBoxNear(scan.blurBody, blurBox, 3);
        expectBoxNear(scan.shadowBody, shadowBodyBox, 2);
        // The rectangle covers the shadow's top-left part; its right and bottom
        // edges show where it fell.
        expect(scan.shadowInk).not.toBeNull();
        expect(Math.abs(scan.shadowInk!.right - shadowInkBox.right)).toBeLessThanOrEqual(3);
        expect(Math.abs(scan.shadowInk!.bottom - shadowInkBox.bottom)).toBeLessThanOrEqual(3);
      });
    }

    // The blur is as wide in the file whatever the zoom was on screen.
    const haloReach = scans.map(({ scan }) => scan.blurHalo!.right - blurBox.right);
    for (const reach of haloReach) {
      expect(reach).toBeGreaterThan(4);
      expect(Math.abs(reach - haloReach[0])).toBeLessThanOrEqual(3);
    }
  });
});

/** Export > PNG, then read the colour of the file at each point. */
async function exportAndSample(
  page: Page,
  points: Array<{ x: number; y: number }>,
): Promise<Array<{ r: number; g: number; b: number; a: number }>> {
  const download = await captureDownload(page, async () => {
    await clickToolbarPopoverItem(page, 'Export', 'PNG');
  });
  const buffer = await fs.readFile(await download.path());
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

  return page.evaluate(
    async ({ url, samplePoints }) => {
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
      return samplePoints.map(({ x, y }) => {
        const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
        return { r, g, b, a };
      });
    },
    { url: dataUrl, samplePoints: points },
  );
}

test.describe('PNG export of gradient fills', () => {
  // Pixi mirrors a shape's gradient when its line runs right-and-up or
  // left-and-down (angles between 90 and 180, and between 270 and 360), so
  // turning the angle used to swing the gradient back and forth.
  test('turns a rectangle gradient with its angle through every quadrant', async ({ page }) => {
    const WIDTH = 200;
    const HEIGHT = 100;
    const angles = [0, 30, 45, 90, 120, 135, 180, 210, 225, 270, 300, 315, -45];
    const boxes = angles.map((angle, index) => ({
      angle,
      x: 40 + (index % 4) * 240,
      y: 40 + Math.floor(index / 4) * 160,
    }));

    await openFreshEditor(page);
    await uploadProject(
      page,
      {
        ...createProjectDocument(
          boxes.map(({ angle, x, y }, index) =>
            createRectangleFixture({
              id: `gradient-${index}`,
              name: `Gradient ${angle}`,
              x,
              y,
              width: WIDTH,
              height: HEIGHT,
              fill: '#ff0000',
              secondaryFill: '#0000ff',
              gradientEnabled: true,
              gradientAngle: angle,
              zIndex: index,
            }),
          ),
        ),
        background: '#ffffffff',
      },
      'export-gradient-angles.json',
    );
    await expect.poll(async () => (await readStageDebug(page)).renderedItemCount).toBe(boxes.length);

    // Near each corner and in the middle, as fractions of the box.
    const spots = [
      { fx: 0.1, fy: 0.15 },
      { fx: 0.9, fy: 0.15 },
      { fx: 0.1, fy: 0.85 },
      { fx: 0.9, fy: 0.85 },
      { fx: 0.5, fy: 0.5 },
    ];
    const samples = boxes.flatMap(({ angle, x, y }) =>
      spots.map(({ fx, fy }) => {
        const localX = Math.round(fx * WIDTH);
        const localY = Math.round(fy * HEIGHT);
        // The gradient runs along (sin a, cos a) through the middle of the
        // box, and reaches the box's edges: 0 is top to bottom, 90 left to right.
        const radians = (angle * Math.PI) / 180;
        const dirX = Math.sin(radians);
        const dirY = Math.cos(radians);
        const halfLength = (WIDTH / 2) * Math.abs(dirX) + (HEIGHT / 2) * Math.abs(dirY);
        // Sampled at the pixel's centre.
        const along = (localX + 0.5 - WIDTH / 2) * dirX + (localY + 0.5 - HEIGHT / 2) * dirY;
        return { angle, fx, fy, point: { x: x + localX, y: y + localY }, blueShare: 0.5 + along / (2 * halfLength) };
      }),
    );

    const colours = await exportAndSample(
      page,
      samples.map(({ point }) => point),
    );

    samples.forEach(({ angle, fx, fy, blueShare }, index) => {
      const { r, g, b, a } = colours[index];
      const where = `angle ${angle} at (${fx}, ${fy})`;
      expect(a, where).toBe(255);
      expect(g, where).toBeLessThanOrEqual(8);
      expect(Math.abs(b - 255 * blueShare), `${where}: blue`).toBeLessThanOrEqual(10);
      expect(Math.abs(r - 255 * (1 - blueShare)), `${where}: red`).toBeLessThanOrEqual(10);
    });
  });
});
