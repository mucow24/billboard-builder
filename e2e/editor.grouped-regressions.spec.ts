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
  moveGroupDragToPointer,
  moveGroupResizeToPointer,
  pointForRenderedHandle,
  readGroupFrameWhen,
  readSettledGroupSnapshot,
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
      const preview = await moveGroupResizeToPointer(
        page,
        baseline,
        resizeCase.handle,
        destination,
        `${resizeCase.handle} preview`
      );
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
      baseline = await readSettledGroupSnapshot(page, `${resizeCase.handle} commit`);
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
    await moveGroupResizeToPointer(page, baseline, 'middle-right', firstDestination, 'first handle preview');
    await releasePointer(page);

    baseline = await readSettledGroupSnapshot(page, 'after first handle commit');
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
    const preview = await moveGroupResizeToPointer(
      page,
      baseline,
      'bottom-right',
      secondDestination,
      'second handle preview'
    );
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
    const preview = await moveGroupResizeToPointer(
      page,
      baseline,
      'middle-right',
      resizeDestination,
      'visibility preview'
    );
    assertRenderSelectionUiVisible(preview, 'visibility preview');
    assertRenderedResizeMatchesPointer(baseline, preview, 'middle-right', resizeDestination, 'visibility preview');
    await releasePointer(page);

    baseline = await readSettledGroupSnapshot(page, 'visibility commit');
    assertRenderSelectionUiVisible(baseline, 'visibility commit');
    assertRenderFrameTightlyWrapsItems(baseline, 'visibility commit');

    const regrabBaseline = requireRenderGroupFrame(baseline, 'regrab baseline');
    await beginGroupHandleDrag(page, 'overlay');
    const dragPreview = await moveGroupDragToPointer(
      page,
      baseline,
      { x: regrabBaseline.center.x + 70, y: regrabBaseline.center.y + 50 },
      'regrab preview'
    );
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
    // Gate on the snapped geometry (left edge at 0), not just sessionKind:
    // the drag snaps the frame to the guide, and reading on the first
    // 'group-drag' commit can catch the pre-snap frame under load.
    let snapshot = await readGroupFrameWhen(
      page,
      (frame) => Math.abs(frame.x) < 0.05,
      'snapped drag preview',
      'group-drag'
    );
    assertRenderSelectionUiVisible(snapshot, 'snapped drag preview');
    expect(requireRenderGroupFrame(snapshot, 'snapped drag preview').x).toBeCloseTo(0, 1);
    await releasePointer(page);

    baseline = await readGroupFrameWhen(
      page,
      (frame) => Math.abs(frame.x) < 0.05,
      'snapped drag commit'
    );
    expect(requireRenderGroupFrame(baseline, 'snapped drag commit').x).toBeCloseTo(0, 1);

    const resizedBaseline = requireRenderGroupFrame(baseline, 'snapped resize baseline');
    const resizeDestination = {
      x: 508,
      y: resizedBaseline.center.y,
    };

    await beginGroupHandleDrag(page, 'middle-right');
    await movePointerToCanvasPoint(page, resizeDestination);
    // Gate on the snapped right edge (512), not just sessionKind — the resize
    // snaps to the canvas edge and the first 'group-resize' commit can still
    // show the pre-move frame.
    snapshot = await readGroupFrameWhen(
      page,
      (frame) => Math.abs(frame.x + frame.width - 512) < 0.05,
      'snapped resize preview',
      'group-resize'
    );
    assertRenderSelectionUiVisible(snapshot, 'snapped resize preview');
    const resizedFrame = requireRenderGroupFrame(snapshot, 'snapped resize preview');
    expect(resizedFrame.x + resizedFrame.width).toBeCloseTo(512, 1);
  });

});
