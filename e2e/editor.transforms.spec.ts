import { expect, test } from '@playwright/test';

import {
  beginGroupHandleDrag,
  clickItem,
  collectLeafNodes,
  dragEmptyCanvas,
  dragHandle,
  dragItemTo,
  createImageFixture,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  dragCanvasWithModifier,
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
  test('ST-01 ST-02 drags and resizes a rectangle through real canvas interactions', async ({ page }) => {
    const rectangle = createRectangleFixture({
      id: 'drag-resize-rect',
      x: 140,
      y: 140,
      width: 200,
      height: 120,
    });

    await openFreshEditor(page);
    await uploadProject(page, createProjectDocument([rectangle]), 'drag-resize-rect.json');
    await setCanvasTestHooksEnabled(page, false);

    await test.step('ST-01: drag', async () => {
      await clickItem(page, 'drag-resize-rect');
      await openPropertiesTab(page);
      await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

      await dragItemTo(page, 'drag-resize-rect', 420, 300);

      await openPropertiesTab(page);
      await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

      const savedProject = await saveAndReadProject(page);
      const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === 'drag-resize-rect'
      );
      expect(savedItem).toBeDefined();
      expect(Number(savedItem?.x)).toBeGreaterThan(200);
      expect(Number(savedItem?.y)).toBeGreaterThan(200);
      expect(Number(savedItem?.width)).toBe(200);
      expect(Number(savedItem?.height)).toBe(120);
    });

    await test.step('ST-02: resize', async () => {
      // Re-enable hooks to locate the handle, then use real mouse drag
      await setCanvasTestHooksEnabled(page, true);
      const handleBox = await page.getByTestId('canvas-shape-handle-middle-right').boundingBox();
      if (!handleBox) {
        throw new Error('Expected shape handle to be visible for resize.');
      }
      await setCanvasTestHooksEnabled(page, false);
      const handleCenter = {
        x: handleBox.x + handleBox.width / 2,
        y: handleBox.y + handleBox.height / 2,
      };
      await page.mouse.move(handleCenter.x, handleCenter.y);
      await page.mouse.down();
      await page.mouse.move(handleCenter.x + 120, handleCenter.y, { steps: 18 });
      await page.mouse.up();

      await openPropertiesTab(page);
      await expect(page.getByRole('heading', { name: 'Rectangle' })).toBeVisible();

      const savedProject = await saveAndReadProject(page);
      const savedItem = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === 'drag-resize-rect'
      );
      expect(savedItem).toBeDefined();
      expect(Number(savedItem?.width)).toBeGreaterThan(280);
      expect(Number(savedItem?.rotation)).toBe(0);
    });
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
    await clickItem(page, 'transform-text');
    await openPropertiesTab(page);
    await expect(page.getByLabel('Text content')).toBeVisible();

    await dragItemTo(page, 'transform-text', 410, 266);
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
    await clickItem(page, 'transform-line');
    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(true);

    await dragItemTo(page, 'transform-line', 360, 620);

    let savedProject = await saveAndReadProject(page);
    let savedLine = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-line'
    );
    expect(Number(savedLine?.startX)).toBeGreaterThan(200);
    expect(Number(savedLine?.startY)).toBeGreaterThan(580);
    expect(Number(savedLine?.endX)).toBeGreaterThan(440);
    expect(Number(savedLine?.endY)).toBeGreaterThan(620);

    // ST-11: Drag start endpoint
    const startX = Number(savedLine?.startX);
    await dragHandle(page, 'transform-line', 'line-start', -80, 40);

    savedProject = await saveAndReadProject(page);
    savedLine = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'transform-line'
    );
    expect(Number(savedLine?.startX)).toBeLessThan(startX - 40);

    // ST-12: Drag end endpoint
    const endX = Number(savedLine?.endX);
    await dragHandle(page, 'transform-line', 'line-end', 80, -30);

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
    await clickItem(page, image.id);
    await expect.poll(async () => (await readStageDebug(page)).hasShapeHandles).toBe(true);
    await openPropertiesTab(page);
    await expect(page.getByLabel('Preserve aspect ratio')).toBeVisible();

    await dragItemTo(page, image.id, 720, 405);

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

  test('ST-13a snaps a rotated item using its AABB, not its unrotated bounds', async ({ page }) => {
    // A 200x100 rect at (100,300) rotated 45° has AABB right edge ≈ 241.4.
    // Unrotated right edge would be at 300. Sibling left is at 480.
    // We drag so AABB right overshoots 480 by ~5px → AABB snap fires.
    // No unrotated edge is near any snap target, proving AABB is used.
    const movable = createRectangleFixture({
      id: 'rotated-snap',
      x: 100,
      y: 300,
      width: 200,
      height: 100,
      rotation: 45,
      zIndex: 0,
    });
    const sibling = createRectangleFixture({
      id: 'snap-target',
      x: 480,
      y: 300,
      width: 240,
      height: 120,
      fill: '#0ea5e9',
      stroke: '#0369a1ff',
      zIndex: 1,
    });

    const clickPoint = { x: 135, y: 406 };
    const dragTarget = { x: clickPoint.x + 244, y: clickPoint.y };
    const document = createProjectDocument([movable, sibling]);

    await openFreshEditor(page);
    await uploadProject(page, document, 'rotated-snap-enabled.json');
    await setCanvasTestHooksEnabled(page, false);
    await dragEmptyCanvas(page, clickPoint, dragTarget);
    const snappedProject = await saveAndReadProject(page);

    await openFreshEditor(page);
    await uploadProject(page, document, 'rotated-snap-disabled.json');
    await setCanvasTestHooksEnabled(page, false);
    await dragCanvasWithModifier(page, 'Control', clickPoint, dragTarget);
    const unsnappedProject = await saveAndReadProject(page);

    const snappedItem = collectLeafNodes(snappedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'rotated-snap',
    );
    const unsnappedItem = collectLeafNodes(unsnappedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'rotated-snap',
    );

    expect(snappedItem).toBeDefined();
    expect(unsnappedItem).toBeDefined();
    // Snap pulls item leftward to align AABB right edge with sibling left (480)
    expect(Number(snappedItem?.x)).toBeLessThan(Number(unsnappedItem?.x));
    // AABB right = item.x + 141.42 for this geometry; snapped AABB right = 480
    expect(Number(snappedItem?.x)).toBeCloseTo(339, 0);
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

    // Original test dragged from canvas (300,180) to (584,180) — a 284px
    // delta.  dragItemTo starts at the item's center (320,180); shift the
    // target by the same offset to preserve the exact cursor delta the test
    // was written against (so the snap-vs-no-snap comparison stays valid).
    await openFreshEditor(page);
    await uploadProject(page, document, 'snap-enabled.json');
    await clickItem(page, movable.id);
    await dragItemTo(page, movable.id, 604, 180);
    const snappedProject = await saveAndReadProject(page);

    await openFreshEditor(page);
    await uploadProject(page, document, 'snap-disabled.json');
    await clickItem(page, movable.id);
    await dragItemTo(page, movable.id, 604, 180, { ctrlKey: true });
    const unsnappedProject = await saveAndReadProject(page);

    const snappedItem = collectLeafNodes(snappedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'snap-movable',
    );
    const unsnappedItem = collectLeafNodes(unsnappedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'snap-movable',
    );

    expect(snappedItem).toBeDefined();
    expect(unsnappedItem).toBeDefined();
    const snappedX = Number(snappedItem?.x);
    const unsnappedX = Number(unsnappedItem?.x);
    expect(snappedX).toBeCloseTo(480, 0);
    expect(unsnappedX).toBeGreaterThan(snappedX);
    // The control-modified drag should preserve the small overshoot past the
    // sibling edge instead of collapsing to the snapped 480px alignment.
    expect(unsnappedX - snappedX).toBeGreaterThan(2);
    expect(unsnappedX - snappedX).toBeLessThan(8);
    expect(Number(snappedItem?.y)).toBe(120);
    expect(Number(unsnappedItem?.y)).toBe(120);
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

    await clickItem(page, 'off-canvas-transform-rect');
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasShapeHandles).toBe(true);

    await dragHandle(page, 'off-canvas-transform-rect', 'middle-left', -80, 0);

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

    await clickItem(page, 'middle-pan-selected-rect');
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

    await clickItem(page, rectangle.id);
    expect((await readStageDebug(page)).hasShapeHandles).toBe(true);

    await clickItem(page, rectangle.id, { shiftKey: true });

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

    await dragEmptyCanvas(page, { x: 80, y: 80 }, { x: 340, y: 220 });
    await expect(page.getByTestId('canvas-group-rotater')).toBeAttached();

    const rotatedDebug = await readStageDebug(page);
    const initialFrame = rotatedDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected an initial group frame before rotation.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await beginGroupHandleDrag(page, 'rotater');
    await movePointerToCanvasPoint(page, {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance,
      y: initialFrame.y + initialFrame.height / 2,
    });
    await releasePointer(page);

    const afterRotateDebug = await readStageDebug(page);
    expect(Math.abs(afterRotateDebug.groupFrame?.rotation ?? 0)).toBeGreaterThan(80);
    expect(Math.abs(afterRotateDebug.groupFrame?.rotation ?? 0)).toBeLessThan(100);

    const rotatedFrame = afterRotateDebug.groupFrame;
    if (!rotatedFrame) {
      throw new Error('Expected a committed group frame after rotation.');
    }
    await beginGroupHandleDrag(page, 'middle-right');
    await movePointerToCanvasPoint(page, {
      x: rotatedFrame.x + rotatedFrame.width / 2,
      y: rotatedFrame.y + rotatedFrame.width / 2 + 100,
    });
    await releasePointer(page);
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

    await beginGroupHandleDrag(page, 'rotater');
    await movePointerToCanvasPoint(page, {
      x: rotatedFrame.x + rotatedFrame.width / 2,
      y: rotatedFrame.y + rotatedFrame.height / 2 + rotaterDistance,
    });
    await releasePointer(page);
    await beginGroupHandleDrag(page, 'bottom-right');
    await movePointerToCanvasPoint(page, { x: 360, y: 380 });
    await releasePointer(page);

    const finalProject = await saveAndReadProject(page);

    expect(JSON.stringify(finalProject.nodes)).not.toBe(JSON.stringify(resizedProject.nodes));
  });
});
