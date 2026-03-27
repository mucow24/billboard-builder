import { expect, test } from '@playwright/test';

import {
  beginCanvasDrag,
  clickCanvas,
  createImageFixture,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragCanvas,
  dragCanvasWithModifier,
  dragCanvasHookToPoint,
  middleDragCanvas,
  movePointerToCanvasPoint,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readStageDebug,
  releasePointer,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
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
  test('ST-01 drags a rectangle through a real canvas interaction', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'drag-rect',
      x: 140,
      y: 140,
      width: 200,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'drag-rect.json');
    await setCanvasTestHooksEnabled(page, false);

    // Select by clicking the item body
    await clickCanvas(page, { x: 240, y: 200 });
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

    // Drag the item body
    await dragCanvas(page, { x: 240, y: 200 }, { x: 360, y: 300 });

    // Verify selection survived the drag
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

    // Verify saved geometry changed
    const savedProject = await saveAndReadProject(page);
    const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'drag-rect'
    );
    expect(savedItem).toBeDefined();
    expect(Number(savedItem?.x)).toBeGreaterThan(200);
    expect(Number(savedItem?.y)).toBeGreaterThan(200);
    expect(Number(savedItem?.width)).toBe(200);
    expect(Number(savedItem?.height)).toBe(120);
  });

  test('ST-02 resizes a rectangle through a real canvas interaction', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'resize-rect',
      x: 140,
      y: 140,
      width: 200,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'resize-rect.json');

    // Select by clicking the item body
    await clickCanvas(page, { x: 240, y: 200 });
    await expect(page.getByTestId('canvas-shape-handle-middle-right')).toBeAttached();

    // Use debug state to locate the middle-right handle position, then drag it
    // with a real mouse interaction at that canvas coordinate
    const debug = await readStageDebug(page);
    const rect = debug.selectedItemViewportRect;
    if (!rect) {
      throw new Error('Expected a selected item viewport rect after selection.');
    }
    // middle-right handle is at the right edge, vertically centered
    const handleX = 140 + 200; // item right edge in canvas space
    const handleY = 140 + 60;  // item vertical center in canvas space

    await dragCanvas(page, { x: handleX, y: handleY }, { x: handleX + 120, y: handleY });

    // Verify selection still active
    await openPropertiesTab(page);
    await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

    // Verify saved geometry changed — width should have increased
    const savedProject = await saveAndReadProject(page);
    const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'resize-rect'
    );
    expect(savedItem).toBeDefined();
    expect(Number(savedItem?.width)).toBeGreaterThan(280);
    expect(Number(savedItem?.rotation)).toBe(0);
  });

  test('ST-04 ST-05 ST-06 drags, resizes, and rotates a text item through real canvas interactions', async ({
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

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([text]), 'transform-text.json');
    await setCanvasTestHooksEnabled(page, false);

    // ST-04: Select and drag
    await clickCanvas(page, { x: 250, y: 180 });
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();

    await dragCanvas(page, { x: 250, y: 180 }, { x: 370, y: 260 });
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();

    let savedProject = await saveAndReadProject(page);
    let savedText = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-text'
    );
    expect(Number(savedText?.x)).toBeGreaterThan(250);
    expect(Number(savedText?.y)).toBeGreaterThan(200);

    // ST-05: Resize via middle-right handle (enable hooks to locate it, then use real drag)
    await setCanvasTestHooksEnabled(page, true);
    const handleBox = await page.getByTestId('canvas-shape-handle-middle-right').boundingBox();
    if (!handleBox) {
      throw new Error('Expected shape handle to be visible for resize.');
    }
    await setCanvasTestHooksEnabled(page, false);
    // Drag from the handle's bounding box center in page coordinates
    const handlePageCenter = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
    await page.mouse.move(handlePageCenter.x, handlePageCenter.y);
    await page.mouse.down();
    await page.mouse.move(handlePageCenter.x + 100, handlePageCenter.y, { steps: 18 });
    await page.mouse.up();

    savedProject = await saveAndReadProject(page);
    savedText = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-text'
    );
    expect(Number(savedText?.width)).toBeGreaterThan(320);

    // ST-06: Rotate via rotater handle
    await setCanvasTestHooksEnabled(page, true);
    const rotaterBox = await page.getByTestId('canvas-shape-handle-rotater').boundingBox();
    if (!rotaterBox) {
      throw new Error('Expected rotater handle to be visible for rotation.');
    }
    await setCanvasTestHooksEnabled(page, false);
    const rotaterPageCenter = {
      x: rotaterBox.x + rotaterBox.width / 2,
      y: rotaterBox.y + rotaterBox.height / 2,
    };
    await page.mouse.move(rotaterPageCenter.x, rotaterPageCenter.y);
    await page.mouse.down();
    await page.mouse.move(rotaterPageCenter.x + 120, rotaterPageCenter.y + 80, { steps: 18 });
    await page.mouse.up();

    savedProject = await saveAndReadProject(page);
    savedText = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-text'
    );
    expect(Math.abs(Number(savedText?.rotation))).toBeGreaterThan(10);
  });

  test('ST-10 ST-11 ST-12 drags a line body and its endpoints through real canvas interactions', async ({
    page,
  }) => {
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
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([line]), 'transform-line.json');
    await setCanvasTestHooksEnabled(page, false);

    // ST-10: Select and drag the line body
    await clickCanvas(page, { x: 260, y: 540 });
    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(true);

    await dragCanvas(page, { x: 260, y: 540 }, { x: 360, y: 620 });

    let savedProject = await saveAndReadProject(page);
    let savedLine = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-line'
    );
    expect(Number(savedLine?.startX)).toBeGreaterThan(200);
    expect(Number(savedLine?.startY)).toBeGreaterThan(580);
    expect(Number(savedLine?.endX)).toBeGreaterThan(440);
    expect(Number(savedLine?.endY)).toBeGreaterThan(620);

    // ST-11: Drag start endpoint
    // The start handle should be near the saved startX/startY
    const startX = Number(savedLine?.startX);
    const startY = Number(savedLine?.startY);
    await dragCanvas(page, { x: startX, y: startY }, { x: startX - 80, y: startY + 40 });

    savedProject = await saveAndReadProject(page);
    savedLine = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-line'
    );
    expect(Number(savedLine?.startX)).toBeLessThan(startX - 40);

    // ST-12: Drag end endpoint
    const endX = Number(savedLine?.endX);
    const endY = Number(savedLine?.endY);
    await dragCanvas(page, { x: endX, y: endY }, { x: endX + 80, y: endY - 30 });

    savedProject = await saveAndReadProject(page);
    savedLine = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-line'
    );
    expect(Number(savedLine?.endX)).toBeGreaterThan(endX + 40);
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

    // ST-07: Select and drag
    await clickCanvas(page, { x: 600, y: 325 });
    await openPropertiesTab(page);
    await expect(page.getByLabel('Preserve aspect ratio')).toBeVisible();

    await dragCanvas(page, { x: 600, y: 325 }, { x: 720, y: 405 });

    // ST-08: Resize via real handle bounding box
    const resizeBox = await page.getByTestId('canvas-shape-handle-middle-right').boundingBox();
    if (!resizeBox) {
      throw new Error('Expected shape resize handle to have a bounding box.');
    }
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 120, resizeBox.y + resizeBox.height / 2, { steps: 18 });
    await page.mouse.up();

    // ST-09: Rotate via real rotater bounding box
    const rotaterBox = await page.getByTestId('canvas-shape-handle-rotater').boundingBox();
    if (!rotaterBox) {
      throw new Error('Expected rotater handle to have a bounding box.');
    }
    await page.mouse.move(rotaterBox.x + rotaterBox.width / 2, rotaterBox.y + rotaterBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rotaterBox.x + rotaterBox.width / 2 + 140, rotaterBox.y + rotaterBox.height / 2 + 80, { steps: 18 });
    await page.mouse.up();

    // Verify selection survived all transforms
    await openPropertiesTab(page);
    await expect(page.getByLabel('Preserve aspect ratio')).toBeVisible();

    const savedProject = await saveAndReadProject(page);

    const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-image',
    ) as {
      id: string;
      x: number;
      width: number;
      height: number;
      rotation: number;
      sourceTransform?: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
      };
    } | undefined;
    expect(savedImage).toEqual(expect.objectContaining({ id: 'transform-image' }));
    expect(Number(savedImage?.x)).toBeGreaterThan(620);
    expect(Number(savedImage?.width)).toBeGreaterThan(240);
    expect(Math.abs(Number(savedImage?.rotation))).toBeGreaterThan(10);
    expect(savedImage?.sourceTransform?.width).toBeCloseTo(Number(savedImage?.width), 5);
    expect(savedImage?.sourceTransform?.height).toBeCloseTo(Number(savedImage?.height), 5);
    expect(savedImage?.sourceTransform?.rotation).toBe(0);
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

  test('ST-17 keeps rotated single-item drags unsnapped near guide candidates', async ({ page }) => {
    const movable = createRectangleFixture({
      id: 'rotated-snap-movable',
      x: 200,
      y: 260,
      width: 240,
      height: 120,
      zIndex: 0,
    });
    const sibling = createRectangleFixture({
      id: 'rotated-snap-sibling',
      x: 480,
      y: 260,
      width: 240,
      height: 120,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([movable, sibling]),
      'rotated-single-drag-no-snap.json',
    );
    await clickCanvas(page, { x: 320, y: 320 });
    await expect(page.getByTestId('canvas-shape-handle-rotater')).toBeAttached();

    const rotaterBox = await page.getByTestId('canvas-shape-handle-rotater').boundingBox();
    if (!rotaterBox) {
      throw new Error('Expected the rotater handle to be visible.');
    }
    const rotaterCenter = {
      x: rotaterBox.x + rotaterBox.width / 2,
      y: rotaterBox.y + rotaterBox.height / 2,
    };
    await page.mouse.move(rotaterCenter.x, rotaterCenter.y);
    await page.mouse.down();
    await page.mouse.move(rotaterCenter.x + 150, rotaterCenter.y + 100, { steps: 18 });
    await page.mouse.up();

    const rotatedDebug = await readStageDebug(page);
    const rotatedItem = rotatedDebug.selectedItems?.[0];
    expect(Math.abs(rotatedItem?.rotation ?? 0)).toBeGreaterThan(10);
    if (!rotatedItem) {
      throw new Error('Expected rotated item debug geometry before drag.');
    }

    const dragStart = rotatePoint(
      {
        x: rotatedItem.x + rotatedItem.width / 2,
        y: rotatedItem.y + rotatedItem.height / 2,
      },
      { x: rotatedItem.x, y: rotatedItem.y },
      rotatedItem.rotation,
    );
    const deltaX = 484 - rotatedItem.x;
    await beginCanvasDrag(page, dragStart);
    await movePointerToCanvasPoint(page, { x: dragStart.x + deltaX, y: dragStart.y });
    await expect(page.getByTestId('guide-count')).toContainText('Guides: 0');
    await releasePointer(page);

    const savedProject = await saveAndReadProject(page);
    const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'rotated-snap-movable',
    );

    expect(savedItem).toEqual(expect.objectContaining({ id: 'rotated-snap-movable' }));
    expect(Math.abs(Number(savedItem?.x) - (rotatedItem.x + deltaX))).toBeLessThan(2);
    expect(Math.abs(Number(savedItem?.y) - rotatedItem.y)).toBeLessThan(2);
    expect(Math.abs(Number(savedItem?.rotation))).toBeGreaterThan(10);
  });

  test('ST-15 supports off-canvas rectangle resize directly through the unclipped scene', async ({
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

  test('VP-06 pans instead of transforming when middle-dragging a selected item body or handle', async ({
    page,
  }) => {
    const rectangle = createRectangleFixture({
      id: 'middle-pan-selected-rect',
      x: 140,
      y: 140,
      width: 200,
      height: 120,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'middle-pan-selected-rect.json');

    await clickCanvas(page, { x: 240, y: 200 });
    const initialDebug = await readStageDebug(page);
    expect(initialDebug.hasShapeHandles).toBe(true);

    await middleDragCanvas(page, { x: 240, y: 200 }, { x: 320, y: 280 });
    const afterBodyPan = await readStageDebug(page);
    expect(afterBodyPan.viewport.panX).not.toBe(initialDebug.viewport.panX);
    expect(afterBodyPan.viewport.panY).not.toBe(initialDebug.viewport.panY);
    expect(afterBodyPan.sessionKind).toBeNull();
    expect(afterBodyPan.hasShapeHandles).toBe(true);

    await middleDragCanvas(page, { x: 340, y: 200 }, { x: 420, y: 260 });
    const afterHandlePan = await readStageDebug(page);
    expect(afterHandlePan.viewport.panX).not.toBe(afterBodyPan.viewport.panX);
    expect(afterHandlePan.viewport.panY).not.toBe(afterBodyPan.viewport.panY);
    expect(afterHandlePan.sessionKind).toBeNull();
    expect(afterHandlePan.hasShapeHandles).toBe(true);

    const savedProject = await saveAndReadProject(page);
    const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'middle-pan-selected-rect',
    );
    expect(savedItem).toEqual(expect.objectContaining({ id: 'middle-pan-selected-rect' }));
    expect(Number(savedItem?.x)).toBe(140);
    expect(Number(savedItem?.y)).toBe(140);
    expect(Number(savedItem?.width)).toBe(200);
    expect(Number(savedItem?.height)).toBe(120);
  });

  test('toggles selection off when shift-clicking an already-selected item', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'shift-toggle-rect',
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'shift-toggle-rect.json');

    const bodyPoint = { x: 320, y: 180 };
    await clickCanvas(page, bodyPoint);
    expect((await readStageDebug(page)).hasShapeHandles).toBe(true);

    await page.keyboard.down('Shift');
    try {
      await clickCanvas(page, bodyPoint);
    } finally {
      await page.keyboard.up('Shift');
    }

    const debug = await readStageDebug(page);
    expect(debug.hasShapeHandles).toBe(false);
    expect(debug.selectedItems ?? []).toHaveLength(0);
    await openLayersTab(page);
    await expect(page.locator('.layer-row.active')).toHaveCount(0);

    const savedProject = await saveAndReadProject(page);
    const savedRectangle = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'shift-toggle-rect',
    );

    expect(savedRectangle).toBeDefined();
    expect(Number(savedRectangle?.x)).toBe(200);
    expect(Number(savedRectangle?.y)).toBe(120);
  });

  test('geometry: keeps rotated group resizing aligned to the rotated frame across repeated transforms', async ({ page }) => {
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

    const resizedProject = await saveAndReadProject(page);
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

    const finalProject = await saveAndReadProject(page);

    expect(JSON.stringify(finalProject.nodes)).not.toBe(JSON.stringify(resizedProject.nodes));
  });
});
