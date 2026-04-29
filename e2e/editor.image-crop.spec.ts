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
      await expect(page.getByTestId('guide-count')).not.toContainText('Guides: 0');
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
      await expect(page.getByTestId('guide-count')).toContainText('Guides: 0');

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
});
