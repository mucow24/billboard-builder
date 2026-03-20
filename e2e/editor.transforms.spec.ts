import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clickCanvas,
  createImageFixture,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragCanvas,
  dragCanvasWithModifier,
  dragCanvasHookToPoint,
  openFreshEditor,
  openLayersTab,
  readStageDebug,
  readDownloadedJson,
  saveAndReadProject,
  uploadProject,
} from './support/editor';

function collectLeafNodes(nodes: Array<Record<string, unknown>>) {
  return nodes.flatMap((node) => {
    if (node.kind === 'group' && Array.isArray(node.children)) {
      return collectLeafNodes(node.children as Array<Record<string, unknown>>);
    }
    return [node];
  });
}

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
        await page.getByRole('button', { name: 'Save', exact: true }).click();
      })
    );

    const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
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

  test('ST-04 ST-05 ST-06 ST-10 ST-11 ST-12 supports text and line transform flows', async ({
    page,
  }) => {
    const text = createTextFixture({
      id: 'transform-text',
      x: 160,
      y: 140,
      width: 260,
      height: 92,
      text: 'Transform text',
      zIndex: 0,
    });
    const line = createLineFixture({
      id: 'transform-line',
      x: 140,
      y: 520,
      startX: 140,
      startY: 520,
      endX: 380,
      endY: 560,
      width: 240,
      height: 40,
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([text, line]), 'transforms-mixed.json');

    await clickCanvas(page, { x: 250, y: 180 });
    await dragCanvasHookToPoint(page, 'canvas-selected-item-overlay', { x: 340, y: 250 });
    await dragCanvasHookToPoint(page, 'canvas-shape-handle-middle-right', { x: 520, y: 250 });
    await dragCanvasHookToPoint(page, 'canvas-shape-handle-rotater', { x: 520, y: 360 });

    await clickCanvas(page, { x: 230, y: 540 });
    await dragCanvasHookToPoint(page, 'canvas-selected-item-overlay', { x: 330, y: 620 });
    await dragCanvasHookToPoint(page, 'canvas-line-handle-start', { x: 260, y: 600 });
    await dragCanvasHookToPoint(page, 'canvas-line-handle-end', { x: 520, y: 660 });

    const savedProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Save', exact: true }).click();
      }),
    );

    const savedItems = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>);
    const savedText = savedItems.find((item) => item.id === 'transform-text');
    const savedLine = savedItems.find((item) => item.id === 'transform-line');

    expect(savedText).toEqual(expect.objectContaining({ id: 'transform-text' }));
    expect(Number(savedText?.x)).toBeGreaterThan(160);
    expect(Number(savedText?.y)).toBeGreaterThan(140);
    expect(Math.abs(Number(savedText?.width) - 260)).toBeGreaterThan(40);
    expect(Math.abs(Number(savedText?.rotation))).toBeGreaterThan(10);

    expect(savedLine).toEqual(expect.objectContaining({ id: 'transform-line' }));
    expect(Number(savedLine?.startX)).toBeGreaterThan(140);
    expect(Number(savedLine?.startY)).toBeGreaterThan(520);
    expect(Number(savedLine?.endX)).toBeGreaterThan(380);
    expect(Number(savedLine?.endY)).toBeGreaterThan(560);
  });

  test('ST-07 ST-08 ST-09 supports image transform flows through real canvas interaction', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'transform-image',
      x: 520,
      y: 280,
      width: 160,
      height: 90,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([image]), 'transform-image.json');

    await clickCanvas(page, { x: 600, y: 325 });
    await dragCanvas(page, { x: 600, y: 325 }, { x: 720, y: 405 });
    await dragCanvas(page, { x: 800, y: 405 }, { x: 940, y: 405 });
    await dragCanvas(page, { x: 790, y: 310 }, { x: 930, y: 450 });

    const savedProject = await readDownloadedJson(
      await captureDownload(page, async () => {
        await page.getByRole('button', { name: 'Save', exact: true }).click();
      }),
    );

    const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-image',
    );
    expect(savedImage).toEqual(expect.objectContaining({ id: 'transform-image' }));
    expect(Number(savedImage?.x)).toBeGreaterThan(620);
    expect(Number(savedImage?.width)).toBeGreaterThan(240);
    expect(Math.abs(Number(savedImage?.rotation))).toBeGreaterThan(10);
  });

  test('ST-13 disables snapping during a control-modified item drag', async ({ page }) => {
    const movable = createRectangleFixture({
      id: 'snap-movable',
      x: 200,
      y: 120,
      width: 240,
      height: 120,
      zIndex: 0,
    });
    const sibling = createRectangleFixture({
      id: 'snap-sibling',
      x: 480,
      y: 120,
      width: 240,
      height: 120,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    const document = createProjectDocument([movable, sibling]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'snap-enabled.json');
    await clickCanvas(page, { x: 300, y: 180 });
    await dragCanvas(page, { x: 300, y: 180 }, { x: 584, y: 180 });
    const snappedProject = await saveAndReadProject(page);

    await openFreshEditor(page);
    await uploadProject(page, document, 'snap-disabled.json');
    await clickCanvas(page, { x: 300, y: 180 });
    await dragCanvasWithModifier(page, 'Control', { x: 300, y: 180 }, { x: 584, y: 180 });
    const unsnappedProject = await saveAndReadProject(page);

    const snappedItem = collectLeafNodes(snappedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'snap-movable',
    );
    const unsnappedItem = collectLeafNodes(unsnappedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'snap-movable',
    );

    expect(snappedItem).toBeDefined();
    expect(unsnappedItem).toBeDefined();
    expect(Number(snappedItem?.x)).toBeCloseTo(480, 0);
    expect(Number(unsnappedItem?.x)).toBeCloseTo(484, 0);
    expect(Number(unsnappedItem?.x)).toBeGreaterThan(Number(snappedItem?.x));
    expect(Number(snappedItem?.y)).toBe(120);
    expect(Number(unsnappedItem?.y)).toBe(120);
  });

  test('ST-15 supports off-canvas rectangle resize through the real overflow preview surface', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'off-canvas-transform-rect',
      x: -180,
      y: 160,
      width: 140,
      height: 100,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'off-canvas-transform-rect.json');

    await clickCanvas(page, { x: -120, y: 210 });
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasShapeHandles).toBe(true);

    await dragCanvas(page, { x: -180, y: 210 }, { x: -260, y: 210 });

    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasShapeHandles).toBe(true);

    const savedProject = await saveAndReadProject(page);
    const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'off-canvas-transform-rect',
    );
    expect(savedItem).toEqual(expect.objectContaining({ id: 'off-canvas-transform-rect' }));
    expect(Number(savedItem?.x)).toBeLessThan(-180);
    expect(Number(savedItem?.width)).toBeGreaterThan(140);
  });

  test('ST-14 constrains selected-item drag movement to a single axis when shift is held', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'shift-drag-rect',
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'shift-drag-rect.json');

    await clickCanvas(page, { x: 220, y: 140 });
    await dragCanvasWithModifier(page, 'Shift', { x: 220, y: 140 }, { x: 320, y: 200 });

    const savedProject = await saveAndReadProject(page);
    const savedRectangle = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'shift-drag-rect',
    );

    expect(savedRectangle).toBeDefined();
    expect(Number(savedRectangle?.x)).toBeCloseTo(300, 0);
    expect(Number(savedRectangle?.y)).toBeCloseTo(120, 0);
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
        await page.getByRole('button', { name: 'Save', exact: true }).click();
      })
    );
    const resizedItems = collectLeafNodes(resizedProject.nodes as Array<Record<string, number | string>>);
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
        await page.getByRole('button', { name: 'Save', exact: true }).click();
      })
    );

    expect(JSON.stringify(finalProject.nodes)).not.toBe(JSON.stringify(resizedProject.nodes));
  });
});
