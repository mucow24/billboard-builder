import { expect, test, type Page } from '@playwright/test';

import {
  clickEmptyCanvas,
  clickItem,
  collectLeafNodes,
  createGroupedProjectDocument,
  createImageFixture,
  dragEmptyCanvas,
  dragHandle,
  dragItemTo,
  openFreshEditor,
  readStageDebug,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
  uploadProject,
} from './support/editor';

// Selection handles take presses within 12px of their centres. These items
// are a few pixels across at the zoom the editor opens at, so every handle of
// a selected one reaches over its centre.
const HANDLE_REACH_PX = 12;

async function expectSmallOnScreen(page: Page, width: number, height: number) {
  const { zoom } = (await readStageDebug(page)).viewport;
  expect(width * zoom).toBeLessThan(HANDLE_REACH_PX);
  expect(height * zoom).toBeLessThan(HANDLE_REACH_PX);
}

/**
 * Two clicks on the item's centre, far enough apart for the selection handles
 * to be up before the second one, as in a double-click by hand.
 * `doubleClickItem` is quicker than that.
 */
async function slowDoubleClickItem(page: Page, id: string) {
  // Never pair up with an earlier click on the item.
  await page.waitForTimeout(410);
  await page.evaluate(async (itemId) => {
    const api = window.__BB_TEST__;
    if (!api?.clickItem) {
      throw new Error('__BB_TEST__.clickItem is not available');
    }
    await api.clickItem(itemId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await api.clickItem(itemId);
  }, id);
}

async function readSavedItems(page: Page) {
  const saved = await saveAndReadProject(page);
  const leaves = collectLeafNodes(saved.nodes as Array<Record<string, unknown>>);
  return (id: string) => leaves.find((item) => item.id === id);
}

async function expectCropModeFor(page: Page, id: string) {
  await expect.poll(async () => (await readStageDebug(page)).sessionKind ?? null).toBe('image-crop');
  expect((await readStageDebug(page)).selectedItems?.map((item) => item.id)).toEqual([id]);
}

async function leaveCropMode(page: Page) {
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();
}

test.describe('editor items small on screen', () => {
  test('a small image is double-clicked into crop mode and dragged by its middle, selected or not', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'small-image',
      name: 'Small Image',
      x: 520,
      y: 320,
      width: 24,
      height: 18,
    });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'small-image.json');
    await setCanvasTestHooksEnabled(page, false);
    await expectSmallOnScreen(page, 24, 18);

    // Not selected: the first click selects it and brings up its handles.
    expect((await readStageDebug(page)).selectedItems ?? []).toEqual([]);
    await slowDoubleClickItem(page, 'small-image');
    await expectCropModeFor(page, 'small-image');
    await leaveCropMode(page);

    // Already selected, handles up from the start.
    await clickEmptyCanvas(page, { x: 120, y: 120 });
    await clickItem(page, 'small-image');
    expect((await readStageDebug(page)).hasShapeHandles).toBe(true);
    await slowDoubleClickItem(page, 'small-image');
    await expectCropModeFor(page, 'small-image');
    await leaveCropMode(page);

    // A drag from its middle moves it; it used to resize it.
    await dragItemTo(page, 'small-image', 800, 500);
    const moved = (await readSavedItems(page))('small-image');
    expect(moved).toMatchObject({ width: 24, height: 18 });
    expect(Number(moved?.x)).toBeGreaterThan(700);
    expect(Number(moved?.y)).toBeGreaterThan(400);

    // The handles are still there to be dragged.
    await dragHandle(page, 'small-image', 'bottom-right', 100, 80);
    const resized = (await readSavedItems(page))('small-image');
    expect(Number(resized?.width)).toBeGreaterThan(100);
    expect(Number(resized?.height)).toBeGreaterThan(80);
  });

  test('a small multi-selection is dragged by its middle', async ({ page }) => {
    // Overlapping, so that the middle of their shared box is on an item.
    const left = createImageFixture({ id: 'small-left', name: 'Small Left', x: 520, y: 320, width: 14, height: 18, zIndex: 0 });
    const right = createImageFixture({ id: 'small-right', name: 'Small Right', x: 530, y: 320, width: 14, height: 18, zIndex: 1 });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([left, right]), 'small-pair.json');
    await setCanvasTestHooksEnabled(page, false);
    await expectSmallOnScreen(page, 24, 18);

    // Marquee around both.
    await dragEmptyCanvas(page, { x: 400, y: 250 }, { x: 700, y: 450 });
    await expect
      .poll(async () => (await readStageDebug(page)).selectedItems?.map((item) => item.id).sort())
      .toEqual(['small-left', 'small-right']);
    expect((await readStageDebug(page)).hasGroupOverlay).toBe(true);

    await dragEmptyCanvas(page, { x: 532, y: 329 }, { x: 832, y: 529 });

    const savedItem = await readSavedItems(page);
    for (const id of ['small-left', 'small-right']) {
      const item = savedItem(id);
      expect(item).toMatchObject({ width: 14, height: 18 });
      expect(Number(item?.x)).toBeGreaterThan(700);
      expect(Number(item?.y)).toBeGreaterThan(400);
    }
  });
});
