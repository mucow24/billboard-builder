import { EditorPage } from './helpers/editorPage';
import { createPngBuffer } from './helpers/fixtures';
import { expect, test } from './helpers/test';

test.use({
  viewport: {
    width: 1700,
    height: 1600,
  },
});

function getRectCenter(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

test('@p1 keeps a dragged item visible near the right edge of the canvas', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Rect');
  await page.locator('.layer-row', { hasText: 'Rectangle' }).click();

  const stageBox = await editor.stageBox();
  const debugBefore = await editor.getSelectedItemDebug();
  const clientRect = debugBefore.nodeClientRect;
  if (!clientRect) {
    throw new Error('Missing selected item bounds');
  }

  const stageWidth = Number((await editor.getStageDebug()).stageSize.width);
  const dragTargetX = stageWidth - clientRect.width - 8;
  const itemCenter = getRectCenter(clientRect);

  await page.mouse.move(stageBox.x + itemCenter.x, stageBox.y + itemCenter.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + dragTargetX + clientRect.width / 2, stageBox.y + itemCenter.y, {
    steps: 20,
  });
  await expect(editor.stage).toHaveScreenshot('right-edge-visible.png');
  await page.mouse.up();

  const debugAfter = await editor.getSelectedItemDebug();
  const afterRect = debugAfter.nodeClientRect;
  if (!afterRect) {
    throw new Error('Missing item bounds after drag');
  }

  expect(afterRect.x).toBeGreaterThan(clientRect.x + 250);
  expect(afterRect.width).toBeGreaterThan(0);
  expect(afterRect.x + afterRect.width).toBeLessThanOrEqual(stageWidth + 1);
});

test('@p1 rotates an item without disappearing or teleporting away', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Rect');
  await page.locator('.layer-row', { hasText: 'Rectangle' }).click();

  const debugBefore = await editor.getSelectedItemDebug();
  const beforeRect = debugBefore.nodeClientRect;
  const rotationHandle = debugBefore.anchorClientRects?.rotater;
  if (!beforeRect || !rotationHandle) {
    throw new Error('Missing transform handle bounds');
  }

  const beforeCenter = getRectCenter(beforeRect);
  const rotationHandleCenter = getRectCenter(rotationHandle);
  const stageBox = await editor.stageBox();

  await page.mouse.move(stageBox.x + rotationHandleCenter.x, stageBox.y + rotationHandleCenter.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + rotationHandleCenter.x - 2, stageBox.y + rotationHandleCenter.y, {
    steps: 2,
  });
  await expect
    .poll(async () => (await editor.getSelectedItemDebug()).activeAnchor)
    .toBe('rotater');
  await page.mouse.move(stageBox.x + beforeRect.x - 60, stageBox.y + beforeRect.y + beforeRect.height / 2, {
    steps: 24,
  });
  await expect(editor.stage).toHaveScreenshot('rotation-mid-gesture.png');
  await page.mouse.up();

  const debugAfter = await editor.getSelectedItemDebug();
  const afterRect = debugAfter.nodeClientRect;
  if (!afterRect) {
    throw new Error('Missing item bounds after rotation');
  }
  const afterCenter = getRectCenter(afterRect);

  expect(afterRect.width).toBeGreaterThan(0);
  expect(afterRect.height).toBeGreaterThan(0);
  expect(Math.abs(Number(debugAfter.documentItem?.rotation))).toBeGreaterThan(45);
  expect(Math.abs(afterCenter.x - beforeCenter.x)).toBeLessThan(2);
  expect(Math.abs(afterCenter.y - beforeCenter.y)).toBeLessThan(2);
});

test('@p1 reflows multiline text live while resizing narrower', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Text');
  await page.locator('.layer-row', { hasText: 'Text' }).click();
  await page.getByLabel('Text content').fill(
    'One two three four five six seven eight nine ten eleven twelve.'
  );

  const beforeDebug = await editor.getSelectedItemDebug();
  const beforeRect = beforeDebug.nodeClientRect;
  const rightMiddle = beforeDebug.anchorClientRects?.['middle-right'];
  if (!beforeRect || !rightMiddle) {
    throw new Error('Missing right resize handle bounds');
  }
  const rightMiddleCenter = getRectCenter(rightMiddle);
  const stageBox = await editor.stageBox();

  await page.mouse.move(stageBox.x + rightMiddleCenter.x, stageBox.y + rightMiddleCenter.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + rightMiddleCenter.x - 2, stageBox.y + rightMiddleCenter.y, {
    steps: 2,
  });
  await expect
    .poll(async () => (await editor.getSelectedItemDebug()).activeAnchor)
    .toBe('middle-right');
  await page.mouse.move(stageBox.x + rightMiddleCenter.x - 120, stageBox.y + rightMiddleCenter.y, {
    steps: 20,
  });

  const midDebug = await editor.getSelectedItemDebug();
  expect(midDebug.previewItem).not.toBeNull();
  expect(Number((midDebug.previewItem as Record<string, number>).height)).toBeGreaterThan(
    beforeRect.height
  );
  await page.mouse.up();
});

test('@p0 @visual shrinks the visible stage shell when the canvas preset shrinks', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.setCanvasPreset('landscape');
  await expect(page.getByTestId('canvas-size')).toHaveText('1024 x 512');

  const beforeStageBox = await editor.stage.boundingBox();
  const beforeShellBox = await editor.stageShell.boundingBox();
  if (!beforeStageBox || !beforeShellBox) {
    throw new Error('Missing canvas bounds before preset change');
  }

  await expect(editor.canvasFrame).toHaveScreenshot('canvas-landscape.png');

  await editor.setCanvasPreset('square-sm');
  await expect(page.getByTestId('canvas-size')).toHaveText('512 x 512');

  const stageDebug = await editor.getStageDebug();
  expect(stageDebug.stageSize).toEqual({
    width: 512,
    height: 512,
  });

  const afterStageBox = await editor.stage.boundingBox();
  const afterShellBox = await editor.stageShell.boundingBox();
  if (!afterStageBox || !afterShellBox) {
    throw new Error('Missing canvas bounds after preset change');
  }

  expect(afterStageBox.width).toBeCloseTo(512, 0);
  expect(afterStageBox.height).toBeCloseTo(512, 0);
  expect(afterShellBox.width).toBeLessThan(beforeShellBox.width - 400);
  expect(afterShellBox.width).toBeCloseTo(afterStageBox.width, 0);
  expect(beforeStageBox.width).toBeCloseTo(1024, 0);

  await expect(editor.canvasFrame).toHaveScreenshot('canvas-square-sm.png');
});

test('@p1 preserves image aspect ratio until the user disables it', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.uploadImage({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: createPngBuffer(),
  });
  await expect(editor.layerRows).toHaveCount(1);

  const beforeImage = await editor.getSelectedItemDebug();
  const beforeItem = beforeImage.documentItem as { width: number; height: number };
  const beforeRatio = beforeItem.width / beforeItem.height;

  await editor.dragSelectedAnchor('bottom-right', 120, 0);
  const lockedItem = (await editor.getSelectedItemDebug()).documentItem as {
    width: number;
    height: number;
  };

  expect(lockedItem.width).toBeGreaterThan(beforeItem.width);
  expect(lockedItem.height).toBeGreaterThan(beforeItem.height);
  expect(lockedItem.width / lockedItem.height).toBeCloseTo(beforeRatio, 1);

  await page.getByLabel('Preserve aspect ratio').uncheck();
  await editor.dragSelectedAnchor('middle-right', 120, 0);
  const unlockedItem = (await editor.getSelectedItemDebug()).documentItem as {
    width: number;
    height: number;
  };

  expect(unlockedItem.width).toBeGreaterThan(lockedItem.width);
  expect(Math.abs(unlockedItem.height - lockedItem.height)).toBeLessThan(3);
});
