import { expect, test, type Page } from '@playwright/test';

import {
  clickCanvas,
  createGroupedProjectDocument,
  createGroupNodeFixture,
  createImageFixture,
  createRectangleFixture,
  doubleClickCanvas,
  dragCanvas,
  openFreshEditor,
  openLayersTab,
  readStageDebug,
  saveAndReadProject,
  setCanvasTestHooksEnabled,
  uploadProject,
  waitForDoubleClickCadence,
} from './support/editor';

function collectLeafNodes(nodes: Array<Record<string, unknown>>) {
  return nodes.flatMap((node) => {
    if (node.kind === 'group' && Array.isArray(node.children)) {
      return collectLeafNodes(node.children as Array<Record<string, unknown>>);
    }
    return [node];
  });
}

async function expectActiveLayerId(page: Page, nodeId: string) {
  const rowSelect = page.getByTestId(`layers-row-${nodeId}`);
  await expect(rowSelect).toBeVisible();
  await expect(rowSelect.locator('..')).toHaveClass(/active/);
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

    await clickCanvas(page, { x: 600, y: 365 });
    await openLayersTab(page);
    await expectActiveLayerId(page, 'image-group');

    await waitForDoubleClickCadence(page);
    await doubleClickCanvas(page, { x: 600, y: 365 });

    await openLayersTab(page);
    await expectActiveLayerId(page, 'grouped-image');
    expect((await readStageDebug(page)).sessionKind ?? null).not.toBe('image-crop');
    expect((await readStageDebug(page)).cropSession ?? null).toBeNull();

    await waitForDoubleClickCadence(page);
    await doubleClickCanvas(page, { x: 600, y: 365 });

    const cropSession = await expectCropMode(page);
    expect(cropSession.previewItem.width).toBeGreaterThan(0);
    await openLayersTab(page);
    await expectActiveLayerId(page, 'grouped-image');
  });

  test('resizes crop bounds, pans the image under crop, and commits on blank click', async ({
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
    });

    await openFreshEditor(page);
    await uploadProject(page, createGroupedProjectDocument([image]), 'crop-blank-commit.json');
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 600, y: 365 });
    await waitForDoubleClickCadence(page);
    await doubleClickCanvas(page, { x: 600, y: 365 });

    let cropSession = await expectCropMode(page);
    expect(cropSession.crop.width).toBe(100);
    const startHandle = cropSession.cropHandlePoints?.['middle-right'];
    if (!startHandle) {
      throw new Error('Expected a crop right handle.');
    }
    await dragCanvas(page, startHandle, { x: startHandle.x + 24, y: startHandle.y });

    cropSession = await expectCropMode(page);
    expect(cropSession.crop.width).toBeGreaterThan(100);

    const cropCenter = {
      x: cropSession.previewItem.x + cropSession.previewItem.width / 2,
      y: cropSession.previewItem.y + cropSession.previewItem.height / 2,
    };
    await dragCanvas(page, cropCenter, { x: cropCenter.x + 18, y: cropCenter.y + 10 });

    cropSession = await expectCropMode(page);
    expect(cropSession.crop.x).toBeLessThan(20);

    await clickCanvas(page, { x: 120, y: 120 });
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

  test('commits crop and switches selection when another item is clicked', async ({ page }) => {
    const image = createImageFixture({
      id: 'crop-switch-image',
      name: 'Switch Image',
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
      'crop-commit-switch.json',
    );
    await setCanvasTestHooksEnabled(page, false);

    await clickCanvas(page, { x: 600, y: 365 });
    await waitForDoubleClickCadence(page);
    await doubleClickCanvas(page, { x: 600, y: 365 });

    const cropSession = await expectCropMode(page);
    expect(cropSession.crop.width).toBe(100);
    const handle = cropSession.cropHandlePoints?.['middle-right'];
    if (!handle) {
      throw new Error('Expected a crop right handle.');
    }
    await dragCanvas(page, handle, { x: handle.x + 24, y: handle.y });

    await clickCanvas(page, { x: 260, y: 240 });
    await expect.poll(async () => (await readStageDebug(page)).cropSession ?? null).toBeNull();

    await openLayersTab(page);
    await expectActiveLayerId(page, 'crop-switch-rect');

    const savedProject = await saveAndReadProject(page);
    const savedImage = collectLeafNodes(savedProject.nodes as Array<Record<string, unknown>>).find(
      (item) => item.id === 'crop-switch-image',
    );
    expect(Number((savedImage as { crop: { width: number } }).crop.width)).toBeGreaterThan(100);
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

    await clickCanvas(page, { x: 600, y: 365 });
    await waitForDoubleClickCadence(page);
    await doubleClickCanvas(page, { x: 600, y: 365 });

    let cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.rotation).toBe(0);
    const fullResizeHandle = cropSession.fullImageHandlePoints?.['middle-right'];
    if (!fullResizeHandle) {
      throw new Error('Expected a full-image resize handle.');
    }
    await dragCanvas(page, fullResizeHandle, { x: fullResizeHandle.x + 40, y: fullResizeHandle.y });

    cropSession = await expectCropMode(page);
    expect(cropSession.fullImageItem.width).toBeGreaterThan(160);

    const fullRotater = cropSession.fullImageHandlePoints?.rotater;
    if (!fullRotater) {
      throw new Error('Expected a full-image rotater.');
    }
    await dragCanvas(page, fullRotater, {
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
});
