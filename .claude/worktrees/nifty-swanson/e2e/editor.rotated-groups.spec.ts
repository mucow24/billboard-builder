import { expect, test } from '@playwright/test';

import {
  beginCanvasHookDrag,
  createLineFixture,
  createProjectDocument,
  createRectangleFixture,
  dragCanvas,
  movePointerToCanvasPoint,
  openFreshEditor,
  readStageDebug,
  releasePointer,
  uploadProject,
} from './support/editor';
import {
  assertFiniteGeometry,
  assertGroupFrameTightlyWrapsSelectedItems,
  assertGroupOverlayGeometry,
  assertSelectedItemsFollowFrameTransform,
  frameCenter,
  pointForHandle,
  requireGroupFrame,
  rotateGroupTo,
  rotaterDestination,
} from './support/rotatedGroups';

test.describe('rotated group browser geometry', () => {
  test('keeps live rectangle-group previews coherent across rotate, drag, and repeated resizes', async ({ page }) => {
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
      'rotated-group-geometry.json'
    );

    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    let baseline = await rotateGroupTo(page, 33);

    await beginCanvasHookDrag(page, 'canvas-group-overlay');
    await movePointerToCanvasPoint(page, {
      x: frameCenter(requireGroupFrame(baseline, 'drag baseline')).x + 96,
      y: frameCenter(requireGroupFrame(baseline, 'drag baseline')).y + 68,
    });
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-drag');

    let preview = await readStageDebug(page);
    assertFiniteGeometry(preview, 'group drag preview');
    assertGroupOverlayGeometry(preview, 'group drag preview');
    assertSelectedItemsFollowFrameTransform(baseline, preview, 'group drag preview', 'drag');
    assertGroupFrameTightlyWrapsSelectedItems(preview, 'group drag preview');
    await releasePointer(page);

    baseline = await readStageDebug(page);
    assertFiniteGeometry(baseline, 'group drag commit');
    assertSelectedItemsFollowFrameTransform(preview, baseline, 'group drag commit', 'drag');

    baseline = await rotateGroupTo(page, 121);

    await beginCanvasHookDrag(page, 'canvas-group-handle-middle-right');
    await movePointerToCanvasPoint(
      page,
      pointForHandle(requireGroupFrame(baseline, 'side resize baseline'), 'middle-right', {
        x: 110,
        y: 0,
      })
    );
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-resize');

    preview = await readStageDebug(page);
    assertFiniteGeometry(preview, 'side resize preview');
    assertGroupOverlayGeometry(preview, 'side resize preview');
    assertSelectedItemsFollowFrameTransform(baseline, preview, 'side resize preview', 'resize');
    assertGroupFrameTightlyWrapsSelectedItems(preview, 'side resize preview');
    await releasePointer(page);

    baseline = await readStageDebug(page);
    assertFiniteGeometry(baseline, 'side resize commit');

    await beginCanvasHookDrag(page, 'canvas-group-handle-bottom-right');
    await movePointerToCanvasPoint(
      page,
      pointForHandle(requireGroupFrame(baseline, 'corner resize baseline'), 'bottom-right', {
        x: 90,
        y: 70,
      })
    );
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-resize');

    preview = await readStageDebug(page);
    assertFiniteGeometry(preview, 'corner resize preview');
    assertGroupOverlayGeometry(preview, 'corner resize preview');
    assertSelectedItemsFollowFrameTransform(baseline, preview, 'corner resize preview', 'resize');
    assertGroupFrameTightlyWrapsSelectedItems(preview, 'corner resize preview');
    await releasePointer(page);

    const committed = await readStageDebug(page);
    assertFiniteGeometry(committed, 'corner resize commit');
    assertGroupOverlayGeometry(committed, 'corner resize commit');
  });

  test('keeps mixed line and shape groups coherent through live rotated drag, resize, and rotate previews', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createRectangleFixture({
          id: 'rect-a',
          x: 100,
          y: 120,
          width: 100,
          height: 50,
          zIndex: 0,
        }),
        createLineFixture({
          id: 'line-b',
          startX: 250,
          startY: 120,
          endX: 360,
          endY: 210,
          x: 250,
          y: 120,
          width: 110,
          height: 90,
          zIndex: 1,
        }),
        createRectangleFixture({
          id: 'rect-c',
          x: 390,
          y: 170,
          width: 90,
          height: 70,
          fill: '#facc15',
          stroke: '#ca8a04ff',
          zIndex: 2,
        }),
      ]),
      'mixed-rotated-group.json'
    );

    await dragCanvas(page, { x: 70, y: 90 }, { x: 520, y: 290 });
    let baseline = await rotateGroupTo(page, 127);

    await beginCanvasHookDrag(page, 'canvas-group-rotater');
    await movePointerToCanvasPoint(page, rotaterDestination(requireGroupFrame(baseline, 'mixed rotate baseline'), 41));
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-rotate');

    let preview = await readStageDebug(page);
    assertFiniteGeometry(preview, 'mixed rotate preview');
    assertGroupOverlayGeometry(preview, 'mixed rotate preview');
    assertSelectedItemsFollowFrameTransform(baseline, preview, 'mixed rotate preview', 'rotate');
    assertGroupFrameTightlyWrapsSelectedItems(preview, 'mixed rotate preview');
    await releasePointer(page);

    baseline = await readStageDebug(page);
    assertFiniteGeometry(baseline, 'mixed rotate commit');

    await beginCanvasHookDrag(page, 'canvas-group-overlay');
    await movePointerToCanvasPoint(page, {
      x: frameCenter(requireGroupFrame(baseline, 'mixed drag baseline')).x - 84,
      y: frameCenter(requireGroupFrame(baseline, 'mixed drag baseline')).y + 72,
    });
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-drag');

    preview = await readStageDebug(page);
    assertFiniteGeometry(preview, 'mixed drag preview');
    assertGroupOverlayGeometry(preview, 'mixed drag preview');
    assertSelectedItemsFollowFrameTransform(baseline, preview, 'mixed drag preview', 'drag');
    assertGroupFrameTightlyWrapsSelectedItems(preview, 'mixed drag preview');
    await releasePointer(page);

    baseline = await readStageDebug(page);
    assertFiniteGeometry(baseline, 'mixed drag commit');

    await beginCanvasHookDrag(page, 'canvas-group-handle-bottom-right');
    await movePointerToCanvasPoint(
      page,
      pointForHandle(requireGroupFrame(baseline, 'mixed resize baseline'), 'bottom-right', {
        x: 80,
        y: 90,
      })
    );
    await expect.poll(async () => (await readStageDebug(page)).sessionKind).toBe('group-resize');

    preview = await readStageDebug(page);
    assertFiniteGeometry(preview, 'mixed resize preview');
    assertGroupOverlayGeometry(preview, 'mixed resize preview');
    assertSelectedItemsFollowFrameTransform(baseline, preview, 'mixed resize preview', 'resize');
    assertGroupFrameTightlyWrapsSelectedItems(preview, 'mixed resize preview');
    await releasePointer(page);

    const committed = await readStageDebug(page);
    assertFiniteGeometry(committed, 'mixed resize commit');
    assertGroupOverlayGeometry(committed, 'mixed resize commit');
  });
});
