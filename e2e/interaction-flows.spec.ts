import { EditorPage } from './helpers/editorPage';
import { expect, test } from './helpers/test';

function getRectCenter(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

test('@p0 covers tool switching and canvas selection flows', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await page.keyboard.press('KeyT');
  await expect(page.getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyV');
  await expect(page.getByRole('button', { name: 'Arrow' })).toHaveAttribute('aria-pressed', 'true');

  await editor.createItem('Rect');
  await expect(page.getByRole('button', { name: 'Arrow' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.layer-row', { hasText: 'Rectangle' }).click();
  const selectedBeforeDeselect = await editor.getSelectedItemDebug();
  const selectedRect = selectedBeforeDeselect.nodeClientRect;
  if (!selectedRect) {
    throw new Error('Missing selected item bounds');
  }

  await editor.clickCanvasBackground();
  await expect(page.getByText('No selection')).toBeVisible();

  const center = getRectCenter(selectedRect);
  await editor.stage.locator('canvas').click({
    position: {
      x: center.x,
      y: center.y,
    },
  });
  await expect
    .poll(async () => {
      const debug = await editor.getSelectedItemDebug();
      return debug.documentItem ? (debug.documentItem.kind as string) : null;
    })
    .toBe('rectangle');
});

test('@p1 snaps a dragged rectangle onto a sibling alignment target', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Rect');
  await editor.dragSelectedItemBy(-220, 0);
  const firstRect = (await editor.getSelectedItemDebug()).documentItem as { x: number; y: number };
  await editor.createItem('Rect');
  await page.locator('.layer-row', { hasText: 'Rectangle' }).last().click();

  const selectedRect = (await editor.getSelectedItemDebug()).nodeClientRect;
  const secondRectBefore = (await editor.getSelectedItemDebug()).documentItem as { x: number; y: number };
  if (!selectedRect) {
    throw new Error('Missing selected item bounds');
  }
  const center = getRectCenter(selectedRect);
  const stageBox = await editor.stageBox();
  const targetDeltaX = firstRect.x - secondRectBefore.x + 4;

  await page.mouse.move(stageBox.x + center.x, stageBox.y + center.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + center.x + targetDeltaX, stageBox.y + center.y, {
    steps: 20,
  });
  await page.mouse.up();

  const snappedRect = (await editor.getSelectedItemDebug()).documentItem as { x: number; y: number };
  expect(Math.abs(snappedRect.x - firstRect.x)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('guide-count')).toHaveText('Guides: 0');
});

test('@p1 drags line endpoints directly on the canvas', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  await editor.createItem('Line');
  await expect(editor.layerRows).toHaveCount(1);

  const debugBefore = await editor.getSelectedItemDebug();
  const lineHandleRects = debugBefore.lineHandleRects as
    | { start: { x: number; y: number; width: number; height: number } }
    | null;
  if (!lineHandleRects) {
    throw new Error('Missing line handle bounds');
  }

  const startHandleCenter = getRectCenter(lineHandleRects.start);
  const stageBox = await editor.stageBox();

  await page.mouse.move(stageBox.x + startHandleCenter.x, stageBox.y + startHandleCenter.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + startHandleCenter.x + 80, stageBox.y + startHandleCenter.y + 40, {
    steps: 16,
  });

  const previewDebug = await editor.getSelectedItemDebug();
  const previewItem = previewDebug.previewItem as
    | { x: number; y: number; width: number; height: number }
    | null;
  const previewHandles = previewDebug.lineHandleRects as
    | {
        start: { x: number; y: number; width: number; height: number };
      }
    | null;
  if (!previewItem || !previewHandles) {
    throw new Error('Missing live line preview geometry');
  }

  expect(previewHandles.start.x).toBeGreaterThan(lineHandleRects.start.x + 70);
  expect(previewHandles.start.y).toBeGreaterThan(lineHandleRects.start.y + 30);
  expect(previewItem.width).toBeLessThan(Number(debugBefore.documentItem?.width));
  expect(previewItem.x).toBeGreaterThan(Number(debugBefore.documentItem?.x));

  await page.mouse.up();

  const debugAfter = await editor.getSelectedItemDebug();
  const documentItem = debugAfter.documentItem as { width: number; height: number; x: number; y: number };
  expect(documentItem.width).toBeCloseTo(previewItem.width, 0);
  expect(documentItem.x).toBeCloseTo(previewItem.x, 0);
  expect(documentItem.width).toBeLessThan(Number(debugBefore.documentItem?.width));
  expect(documentItem.x).toBeGreaterThan(Number(debugBefore.documentItem?.x));
});
