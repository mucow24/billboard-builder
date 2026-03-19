import { expect, test } from '@playwright/test';

import {
  beginCanvasHookDrag,
  canvasPointToPage,
  clickCanvas,
  createLineFixture,
  createMixedShapeTextGroupFixture,
  createNestedGroupFixture,
  createProjectDocument,
  createRectangleFixture,
  createSimpleGroupFixture,
  createTextFixture,
  dragCanvas,
  movePointerToCanvasPoint,
  openFreshEditor,
  readStageDebug,
  releasePointer,
  setCanvasTestHooksEnabled,
  uploadProject,
} from './support/editor';

test.describe('editor visual regression', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Visual snapshots run only on Chromium.');

  test('captures the default canvas shell', async ({ page }) => {
    await openFreshEditor(page);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('default-canvas-shell.png');
  });

  test('captures marquee preview rendering', async ({ page }) => {
    await openFreshEditor(page);

    const start = await canvasPointToPage(page, { x: 120, y: 120 });
    const end = await canvasPointToPage(page, { x: 360, y: 300 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 16 });

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('marquee-preview.png');
    await page.mouse.up();
  });

  test('captures single-item selection handles', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'visual-rect',
          x: 180,
          y: 180,
          width: 240,
          height: 160,
        }),
      ]),
      'visual-rect.json'
    );

    await clickCanvas(page, { x: 300, y: 260 });
    await expect(page.getByTestId('canvas-shape-handle-middle-right')).toBeAttached();

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-selection-handles.png');
  });

  test('captures a rectangle snapped flush to the right canvas edge without checkerboard bleed', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'edge-flush-rect',
          x: 784,
          y: 240,
          width: 240,
          height: 180,
          fill: '#f97316',
          stroke: '#ea580cff',
        }),
      ]),
      'edge-flush-rect.json'
    );

    await clickCanvas(page, { x: 904, y: 330 });
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('right-edge-snap-shell.png');
  });

  test('captures live single-item drag, resize, and rotate previews', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'single-live',
          x: 180,
          y: 180,
          width: 220,
          height: 140,
        }),
      ]),
      'single-live.json'
    );

    await clickCanvas(page, { x: 300, y: 260 });

    await beginCanvasHookDrag(page, 'canvas-selected-item-overlay');
    await movePointerToCanvasPoint(page, { x: 410, y: 360 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('drag');
    await expect
      .poll(async () => (await readStageDebug(page)).previewItem?.x ?? 0)
      .toBeGreaterThan(180);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-drag-preview.png');
    await releasePointer(page);

    await beginCanvasHookDrag(page, 'canvas-shape-handle-middle-right');
    await movePointerToCanvasPoint(page, { x: 560, y: 320 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('resize');
    await expect
      .poll(async () => (await readStageDebug(page)).previewItem?.width ?? 0)
      .toBeGreaterThan(220);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-resize-preview.png');
    await releasePointer(page);

    await beginCanvasHookDrag(page, 'canvas-shape-handle-rotater');
    await movePointerToCanvasPoint(page, { x: 560, y: 470 });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('rotate');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).previewItem?.rotation ?? 0))
      .toBeGreaterThan(15);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-rotate-preview.png');
    await releasePointer(page);
  });

  test('captures rotated multi-selection overlay rendering', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'first',
          x: 120,
          y: 140,
          width: 120,
          height: 64,
          zIndex: 0,
        }),
        createRectangleFixture({
          id: 'second',
          x: 320,
          y: 180,
          width: 110,
          height: 58,
          fill: '#0ea5e9',
          stroke: '#0369a1ff',
          zIndex: 1,
        }),
      ]),
      'visual-group.json'
    );

    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    const initialDebug = await readStageDebug(page);
    const initialFrame = initialDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected a group frame before previewing rotated overlays.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await beginCanvasHookDrag(page, 'canvas-group-rotater');
    await movePointerToCanvasPoint(page, {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance,
      y: initialFrame.y + initialFrame.height / 2,
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-rotate');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-overlay.png');
    await releasePointer(page);
  });

  test('UI-01 captures a true top-level group selection state', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'visual-true-group.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 210, y: 200 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(0);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('true-group-selected.png');
  });

  test('UI-02 captures a drilled-in grouped child selection state', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createSimpleGroupFixture(), 'visual-drilled-child.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 210, y: 200 });
    await clickCanvas(page, { x: 210, y: 200 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('group-child-selected.png');
  });

  test('UI-04 captures a nested drilled-in child selection state with ancestor outline', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createNestedGroupFixture(), 'visual-nested-child.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 400, y: 210 });
    await clickCanvas(page, { x: 400, y: 210 });
    await clickCanvas(page, { x: 400, y: 210 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('nested-group-child-selected.png');
  });

  test('UI-02 captures grouped text drill-in affordances without group handles', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, createMixedShapeTextGroupFixture(), 'visual-grouped-text.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 320, y: 245 });
    await clickCanvas(page, { x: 320, y: 245 });

    const stageDebug = await readStageDebug(page);
    expect(stageDebug.hasGroupOverlay).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    expect(stageDebug.subgroupOutlineFrames ?? []).toHaveLength(1);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('grouped-text-child-selected.png');
  });

  test('UI-06 UI-07 captures line and text single-selection affordances distinctly', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createLineFixture({
          id: 'visual-line',
          x: 180,
          y: 220,
          startX: 180,
          startY: 220,
          endX: 420,
          endY: 280,
          width: 240,
          height: 60,
          zIndex: 0,
        }),
        createTextFixture({
          id: 'visual-text',
          x: 180,
          y: 420,
          width: 260,
          height: 96,
          text: 'Visual text item',
          zIndex: 1,
        }),
      ]),
      'visual-line-text.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 300, y: 250 });
    let stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(true);
    expect(stageDebug.hasShapeHandles).toBe(false);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-line-selection.png');

    await clickCanvas(page, { x: 300, y: 465 });
    stageDebug = await readStageDebug(page);
    expect(stageDebug.hasLineHandles).toBe(false);
    expect(stageDebug.hasShapeHandles).toBe(true);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('single-text-selection.png');
  });

  test('captures live rotated-group rotate previews at an arbitrary angle', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'first',
          x: 120,
          y: 140,
          width: 120,
          height: 64,
          zIndex: 0,
        }),
        createRectangleFixture({
          id: 'second',
          x: 320,
          y: 180,
          width: 110,
          height: 58,
          fill: '#0ea5e9',
          stroke: '#0369a1ff',
          zIndex: 1,
        }),
      ]),
      'rotated-group-rotate-preview.json'
    );

    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    const initialDebug = await readStageDebug(page);
    const initialFrame = initialDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected a group frame before previewing rotated overlays.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await beginCanvasHookDrag(page, 'canvas-group-rotater');
    await movePointerToCanvasPoint(page, {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance * Math.sin((33 * Math.PI) / 180),
      y: initialFrame.y + initialFrame.height / 2 - rotaterDistance * Math.cos((33 * Math.PI) / 180),
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-rotate');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(25);

    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-rotate-preview.png');
    await releasePointer(page);
  });

  test('captures live rotated-group drag and resize previews', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'first',
          x: 120,
          y: 140,
          width: 120,
          height: 64,
          zIndex: 0,
        }),
        createRectangleFixture({
          id: 'second',
          x: 320,
          y: 180,
          width: 110,
          height: 58,
          fill: '#0ea5e9',
          stroke: '#0369a1ff',
          zIndex: 1,
        }),
      ]),
      'rotated-group-live.json'
    );

    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    const initialDebug = await readStageDebug(page);
    const initialFrame = initialDebug.groupFrame;
    if (!initialFrame) {
      throw new Error('Expected a group frame before rotating the live preview group.');
    }
    const rotaterDistance = initialFrame.height / 2 + 50;

    await beginCanvasHookDrag(page, 'canvas-group-rotater');
    await movePointerToCanvasPoint(page, {
      x: initialFrame.x + initialFrame.width / 2 + rotaterDistance,
      y: initialFrame.y + initialFrame.height / 2,
    });
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);
    await releasePointer(page);

    const rotatedDebug = await readStageDebug(page);
    const rotatedFrame = rotatedDebug.groupFrame;
    if (!rotatedFrame) {
      throw new Error('Expected a committed rotated group frame before drag preview.');
    }

    await beginCanvasHookDrag(page, 'canvas-group-overlay');
    await movePointerToCanvasPoint(page, {
      x: rotatedFrame.x + rotatedFrame.width / 2,
      y: rotatedFrame.y + rotatedFrame.height / 2 + 120,
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-drag');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);
    await expect
      .poll(async () => (await readStageDebug(page)).groupFrame?.y ?? 0)
      .toBeGreaterThan(rotatedFrame.y + 5);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-drag-preview.png');
    await releasePointer(page);

    const draggedDebug = await readStageDebug(page);
    const draggedFrame = draggedDebug.groupFrame;
    if (!draggedFrame) {
      throw new Error('Expected a committed dragged group frame before resize preview.');
    }

    await beginCanvasHookDrag(page, 'canvas-group-handle-middle-right');
    await movePointerToCanvasPoint(page, {
      x: draggedFrame.x + draggedFrame.width / 2,
      y: draggedFrame.y + draggedFrame.width / 2 + 120,
    });
    await expect
      .poll(async () => (await readStageDebug(page)).sessionKind)
      .toBe('group-resize');
    await expect
      .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
      .toBeGreaterThan(80);
    await expect
      .poll(async () => (await readStageDebug(page)).groupFrame?.width ?? 0)
      .toBeGreaterThan(draggedFrame.width + 40);
    await expect(page.getByTestId('canvas-stage-root')).toHaveScreenshot('rotated-group-resize-preview.png');
    await releasePointer(page);
  });
});
