import { expect, test, type Page } from '@playwright/test';

import {
  canvasPointsToPage,
  clickItem,
  createProjectDocument,
  createSimpleGroupFixture,
  createTextFixture,
  doubleClickItem,
  movePointerToCanvasPoint,
  openFreshEditor,
  selectTool,
  uploadProject,
} from './support/editor';

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The node the hover outline is drawn around, or null without an outline. */
function hoverOutline(page: Page) {
  return page.getByTestId('canvas-stage-root').getAttribute('data-hover-outline');
}

/**
 * How many pixels on screen, in and just around a box given in canvas
 * coordinates, have the amber of the hover outline (0xfbbf24). Nothing else in
 * these fixtures is amber: text is white, fills are orange and blue, the
 * selection is sky blue.
 */
async function countHoverOutlinePixels(page: Page, box: CanvasBox) {
  const [topLeft, bottomRight] = await canvasPointsToPage(page, [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
  ]);
  const margin = 4;
  const screenshot = await page.screenshot({
    clip: {
      x: topLeft.x - margin,
      y: topLeft.y - margin,
      width: bottomRight.x - topLeft.x + margin * 2,
      height: bottomRight.y - topLeft.y + margin * 2,
    },
    scale: 'css',
  });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r > 200 && g > 140 && g < 230 && b < 120) count += 1;
    }
    return count;
  }, screenshot.toString('base64'));
}

/**
 * The outline of a box is drawn: far more amber pixels than anything but a
 * line around it would give (a box of 300 x 100 canvas px is about 84 x 28 px
 * on screen at the fitted zoom, so some 220 px of outline).
 */
async function expectOutlineDrawn(page: Page, box: CanvasBox) {
  await expect.poll(() => countHoverOutlinePixels(page, box)).toBeGreaterThan(60);
}

async function expectNoOutlineDrawn(page: Page, box: CanvasBox) {
  await expect.poll(() => countHoverOutlinePixels(page, box)).toBe(0);
}

test.describe('canvas hover outline', () => {
  test('HO-01 HO-02 HO-03 HO-04 outlines the unselected text box under the pointer', async ({ page }) => {
    // Two text boxes side by side, far wider than their text: nothing drawn
    // shows where one ends and the other begins.
    const leftBox = { x: 100, y: 200, width: 300, height: 100 };
    const rightBox = { x: 400, y: 200, width: 300, height: 100 };
    const lockedBox = { x: 100, y: 500, width: 300, height: 100 };
    const left = createTextFixture({ id: 'left-text', ...leftBox, text: 'L' });
    const right = createTextFixture({ id: 'right-text', ...rightBox, text: 'R' });
    const locked = createTextFixture({ id: 'locked-text', ...lockedBox, text: 'K', locked: true, zIndex: 2 });
    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([left, right, locked]), 'hover.json');
    // The upload leaves the mouse where its menu item was, which can be over an
    // item: start from blank canvas.
    await movePointerToCanvasPoint(page, { x: 800, y: 800 });
    await expectNoOutlineDrawn(page, leftBox);

    // HO-01: the outline is drawn around the box under the pointer, and only it.
    await movePointerToCanvasPoint(page, { x: 390, y: 250 });
    await expectOutlineDrawn(page, leftBox);
    await expect.poll(() => hoverOutline(page)).toBe('left-text');

    await movePointerToCanvasPoint(page, { x: 410, y: 250 });
    await expectOutlineDrawn(page, rightBox);
    await expect.poll(() => hoverOutline(page)).toBe('right-text');

    // Off both: nothing to outline.
    await movePointerToCanvasPoint(page, { x: 410, y: 400 });
    await expectNoOutlineDrawn(page, leftBox);
    await expectNoOutlineDrawn(page, rightBox);
    await expect.poll(() => hoverOutline(page)).toBeNull();

    // HO-03: clicks pass through a locked item, and so does hovering.
    await movePointerToCanvasPoint(page, { x: 250, y: 550 });
    await expectNoOutlineDrawn(page, lockedBox);
    await expect.poll(() => hoverOutline(page)).toBeNull();

    // HO-02: a selected item has its selection outline; only the other one is
    // pointed out.
    await clickItem(page, 'right-text');
    await expectNoOutlineDrawn(page, rightBox);
    await expect.poll(() => hoverOutline(page)).toBeNull();
    // (Clear of the selection's handles, which take the pointer themselves.)
    await movePointerToCanvasPoint(page, { x: 250, y: 250 });
    await expectOutlineDrawn(page, leftBox);
    await expect.poll(() => hoverOutline(page)).toBe('left-text');

    // HO-04: with another tool a click selects nothing, so nothing is pointed out.
    await selectTool(page, 'Rect');
    await expectNoOutlineDrawn(page, leftBox);
    await expect.poll(() => hoverOutline(page)).toBeNull();
    // Back on the select tool, the next move inside the same item counts.
    await selectTool(page, 'Select');
    await movePointerToCanvasPoint(page, { x: 200, y: 250 });
    await expectOutlineDrawn(page, leftBox);
    await expect.poll(() => hoverOutline(page)).toBe('left-text');
  });

  test('HO-06 HO-07 HO-08 outlines the group, or the item of a group that is drilled into', async ({ page }) => {
    // group-rect-1 (140,160 140x80) and group-rect-2 (340,220 120x72).
    const groupBox = { x: 140, y: 160, width: 320, height: 132 };
    const secondRectBox = { x: 340, y: 220, width: 120, height: 72 };
    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'hover-group.json');
    // Off the items, wherever the upload left the mouse.
    await movePointerToCanvasPoint(page, { x: 800, y: 800 });
    await expectNoOutlineDrawn(page, groupBox);

    // HO-06: a click here would select the group, so all of it is outlined.
    await movePointerToCanvasPoint(page, { x: 200, y: 200 });
    await expectOutlineDrawn(page, groupBox);
    await expect.poll(() => hoverOutline(page)).toBe('simple-group');

    // HO-08: the selected group has its selection outline, items included.
    await clickItem(page, 'group-rect-2');
    await movePointerToCanvasPoint(page, { x: 400, y: 256 });
    await expectNoOutlineDrawn(page, groupBox);
    await expect.poll(() => hoverOutline(page)).toBeNull();

    // HO-07: drilled into the first item, a click on the second selects it alone.
    await doubleClickItem(page, 'group-rect-1');
    await movePointerToCanvasPoint(page, { x: 430, y: 270 });
    await expectOutlineDrawn(page, secondRectBox);
    await expect.poll(() => hoverOutline(page)).toBe('group-rect-2');
  });
});
