import { expect, test } from '@playwright/test';

import {
  beginGroupHandleDrag,
  createProjectDocument,
  createRectangleFixture,
  dragEmptyCanvas,
  movePointerToCanvasPoint,
  movePointerToPagePoint,
  openFreshEditor,
  readRenderSnapshot,
  readStageDebug,
  releasePointer,
  uploadProject,
} from './support/editor';
import {
  assertRenderFrameTightlyWrapsItems,
  assertRenderItemsMatchResizePointer,
  assertRenderItemsFollowFrameTransform,
  assertRenderedResizeMatchesPointer,
  assertRenderSelectionUiVisible,
  pointForRenderedHandle,
  requireRenderGroupFrame,
  rotateRenderedGroupTo,
} from './support/rotatedGroups';

const rectangleGroupFixture = createProjectDocument([
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
]);

const resizeCases = [
  { handle: 'top-left', delta: { x: -50, y: -40 } },
  { handle: 'top-center', delta: { x: 0, y: -70 } },
  { handle: 'top-right', delta: { x: 40, y: -50 } },
  { handle: 'middle-left', delta: { x: -90, y: 0 } },
  { handle: 'middle-right', delta: { x: 90, y: 0 } },
  { handle: 'bottom-left', delta: { x: -50, y: 50 } },
  { handle: 'bottom-center', delta: { x: 0, y: 75 } },
  { handle: 'bottom-right', delta: { x: 60, y: 55 } },
] as const;

test.describe('grouped manipulation regressions', () => {
  test('keeps rotated group resize previews aligned for every handle', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-regression-resize.json');
    await dragEmptyCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    let baseline = await rotateRenderedGroupTo(page, 33);

    for (const resizeCase of resizeCases) {
      const destination = pointForRenderedHandle(
        requireRenderGroupFrame(baseline, `${resizeCase.handle} baseline`),
        resizeCase.handle,
        resizeCase.delta
      );
      await beginGroupHandleDrag(page, resizeCase.handle);
      await movePointerToCanvasPoint(page, destination);
      await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');

      const preview = await readRenderSnapshot(page);
      assertRenderSelectionUiVisible(preview, `${resizeCase.handle} preview`);
      assertRenderItemsMatchResizePointer(
        baseline,
        preview,
        resizeCase.handle,
        destination,
        `${resizeCase.handle} preview`
      );
      assertRenderedResizeMatchesPointer(
        baseline,
        preview,
        resizeCase.handle,
        destination,
        `${resizeCase.handle} preview`,
        5
      );
      assertRenderFrameTightlyWrapsItems(preview, `${resizeCase.handle} preview`);

      await releasePointer(page);
      baseline = await readRenderSnapshot(page);
      assertRenderSelectionUiVisible(baseline, `${resizeCase.handle} commit`);
      assertRenderFrameTightlyWrapsItems(baseline, `${resizeCase.handle} commit`);
    }
  });

  test('drops stale capture when switching directly from one resize handle to another', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-regression-switch.json');
    await dragEmptyCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    let baseline = await rotateRenderedGroupTo(page, 61);

    const firstDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'first handle baseline'),
      'middle-right',
      {
        x: 90,
        y: 0,
      }
    );
    await beginGroupHandleDrag(page, 'middle-right');
    await movePointerToCanvasPoint(page, firstDestination);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(baseline, 'after first handle commit');

    const secondDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'second handle baseline'),
      'bottom-right',
      {
        x: 40,
        y: 60,
      }
    );
    await beginGroupHandleDrag(page, 'bottom-right');
    await movePointerToCanvasPoint(page, secondDestination);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');

    const preview = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(preview, 'second handle preview');
    assertRenderItemsMatchResizePointer(
      baseline,
      preview,
      'bottom-right',
      secondDestination,
      'second handle preview'
    );
    assertRenderedResizeMatchesPointer(baseline, preview, 'bottom-right', secondDestination, 'second handle preview');
    assertRenderFrameTightlyWrapsItems(preview, 'second handle preview');
  });

  test('keeps the manipulation UI visible across commit and immediate re-grab', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-regression-visibility.json');
    await dragEmptyCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    let baseline = await rotateRenderedGroupTo(page, 89);

    const resizeDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'visibility baseline'),
      'middle-right',
      {
        x: 100,
        y: 0,
      }
    );
    await beginGroupHandleDrag(page, 'middle-right');
    await movePointerToCanvasPoint(page, resizeDestination);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');

    const preview = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(preview, 'visibility preview');
    assertRenderedResizeMatchesPointer(baseline, preview, 'middle-right', resizeDestination, 'visibility preview');
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(baseline, 'visibility commit');
    assertRenderFrameTightlyWrapsItems(baseline, 'visibility commit');

    await beginGroupHandleDrag(page, 'overlay');
    await movePointerToCanvasPoint(page, {
      x: requireRenderGroupFrame(baseline, 'regrab baseline').center.x + 70,
      y: requireRenderGroupFrame(baseline, 'regrab baseline').center.y + 50,
    });
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-drag');

    const dragPreview = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(dragPreview, 'regrab preview');
    assertRenderItemsFollowFrameTransform(baseline, dragPreview, 'regrab preview', 'drag');
  });

  test('pans the viewport when middle-dragging from the multi-select overlay', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-middle-pan.json');
    await dragEmptyCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    const initial = await readStageDebug(page);

    await beginGroupHandleDrag(page, 'overlay', { button: 1 });
    await movePointerToPagePoint(page, { x: 420, y: 320 });
    await releasePointer(page);

    const afterOverlayPan = await readStageDebug(page);
    expect(afterOverlayPan.viewport.panX).not.toBe(initial.viewport.panX);
    expect(afterOverlayPan.viewport.panY).not.toBe(initial.viewport.panY);
    expect(afterOverlayPan.sessionKind).toBeNull();
  });

  test('snaps multi-select drag and resize interactions with the same guide behavior as single-item transforms', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-snap-regression.json');
    await dragEmptyCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    let baseline = await readRenderSnapshot(page);
    const initialFrame = requireRenderGroupFrame(baseline, 'initial snap baseline');
    const dragDestination = {
      x: initialFrame.center.x + (4 - initialFrame.x),
      y: initialFrame.center.y,
    };

    await beginGroupHandleDrag(page, 'overlay');
    await movePointerToCanvasPoint(page, dragDestination);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-drag');

    let snapshot = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(snapshot, 'snapped drag preview');
    expect(requireRenderGroupFrame(snapshot, 'snapped drag preview').x).toBeCloseTo(0, 1);
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    expect(requireRenderGroupFrame(baseline, 'snapped drag commit').x).toBeCloseTo(0, 1);

    const resizedBaseline = requireRenderGroupFrame(baseline, 'snapped resize baseline');
    const resizeDestination = {
      x: 508,
      y: resizedBaseline.center.y,
    };

    await beginGroupHandleDrag(page, 'middle-right');
    await movePointerToCanvasPoint(page, resizeDestination);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');

    snapshot = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(snapshot, 'snapped resize preview');
    const resizedFrame = requireRenderGroupFrame(snapshot, 'snapped resize preview');
    expect(resizedFrame.x + resizedFrame.width).toBeCloseTo(512, 1);
  });

});
