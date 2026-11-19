import { expect, test, type Page } from '@playwright/test';

import {
  beginCanvasDrag,
  clickEmptyCanvas,
  clickItem,
  createGroupedProjectDocument,
  createGroupNodeFixture,
  createImageFixture,
  createRectangleFixture,
  doubleClickCanvas,
  doubleClickItem,
  dragEmptyCanvas,
  dragCanvasWithModifier,
  movePointerToCanvasPoint,
  openFreshEditor,
  openLayersTab,
  openPropertiesTab,
  readStageDebug,
  releasePointer,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
  uploadProject,
  collectLeafNodes,
} from './support/editor';

async function expectActiveLayerId(page: Page, nodeId: string) {
  const rowSelect = page.getByTestId(`layers-row-${nodeId}`);
  await expect(rowSelect).toBeVisible();
  await expect(rowSelect).toHaveClass(/active/);
}

async function expectCropMode(page: Page) {
  await expect
    .poll(async () => (await readStageDebug(page)).cropSession ?? null)
    .not.toBeNull();
  const stageDebug = await readStageDebug(page);
  expect(stageDebug.sessionKind).toBe('image-crop');
  expect(stageDebug.hasShapeHandles).toBe(false);
  expect(stageDebug.hasLineHandles).toBe(false);
  return stageDebug.cropSession!;
}

async function expectCropModeClosed(page: Page) {
  await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();
}

// The middle of an item's box on the canvas; the box turns about its top-left.
function centerOf(box: { x: number; y: number; width: number; height: number; rotation?: number }) {
  const angle = ((box.rotation ?? 0) * Math.PI) / 180;
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  return {
    x: box.x + halfWidth * Math.cos(angle) - halfHeight * Math.sin(angle),
    y: box.y + halfWidth * Math.sin(angle) + halfHeight * Math.cos(angle),
  };
}

type SavedImageNode = Record<string, unknown> & {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  sourceTransform: { x: number; y: number; width: number; height: number; rotation: number };
};

async function readSavedLeaf(page: Page, id: string): Promise<SavedImageNode> {
  const savedProject = await saveAndReadProject(page);
  const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
    (item) => item.id === id,
  );
  if (!savedImage) {
    throw new Error(`Expected ${id} in the saved project.`);
  }
  return savedImage as SavedImageNode;
}

const FULL_IMAGE_CROP = { x: 0, y: 0, width: 160, height: 90 };

test.describe('editor image crop', () => {
  test('keeps crop affordance hook sizing stable while zoom changes', async ({ page }) => {
    const image = createImageFixture({
      id: 'crop-zoom-stable-image',
      name: 'Crop Zoom Stable Image',
      x: 520,
      y: 320,
      width: 160,
      height: 90,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'crop-zoom-stable.json');
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-zoom-stable-image');
    await expect.poll(async () => (await readStageDebug(page)).cropSession !== null).toBe(true);
    await setCanvasTestHooksEnabled(page, true);

    const cropHandleBefore = await page.getByTestId('canvas-crop-handle-middle-right').boundingBox();
    const rotaterBefore = await page.getByTestId('canvas-crop-full-rotater').boundingBox();
    const fullOverlayBefore = await page.getByTestId('canvas-crop-pan-overlay').boundingBox();
    if (!cropHandleBefore || !rotaterBefore || !fullOverlayBefore) {
      throw new Error('Expected crop hooks before zoom change.');
    }

    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Set zoom to 100%"]');
      button?.click();
    });
    await expect(page.getByTestId('viewport-zoom')).toContainText('Zoom: 100%');

    const cropHandleAfter = await page.getByTestId('canvas-crop-handle-middle-right').boundingBox();
    const rotaterAfter = await page.getByTestId('canvas-crop-full-rotater').boundingBox();
    const fullOverlayAfter = await page.getByTestId('canvas-crop-pan-overlay').boundingBox();
    if (!cropHandleAfter || !rotaterAfter || !fullOverlayAfter) {
      throw new Error('Expected crop hooks after zoom change.');
    }

    expect(cropHandleAfter.width).toBeCloseTo(cropHandleBefore.width, 1);
    expect(cropHandleAfter.height).toBeCloseTo(cropHandleBefore.height, 1);
    expect(
      fullOverlayAfter.y - (rotaterAfter.y + rotaterAfter.height / 2),
    ).toBeCloseTo(
      fullOverlayBefore.y - (rotaterBefore.y + rotaterBefore.height / 2),
      1,
    );
  });

  test('double-clicking an unselected image enters crop mode in one browser gesture', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'one-gesture-image',
      name: 'One Gesture Image',
      x: 520,
      y: 320,
      zIndex: 0,
    });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'crop-one-gesture.json');
    await setCanvasTestHooksEnabled(page, false);

    await openLayersTab(page);
    await expect(page.locator('.layer-row.active')).toHaveCount(0);

    await doubleClickItem(page, 'one-gesture-image');

    const cropSession = await expectCropMode(page);
    expect(cropSession.previewItem.width).toBeGreaterThan(0);
    await openLayersTab(page);
    await expectActiveLayerId(page, 'one-gesture-image');
  });

  test('grouped image double-click drills in before a selected-image double-click enters crop mode', async ({
    page,
  }) => {
    const groupedImage = createImageFixture({
      id: 'grouped-image',
      name: 'Grouped Image',
      x: 520,
      y: 320,
      zIndex: 0,
    });
    const groupedDocument = createGroupedProjectDocument([
      createGroupNodeFixture([groupedImage], {
        id: 'image-group',
        name: 'Image Group',
      }),
    ]);

    await openFreshEditor(page);
    await uploadProject(page, groupedDocument, 'grouped-image-crop.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickItem(page, 'grouped-image');
    await openLayersTab(page);
    await expectActiveLayerId(page, 'image-group');

    await doubleClickItem(page, 'grouped-image');

    await openLayersTab(page);
    await expectActiveLayerId(page, 'grouped-image');
    expect((await readStageDebug(page)).sessionKind ?? null).not.toBe('image-crop');
    expect((await readStageDebug(page)).cropSession ?? null).toBeNull();

    await doubleClickItem(page, 'grouped-image');

    const cropSession = await expectCropMode(page);
    expect(cropSession.previewItem.width).toBeGreaterThan(0);
    await openLayersTab(page);
    await expectActiveLayerId(page, 'grouped-image');
  });

  test('resizes crop bounds, pans, commits on blank click, and commits by switching to another item', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'crop-image',
      name: 'Crop Image',
      x: 520,
      y: 320,
      width: 160,
      height: 90,
      crop: {
        x: 20,
        y: 10,
        width: 100,
        height: 60,
      },
      zIndex: 0,
    });
    const rectangle = createRectangleFixture({
      id: 'crop-switch-rect',
      name: 'Target Rectangle',
      x: 180,
      y: 180,
      width: 180,
      height: 120,
      zIndex: 1,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([image, rectangle]),
      'crop-resize-pan-commit.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await test.step('resize crop bounds, pan image, commit on blank click', async () => {
      await doubleClickItem(page, 'crop-image');

      let cropSession = await expectCropMode(page);
      expect(cropSession.crop.width).toBe(100);
      const startHandle = cropSession.cropHandlePoints?.['middle-right'];
      if (!startHandle) {
        throw new Error('Expected a crop right handle.');
      }
      await dragEmptyCanvas(page, startHandle, { x: startHandle.x + 24, y: startHandle.y });

      cropSession = await expectCropMode(page);
      expect(cropSession.crop.width).toBeGreaterThan(100);

      const cropCenter = {
        x: cropSession.previewItem.x + cropSession.previewItem.width / 2,
        y: cropSession.previewItem.y + cropSession.previewItem.height / 2,
      };
      await dragEmptyCanvas(page, cropCenter, { x: cropCenter.x + 18, y: cropCenter.y + 10 });

      cropSession = await expectCropMode(page);
      expect(cropSession.crop.x).toBeLessThan(20);

      await clickEmptyCanvas(page, { x: 120, y: 120 });
      await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();
      expect((await readStageDebug(page)).sessionKind ?? null).not.toBe('image-crop');

      const savedProject = await saveAndReadProject(page);
      const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === 'crop-image',
      );
      expect(savedImage).toMatchObject({
        id: 'crop-image',
        crop: expect.objectContaining({
          width: expect.any(Number),
        }),
      });
      expect(Number((savedImage as { crop: { width: number } }).crop.width)).toBeGreaterThan(100);
    });

    await test.step('commits crop and switches selection to another item', async () => {
      await doubleClickItem(page, 'crop-image');

      const cropSession = await expectCropMode(page);
      const handle = cropSession.cropHandlePoints?.['middle-right'];
      if (!handle) {
        throw new Error('Expected a crop right handle.');
      }
      await dragEmptyCanvas(page, handle, { x: handle.x + 24, y: handle.y });

      await clickItem(page, 'crop-switch-rect');
      await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();

      await openLayersTab(page);
      await expectActiveLayerId(page, 'crop-switch-rect');

      const savedProject = await saveAndReadProject(page);
      const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === 'crop-image',
      );
      expect(Number((savedImage as { crop: { width: number } }).crop.width)).toBeGreaterThan(100);
    });
  });

  test('double-click exits crop, and crop boundaries snap to guides with ctrl-drag disabling snapping', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'crop-exit-snap-image',
      name: 'Crop Exit Snap Image',
      x: 520,
      y: 320,
      crop: {
        x: 20,
        y: 10,
        width: 100,
        height: 60,
      },
      zIndex: 0,
    });
    const rectangle = createRectangleFixture({
      id: 'crop-snap-rect',
      name: 'Crop Snap Rect',
      x: 700,
      y: 220,
      width: 100,
      height: 180,
      zIndex: 1,
    });
    const project = createGroupedProjectDocument([image, rectangle]);

    await openFreshEditor(page);
    await uploadProject(page, project, 'crop-exit-snap.json');
    await setCanvasTestHooksEnabled(page, false);

    await test.step('double-clicking inside the crop exits crop mode and commits', async () => {
      await doubleClickItem(page, 'crop-exit-snap-image');

      let cropSession = await expectCropMode(page);
      const handle = cropSession.cropHandlePoints?.['middle-right'];
      if (!handle) {
        throw new Error('Expected a crop right handle.');
      }
      await dragEmptyCanvas(page, handle, { x: handle.x + 24, y: handle.y });

      cropSession = await expectCropMode(page);
      const insideCropPoint = {
        x: cropSession.previewItem.x + cropSession.previewItem.width / 2,
        y: cropSession.previewItem.y + cropSession.previewItem.height / 2,
      };
      await doubleClickCanvas(page, insideCropPoint);
      await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();
      await openLayersTab(page);
      await expectActiveLayerId(page, 'crop-exit-snap-image');

      const savedProject = await saveAndReadProject(page);
      const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === 'crop-exit-snap-image',
      );
      expect(Number((savedImage as { crop: { width: number } }).crop.width)).toBeGreaterThan(100);
    });

    await test.step('crop boundaries snap to guides', async () => {
      // Re-upload fresh project to reset crop state
      await uploadProject(page, project, 'crop-snap.json');
      await setCanvasTestHooksEnabled(page, false);

      await doubleClickItem(page, 'crop-exit-snap-image');

      const cropSession = await expectCropMode(page);
      const handle = cropSession.cropHandlePoints?.['middle-right'];
      if (!handle) {
        throw new Error('Expected a crop right handle.');
      }

      await beginCanvasDrag(page, { x: handle.x - 5, y: handle.y });
      await movePointerToCanvasPoint(page, { x: 691, y: handle.y });
      await expect(page.getByTestId('guide-count')).not.toHaveText('0');
      await releasePointer(page);

      await clickEmptyCanvas(page, { x: 120, y: 120 });
      const savedProject = await saveAndReadProject(page);
      const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === 'crop-exit-snap-image',
      ) as { crop: { width: number } } | undefined;
      expect(savedImage).toBeDefined();
      const snappedWidth = Number(savedImage?.crop.width);

      // Re-upload and test ctrl-drag disables snapping
      await uploadProject(page, project, 'crop-snap-ctrl.json');
      await setCanvasTestHooksEnabled(page, false);

      await doubleClickItem(page, 'crop-exit-snap-image');

      const ctrlCrop = await expectCropMode(page);
      const ctrlHandle = ctrlCrop.cropHandlePoints?.['middle-right'];
      if (!ctrlHandle) {
        throw new Error('Expected a crop right handle for ctrl test.');
      }

      await dragCanvasWithModifier(
        page,
        'Control',
        { x: ctrlHandle.x - 5, y: ctrlHandle.y },
        { x: 691, y: ctrlHandle.y },
      );
      await expect(page.getByTestId('guide-count')).toHaveText('0');

      await clickEmptyCanvas(page, { x: 120, y: 120 });
      const ctrlProject = await saveAndReadProject(page);
      const ctrlImage = collectLeafNodes(ctrlProject.nodes as Array<Record<string, unknown>>).find(
        (item) => item.id === 'crop-exit-snap-image',
      ) as { crop: { width: number } } | undefined;
      expect(ctrlImage).toBeDefined();
      const unsnappedWidth = Number(ctrlImage?.crop.width);
      expect(snappedWidth).toBeGreaterThan(unsnappedWidth);
      expect(snappedWidth - unsnappedWidth).toBeGreaterThan(2);
    });
  });

  test('dragging the whole picture in crop mode snaps to guides, and ctrl-drag disables snapping', async ({
    page,
  }) => {
    // The picture is shown at 4x so that, at the fitted zoom, the middle of
    // the crop frame is clear of the crop handles. Crop frame at (300,320)
    // 400x240; the whole picture at (220,280) 640x360, so its right edge
    // (x=860) starts 40 short of the rectangle's left edge.
    const image = createImageFixture({
      id: 'crop-pan-snap-image',
      name: 'Crop Pan Snap Image',
      x: 300,
      y: 320,
      width: 400,
      height: 240,
      crop: {
        x: 20,
        y: 10,
        width: 100,
        height: 60,
      },
      zIndex: 0,
    });
    const rectangle = createRectangleFixture({
      id: 'crop-pan-snap-rect',
      name: 'Crop Pan Snap Rect',
      x: 900,
      y: 100,
      width: 100,
      height: 100,
      zIndex: 1,
    });
    const project = createGroupedProjectDocument([image, rectangle]);
    const cropCenter = { x: 500, y: 440 };
    const dragEnd = { x: cropCenter.x + 30, y: cropCenter.y };

    await openFreshEditor(page);
    await uploadProject(page, project, 'crop-pan-snap.json');
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-pan-snap-image');
    let cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.x).toBeCloseTo(220, 1);
    expect(cropSession.fullImageItem.width).toBeCloseTo(640, 1);

    await beginCanvasDrag(page, cropCenter);
    await movePointerToCanvasPoint(page, dragEnd);
    await expect(page.getByTestId('guide-count')).not.toHaveText('0');
    await releasePointer(page);
    await expect(page.getByTestId('guide-count')).toHaveText('0');

    // 30 px of pointer travel, then the snap carries the picture's right
    // edge the rest of the way onto the rectangle's left edge. The crop
    // frame stays where it was.
    cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.x + cropSession.fullImageItem.width).toBeCloseTo(900, 5);
    expect(cropSession.previewItem.x).toBe(300);
    expect(cropSession.previewItem.width).toBe(400);

    // Leave crop mode and re-upload the project to reset it, then repeat
    // with Ctrl held.
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();
    await uploadProject(page, project, 'crop-pan-snap-ctrl.json');
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-pan-snap-image');
    cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.x).toBeCloseTo(220, 1);
    await dragCanvasWithModifier(page, 'Control', cropCenter, dragEnd);
    await expect(page.getByTestId('guide-count')).toHaveText('0');

    cropSession = await expectCropMode(page);
    const unsnappedRight = cropSession.fullImageItem.x + cropSession.fullImageItem.width;
    expect(unsnappedRight).toBeGreaterThan(884);
    expect(unsnappedRight).toBeLessThan(896);
  });

  test('supports full-image resize and rotate inside crop mode, and Escape cancels the session', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'crop-transform-image',
      name: 'Transform Image',
      x: 520,
      y: 320,
      crop: {
        x: 20,
        y: 10,
        width: 100,
        height: 60,
      },
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([image]),
      'crop-transform-cancel.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-transform-image');

    let cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.rotation).toBe(0);
    const fullResizeHandle = cropSession.fullImageHandlePoints?.['middle-right'];
    if (!fullResizeHandle) {
      throw new Error('Expected a full-image resize handle.');
    }
    await dragEmptyCanvas(page, fullResizeHandle, { x: fullResizeHandle.x + 40, y: fullResizeHandle.y });

    cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.width).toBeGreaterThan(160);

    const fullRotater = cropSession.fullImageHandlePoints?.rotater;
    if (!fullRotater) {
      throw new Error('Expected a full-image rotater.');
    }
    await dragEmptyCanvas(page, fullRotater, {
      x: cropSession.fullImageItem.x + cropSession.fullImageItem.width + 40,
      y: cropSession.fullImageItem.y + cropSession.fullImageItem.height / 2,
    });

    cropSession = await expectCropMode(page);
    expect(Math.abs(cropSession.fullImageItem.rotation)).toBeGreaterThan(10);

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();

    const savedProject = await saveAndReadProject(page);
    const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'crop-transform-image',
    );
    expect(savedImage).toMatchObject({
      id: 'crop-transform-image',
      rotation: 0,
      crop: {
        x: 20,
        y: 10,
        width: 100,
        height: 60,
      },
    });
  });

  test('Escape in an inspector field stays with the field and keeps crop mode active', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'crop-escape-field-image',
      name: 'Escape Field Image',
      x: 520,
      y: 320,
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([image]),
      'crop-escape-field.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-escape-field-image');
    await expectCropMode(page);

    await openPropertiesTab(page);
    const opacityInput = page.getByRole('spinbutton', { name: 'Opacity value' });
    await opacityInput.click();
    await expect(opacityInput).toBeFocused();
    await expectCropMode(page);

    await opacityInput.press('Escape');
    // Give a stray cancel a frame to land before checking it didn't.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expectCropMode(page);

    // With focus off the field, Escape cancels the crop as before.
    await opacityInput.blur();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();
  });

  test('keeps the crop frame fixed while crop-mode rotation commits a source-only transform', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'crop-source-rotate-image',
      name: 'Source Rotate Image',
      x: 520,
      y: 320,
      crop: {
        x: 20,
        y: 10,
        width: 100,
        height: 60,
      },
      sourceTransform: {
        x: -32,
        y: -15,
        width: 256,
        height: 135,
        rotation: 0,
      },
    });

    await openFreshEditor(page);
    await uploadProject(
      page,
      createGroupedProjectDocument([image]),
      'crop-source-rotate.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-source-rotate-image');

    let cropSession = await expectCropMode(page);
    const initialTopLeft = cropSession.cropHandleViewportPoints?.['top-left'];
    const initialBottomRight = cropSession.cropHandleViewportPoints?.['bottom-right'];
    const fullRotater = cropSession.fullImageHandlePoints?.rotater;
    if (!initialTopLeft || !initialBottomRight || !fullRotater) {
      throw new Error('Expected crop and full-image handles.');
    }

    await dragEmptyCanvas(page, fullRotater, {
      x: cropSession.fullImageItem.x + cropSession.fullImageItem.width + 40,
      y: cropSession.fullImageItem.y + cropSession.fullImageItem.height / 2,
    });

    cropSession = await expectCropMode(page);
    expect(Math.abs(cropSession.fullImageItem.rotation)).toBeGreaterThan(10);
    expect(cropSession.previewItem.rotation).toBe(0);
    expect(cropSession.cropHandleViewportPoints?.['top-left']?.x).toBeCloseTo(initialTopLeft.x, 1);
    expect(cropSession.cropHandleViewportPoints?.['top-left']?.y).toBeCloseTo(initialTopLeft.y, 1);
    expect(cropSession.cropHandleViewportPoints?.['bottom-right']?.x).toBeCloseTo(initialBottomRight.x, 1);
    expect(cropSession.cropHandleViewportPoints?.['bottom-right']?.y).toBeCloseTo(initialBottomRight.y, 1);

    await doubleClickCanvas(page, {
      x: cropSession.previewItem.x + cropSession.previewItem.width / 2,
      y: cropSession.previewItem.y + cropSession.previewItem.height / 2,
    });
    await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();

    const savedProject = await saveAndReadProject(page);
    const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'crop-source-rotate-image',
    ) as {
      rotation: number;
      sourceTransform?: { rotation: number };
    } | undefined;
    expect(savedImage).toBeDefined();
    expect(savedImage?.rotation).toBe(0);
    expect(Math.abs(savedImage?.sourceTransform?.rotation ?? 0)).toBeGreaterThan(10);

    await openFreshEditor(page);
    await uploadProject(page, savedProject as Record<string, unknown>, 'crop-source-rotate-reload.json');
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-source-rotate-image');

    cropSession = await expectCropMode(page);
    expect(Math.abs(cropSession.fullImageItem.rotation)).toBeGreaterThan(10);
    expect(cropSession.cropHandleViewportPoints?.['top-left']?.x).toBeCloseTo(initialTopLeft.x, 1);
    expect(cropSession.cropHandleViewportPoints?.['top-left']?.y).toBeCloseTo(initialTopLeft.y, 1);
  });

  // The Reset crop tests use boxes of 320 x 360 and up: at the fitted zoom,
  // about 28%, a smaller box's handles cover its middle, so a drag there
  // would crop instead of pan.
  test('IC-17 Reset crop undoes a crop-mode pan and zoom, keeps the box, and is one undo step', async ({
    page,
  }) => {
    // Placed, then moved, scaled up 4x and rotated on the canvas, but not
    // cropped: the whole 160 x 90 image fills its 640 x 360 box.
    const image = createImageFixture({
      id: 'reset-crop-image',
      name: 'Reset Crop Image',
      x: 150,
      y: 200,
      width: 640,
      height: 360,
      rotation: 12,
    });
    const box = { x: 150, y: 200, width: 640, height: 360, rotation: 12, scaleX: 1, scaleY: 1 };

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'crop-reset.json');
    await setCanvasTestHooksEnabled(page, false);
    const readSavedImage = () => readSavedLeaf(page, 'reset-crop-image');

    await doubleClickItem(page, 'reset-crop-image');
    let cropSession = await expectCropMode(page);
    await openPropertiesTab(page);
    const resetCrop = page.getByRole('button', { name: 'Reset crop' });
    await expect(resetCrop).toBeDisabled();

    // Inside crop mode, pan the image, then scale it up past its box, then
    // commit with a double-click, which keeps the image selected. (Panning
    // down-right first moves the image's bottom-right handle out of the box
    // and off the box's own corner handle, which would otherwise win.)
    const cropCenter = centerOf(cropSession.previewItem);
    await dragEmptyCanvas(page, cropCenter, { x: cropCenter.x + 200, y: cropCenter.y + 120 });
    cropSession = await expectCropMode(page);
    const fullResizeHandle = cropSession.fullImageHandlePoints?.['bottom-right'];
    if (!fullResizeHandle) {
      throw new Error('Expected a full-image resize handle.');
    }
    await dragEmptyCanvas(page, fullResizeHandle, {
      x: fullResizeHandle.x + 120,
      y: fullResizeHandle.y + 80,
    });
    cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.width).toBeGreaterThan(700);
    await doubleClickCanvas(page, cropCenter);
    await expectCropModeClosed(page);
    await expect(resetCrop).toBeEnabled();
    const cropped = await readSavedImage();
    expect(cropped).toMatchObject(box);
    expect(cropped.sourceTransform.width).toBeGreaterThan(700);

    // The box stays exactly where and as it is; the whole image fills it again.
    await resetCrop.click();
    await expect(resetCrop).toBeDisabled();
    expect(await readSavedImage()).toMatchObject({
      ...box,
      crop: FULL_IMAGE_CROP,
      sourceTransform: { x: 0, y: 0, width: 640, height: 360, rotation: 0 },
    });

    // One undo brings the crop back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(resetCrop).toBeEnabled();
    expect(await readSavedImage()).toMatchObject({
      ...box,
      sourceTransform: cropped.sourceTransform,
    });
  });

  test('IC-16 Reset crop after cutting with a crop handle grows the box back without stretching the image', async ({
    page,
  }) => {
    // The whole 160 x 90 image fills its 640 x 360 box: not cropped.
    const image = createImageFixture({
      id: 'reset-crop-edge-image',
      name: 'Reset Crop Edge Image',
      x: 150,
      y: 200,
      width: 640,
      height: 360,
    });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'crop-reset-edge.json');
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'reset-crop-edge-image');
    let cropSession = await expectCropMode(page);
    await openPropertiesTab(page);
    const resetCrop = page.getByRole('button', { name: 'Reset crop' });
    await expect(resetCrop).toBeDisabled();

    // Cut about half off the right with the black crop handle, then commit
    // with a double-click, which keeps the image selected.
    const rightHandle = cropSession.cropHandlePoints?.['middle-right'];
    if (!rightHandle) {
      throw new Error('Expected a crop right handle.');
    }
    await dragEmptyCanvas(page, rightHandle, { x: rightHandle.x - 320, y: rightHandle.y });
    cropSession = await expectCropMode(page);
    expect(cropSession.previewItem.width).toBeLessThan(400);
    await doubleClickCanvas(page, centerOf(cropSession.previewItem));
    await expectCropModeClosed(page);
    await expect(resetCrop).toBeEnabled();
    expect((await readSavedLeaf(page, 'reset-crop-edge-image')).width).toBeLessThan(400);

    await resetCrop.click();
    await expect(resetCrop).toBeDisabled();
    const reset = await readSavedLeaf(page, 'reset-crop-edge-image');
    // The whole image at its own 16:9 proportions, and the box grown back.
    expect(reset).toMatchObject({
      x: 150,
      y: 200,
      rotation: 0,
      crop: FULL_IMAGE_CROP,
      sourceTransform: { x: 0, y: 0, rotation: 0 },
    });
    expect(reset.width).toBeCloseTo(640, 6);
    expect(reset.height).toBeCloseTo(360, 6);
    expect(reset.sourceTransform.width).toBeCloseTo(640, 6);
    expect(reset.sourceTransform.height).toBeCloseTo(360, 6);
  });

  test('IC-18 Reset crop in crop mode resets the open crop, and committing keeps the reset', async ({
    page,
  }) => {
    // Cut to its left half: a 320 x 360 box showing half of the image, drawn
    // 640 x 360.
    const image = createImageFixture({
      id: 'reset-crop-open-image',
      name: 'Reset Crop Open Image',
      x: 150,
      y: 200,
      width: 320,
      height: 360,
      crop: { x: 0, y: 0, width: 80, height: 90 },
    });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'crop-reset-open.json');
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'reset-crop-open-image');
    await expectCropMode(page);
    await openPropertiesTab(page);
    const resetCrop = page.getByRole('button', { name: 'Reset crop' });
    await expect(resetCrop).toBeEnabled();

    await resetCrop.click();
    await expect(resetCrop).toBeDisabled();
    // Crop mode stays open, now framing the whole image.
    await expect
      .poll(async () => (await readStageDebug(page)).cropSession?.previewItem.width ?? 0)
      .toBeGreaterThan(600);
    let cropSession = await expectCropMode(page);
    expect(cropSession.previewItem).toMatchObject({ x: 150, y: 200, rotation: 0 });
    expect(cropSession.previewItem.width).toBeCloseTo(640, 6);
    expect(cropSession.previewItem.height).toBeCloseTo(360, 6);
    expect(cropSession.fullImageItem.x).toBeCloseTo(150, 6);
    expect(cropSession.fullImageItem.width).toBeCloseTo(640, 6);

    // A crop-mode edit after the reset builds on it, and the commit keeps it.
    const center = centerOf(cropSession.previewItem);
    await dragEmptyCanvas(page, center, { x: center.x + 40, y: center.y + 20 });
    cropSession = await expectCropMode(page);
    await doubleClickCanvas(page, center);
    await expectCropModeClosed(page);
    await expect(resetCrop).toBeEnabled();
    const committed = await readSavedLeaf(page, 'reset-crop-open-image');
    expect(committed.width).toBeCloseTo(640, 6);
    expect(committed.height).toBeCloseTo(360, 6);
    expect(committed.sourceTransform.width).toBeCloseTo(640, 6);
    expect(committed.sourceTransform.x).toBeGreaterThan(20);
  });

  test('IC-19 an inspector edit made in crop mode shows at once and survives the commit', async ({
    page,
  }) => {
    const image = createImageFixture({
      id: 'crop-inspector-edit-image',
      name: 'Crop Inspector Edit Image',
      x: 150,
      y: 200,
      width: 640,
      height: 360,
    });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'crop-inspector-edit.json');
    await setCanvasTestHooksEnabled(page, false);

    await doubleClickItem(page, 'crop-inspector-edit-image');
    await expectCropMode(page);
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Geometry' }).click();
    const rotationInput = page.getByRole('spinbutton', { name: 'Rotation' });
    await rotationInput.fill('20');
    await rotationInput.press('Enter');

    // Crop mode stays open, and its frame turns with the item at once.
    await expect
      .poll(async () => (await readStageDebug(page)).cropSession?.previewItem.rotation ?? null)
      .toBe(20);
    const cropSession = await expectCropMode(page);
    await expect(rotationInput).toHaveValue('20');

    // Pan, then commit: both the pan and the new angle are kept.
    const center = centerOf(cropSession.previewItem);
    await dragEmptyCanvas(page, center, { x: center.x + 40, y: center.y + 20 });
    await expectCropMode(page);
    await doubleClickCanvas(page, center);
    await expectCropModeClosed(page);
    const committed = await readSavedLeaf(page, 'crop-inspector-edit-image');
    expect(committed.rotation).toBe(20);
    expect(Math.abs(committed.sourceTransform.x) + Math.abs(committed.sourceTransform.y)).toBeGreaterThan(10);
  });
});
