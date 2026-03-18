import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clickCanvas,
  createProjectDocument,
  createRectangleFixture,
  dragCanvas,
  dragCanvasHookToPoint,
  openFreshEditor,
  openLayersTab,
  readStageDebug,
  readDownloadedJson,
  uploadProject,
} from './support/editor';

function rotatePoint(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number
) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + (point.x - origin.x) * cos - (point.y - origin.y) * sin,
    y: origin.y + (point.x - origin.x) * sin + (point.y - origin.y) * cos,
  };
}

function mapPointBetweenFrames(
  point: { x: number; y: number },
  fromFrame: { x: number; y: number; width: number; height: number; rotation: number },
  toFrame: { x: number; y: number; width: number; height: number; rotation: number }
) {
  const fromCenter = {
    x: fromFrame.x + fromFrame.width / 2,
    y: fromFrame.y + fromFrame.height / 2,
  };
  const toCenter = {
    x: toFrame.x + toFrame.width / 2,
    y: toFrame.y + toFrame.height / 2,
  };
  const local = rotatePoint(point, fromCenter, -fromFrame.rotation);
  const normalized = {
    x: (local.x - fromFrame.x) / Math.max(fromFrame.width, 1),
    y: (local.y - fromFrame.y) / Math.max(fromFrame.height, 1),
  };
  return rotatePoint(
    {
      x: toFrame.x + normalized.x * toFrame.width,
      y: toFrame.y + normalized.y * toFrame.height,
    },
    toCenter,
    toFrame.rotation
  );
}

test.describe('editor transforms', () => {
  test('supports single-item drag, resize, rotate, and delete flows', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'shape-under-test',
      x: 140,
      y: 140,
      width: 200,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]));

    await clickCanvas(page, { x: 240, y: 200 });
    await expect(page.getByTestId('canvas-shape-handle-middle-right')).toBeAttached();

    await dragCanvasHookToPoint(page, 'canvas-selected-item-overlay', { x: 340, y: 300 });
    await dragCanvasHookToPoint(page, 'canvas-shape-handle-middle-right', { x: 520, y: 300 });
    await dragCanvasHookToPoint(page, 'canvas-shape-handle-rotater', { x: 520, y: 420 });

    const savedProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Save' }).click();
      })
    );

    const savedItem = (savedProject.items as Array<Record<string, number | string>>).find(
      (item) => item.id === 'shape-under-test'
    );
    expect(savedItem).toBeDefined();
    expect(Number(savedItem?.x)).toBeGreaterThan(140);
    expect(Number(savedItem?.y)).toBeGreaterThan(140);
    expect(Number(savedItem?.width)).toBeGreaterThan(200);
    expect(Math.abs(Number(savedItem?.rotation))).toBeGreaterThan(10);

    await page.keyboard.press('Delete');
    await openLayersTab(page);
    await expect(page.locator('.layer-row-select')).toHaveCount(0);
  });

  test('keeps rotated group resizing aligned to the rotated frame across repeated transforms', async ({ page }) => {
    const first = createRectangleFixture({
      id: 'first',
      x: 100,
      y: 100,
      width: 80,
      height: 40,
      zIndex: 0,
    });
    const second = createRectangleFixture({
      id: 'second',
      x: 220,
      y: 100,
      width: 80,
      height: 40,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([first, second]));

    await dragCanvas(page, { x: 80, y: 80 }, { x: 340, y: 220 });
    await expect(page.getByTestId('canvas-group-rotater')).toBeAttached();

    const rotatedDebug = await readStageDebug(page);
    const initialFrame = rotatedDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected an initial group frame before rotation.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await dragCanvasHookToPoint(page, 'canvas-group-rotater', {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance,
      y: initialFrame.y + initialFrame.height / 2,
    });

    const afterRotateDebug = await readStageDebug(page);
    expect(Math.abs(afterRotateDebug.groupFrame?.rotation ?? 0)).toBeGreaterThan(80);
    expect(Math.abs(afterRotateDebug.groupFrame?.rotation ?? 0)).toBeLessThan(100);

    const rotatedFrame = afterRotateDebug.groupFrame;
    if (!rotatedFrame) {
      throw new Error('Expected a committed group frame after rotation.');
    }
    await dragCanvasHookToPoint(page, 'canvas-group-handle-middle-right', {
      x: rotatedFrame.x + rotatedFrame.width / 2,
      y: rotatedFrame.y + rotatedFrame.width / 2 + 100,
    });
    const resizedDebug = await readStageDebug(page);
    const resizedFrame = resizedDebug.groupFrame;
    const resizedSelection = resizedDebug.selectedItems;
    const rotatedSelection = afterRotateDebug.selectedItems;
    if (!resizedFrame || !resizedSelection || !rotatedSelection) {
      throw new Error('Expected selected group debug geometry after the rotated resize.');
    }

    const resizedProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Save' }).click();
      })
    );
    const resizedItems = resizedProject.items as Array<Record<string, number | string>>;
    for (const rotatedItem of rotatedSelection) {
      const resizedItem = resizedSelection.find((candidate) => candidate.id === rotatedItem.id);
      expect(resizedItem).toBeDefined();
      if (!resizedItem) {
        continue;
      }
      const expectedAnchor = mapPointBetweenFrames(
        { x: rotatedItem.x, y: rotatedItem.y },
        rotatedFrame,
        resizedFrame
      );
      expect(resizedItem.x).toBeCloseTo(expectedAnchor.x, 3);
      expect(resizedItem.y).toBeCloseTo(expectedAnchor.y, 3);

      const savedItem = resizedItems.find((candidate) => candidate.id === rotatedItem.id);
      expect(savedItem).toBeDefined();
      expect(Number(savedItem?.x)).toBeCloseTo(resizedItem.x, 3);
      expect(Number(savedItem?.y)).toBeCloseTo(resizedItem.y, 3);
    }

    await dragCanvasHookToPoint(page, 'canvas-group-rotater', {
      x: rotatedFrame.x + rotatedFrame.width / 2,
      y: rotatedFrame.y + rotatedFrame.height / 2 + rotaterDistance,
    });
    await dragCanvasHookToPoint(page, 'canvas-group-handle-bottom-right', { x: 360, y: 380 });

    const finalProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Save' }).click();
      })
    );

    expect(JSON.stringify(finalProject.items)).not.toBe(JSON.stringify(resizedProject.items));
  });
});
