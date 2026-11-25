import { expect, test, type Page } from '@playwright/test';

import {
  canvasPointsToPage,
  createImageFixture,
  createProjectDocument,
  exportPngPixels,
  openFreshEditor,
  readStageDebug,
  uploadProject,
} from './support/editor';

// An image's colour adjustments (brightness, contrast, tint) are Pixi filters
// on its sprite, inside the blur and drop-shadow filters of the item around
// it. Pixi draws a filter only where its object is in view, and "in view" is
// the screen (or the exported canvas) for a nested filter too. The blur and
// the shadow read further than that: a shadow is cast sideways by a part of
// the image that may be out of view, and a blur at the edge of the view mixes
// in what lies just past it. The adjusted image used to end at the edge of the
// view for them: the shadow of the part out of view was missing, and the blur
// faded out towards the edge.

/** A plain white image: its tint is its whole colour, and it is opaque all over. */
function solidImageFixture(overrides: Record<string, unknown>) {
  const width = Number(overrides.width);
  const height = Number(overrides.height);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/></svg>`;
  return createImageFixture({
    src: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
    originalWidth: width,
    originalHeight: height,
    crop: { x: 0, y: 0, width, height },
    // Any active adjustment puts the filters on the sprite.
    adjustments: { brightness: 100, contrast: 50, tintColor: '#ff0000', tintStrength: 100 },
    ...overrides,
  });
}

/** The colour on screen at each canvas point. */
async function screenPixels(page: Page, points: Array<{ x: number; y: number }>) {
  const pagePoints = await canvasPointsToPage(page, points);
  const screenshot = await page.screenshot({ scale: 'css' });
  return page.evaluate(
    async ({ base64, samplePoints }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(image, 0, 0);
      return samplePoints.map(({ x, y }) => {
        const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return { r, g, b };
      });
    },
    { base64: screenshot.toString('base64'), samplePoints: pagePoints },
  );
}

test.describe('adjusted images under a blur or a drop shadow', () => {
  test('cast the shadow of a part that is panned out of view', async ({ page }) => {
    // The image covers x 100..500 and its shadow falls 300 to the right of it,
    // on x 400..800: the shadow at x 625 is cast by the image at x 325.
    const image = solidImageFixture({
      id: 'shadowed-image',
      x: 100,
      y: 300,
      width: 400,
      height: 300,
      shadow: { color: '#000000', blur: 0, offsetX: 300, offsetY: 0, opacity: 1 },
    });
    const shadowPoint = { x: 625, y: 450 };
    const imagePoint = { x: 490, y: 450 };

    await openFreshEditor(page);
    await uploadProject(page, { ...createProjectDocument([image]), background: '#ffffffff' }, 'image-shadow.json');
    // Fitted to the window, with the whole image in view, the shadow is there.
    const [inViewShadow] = await screenPixels(page, [shadowPoint]);
    expect(inViewShadow.r + inViewShadow.g + inViewShadow.b).toBeLessThan(60);

    // At 100%, pan until the image's left 300 pixels, x 100..400, are past the
    // left edge of the canvas view: the part that casts the shadow at x 625.
    await page.getByRole('button', { name: 'Set zoom to 100%' }).click();
    await expect.poll(async () => (await readStageDebug(page)).viewport.zoom).toBe(1);
    const stage = await page.getByTestId('canvas-stage-root').boundingBox();
    if (!stage) throw new Error('no canvas stage');
    const middle = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
    const [edge] = await canvasPointsToPage(page, [{ x: 400, y: 450 }]);
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(middle.x + stage.x - edge.x, middle.y + middle.y - edge.y, { steps: 12 });
    await page.mouse.up({ button: 'middle' });
    const [edgeAfter] = await canvasPointsToPage(page, [{ x: 400, y: 450 }]);
    expect(Math.abs(edgeAfter.x - stage.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(edgeAfter.y - middle.y)).toBeLessThanOrEqual(2);

    await expect
      .poll(async () => {
        const [imagePixel, shadowPixel] = await screenPixels(page, [imagePoint, shadowPoint]);
        return {
          // The image is still there, red (a screenshot is a few levels off)...
          imageIsRed: imagePixel.r > 240 && imagePixel.g < 15 && imagePixel.b < 15,
          // ...and so is the black shadow of the part that is not.
          shadowLight: shadowPixel.r + shadowPixel.g + shadowPixel.b,
        };
      })
      .toEqual({ imageIsRed: true, shadowLight: 0 });
  });

  test('are exported whole where they reach past the edge of the canvas', async ({ page }) => {
    // Covers x -300..100; its shadow falls 350 to the right, on x 50..450. The
    // shadow at x 225 is cast by the image at x -125, off the canvas.
    const shadowed = solidImageFixture({
      id: 'shadowed-image',
      x: -300,
      y: 100,
      width: 400,
      height: 300,
      shadow: { color: '#000000', blur: 0, offsetX: 350, offsetY: 0, opacity: 1 },
      zIndex: 1,
    });
    // Covers x 900..1300, across the right edge of the canvas at 1024. Blurred,
    // the image is still solid there: the edge of the canvas is not its edge.
    const blurred = solidImageFixture({
      id: 'blurred-image',
      x: 900,
      y: 600,
      width: 400,
      height: 300,
      blurRadius: 20,
      zIndex: 2,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      { ...createProjectDocument([shadowed, blurred]), background: '#ffffffff' },
      'image-export.json',
    );

    const [shadow, blurEdge, blurInside] = await exportPngPixels(page, [
      { x: 225, y: 250 },
      { x: 1022, y: 750 },
      { x: 990, y: 750 },
    ]);
    expect(shadow).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(blurInside).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(blurEdge).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });
});
