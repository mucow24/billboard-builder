import { expect, test } from '@playwright/test';

import {
  beginCanvasHookDrag,
  beginVisibleCanvasDrag,
  canvasPointToPage,
  createProjectDocument,
  createRectangleFixture,
  dragCanvas,
  movePointerToCanvasPoint,
  movePointerToPagePoint,
  openFreshEditor,
  readRenderSnapshot,
  releasePointer,
  setCanvasTestHooksEnabled,
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
  rotaterDestination,
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

function interpolatePoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  progress: number
) {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

test.describe('grouped manipulation regressions', () => {
  test('keeps rotated group resize previews aligned for every handle', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-regression-resize.json');
    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    let baseline = await rotateRenderedGroupTo(page, 33);

    for (const resizeCase of resizeCases) {
      const destination = pointForRenderedHandle(
        requireRenderGroupFrame(baseline, `${resizeCase.handle} baseline`),
        resizeCase.handle,
        resizeCase.delta
      );
      await beginCanvasHookDrag(page, `canvas-group-handle-${resizeCase.handle}`);
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
        `${resizeCase.handle} preview`
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
    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    let baseline = await rotateRenderedGroupTo(page, 61);

    const firstDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'first handle baseline'),
      'middle-right',
      {
        x: 90,
        y: 0,
      }
    );
    await beginCanvasHookDrag(page, 'canvas-group-handle-middle-right');
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
    await beginCanvasHookDrag(page, 'canvas-group-handle-bottom-right');
    await movePointerToCanvasPoint(page, secondDestination, 4);
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
    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });

    let baseline = await rotateRenderedGroupTo(page, 89);

    const resizeDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'visibility baseline'),
      'middle-right',
      {
        x: 100,
        y: 0,
      }
    );
    await beginCanvasHookDrag(page, 'canvas-group-handle-middle-right');
    await movePointerToCanvasPoint(page, resizeDestination);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');

    const preview = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(preview, 'visibility preview');
    assertRenderedResizeMatchesPointer(baseline, preview, 'middle-right', resizeDestination, 'visibility preview');
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(baseline, 'visibility commit');
    assertRenderFrameTightlyWrapsItems(baseline, 'visibility commit');

    await beginCanvasHookDrag(page, 'canvas-group-overlay');
    await movePointerToCanvasPoint(page, {
      x: requireRenderGroupFrame(baseline, 'regrab baseline').center.x + 70,
      y: requireRenderGroupFrame(baseline, 'regrab baseline').center.y + 50,
    });
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-drag');

    const dragPreview = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(dragPreview, 'regrab preview');
    assertRenderItemsFollowFrameTransform(baseline, dragPreview, 'regrab preview', 'drag');
  });

  test('keeps real visible handle interactions aligned after rotate and handle switching', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-regression-visible.json');
    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    await setCanvasTestHooksEnabled(page, false);

    let baseline = await readRenderSnapshot(page);
    const initialFrame = requireRenderGroupFrame(baseline, 'visible rotate baseline');
    const rotateDestination = await canvasPointToPage(page, rotaterDestination({
      x: initialFrame.center.x - initialFrame.width / 2,
      y: initialFrame.center.y - initialFrame.height / 2,
      width: initialFrame.width,
      height: initialFrame.height,
      rotation: initialFrame.rotation,
    }, 61));
    if (!baseline.groupRotater) {
      throw new Error('Expected a visible group rotater.');
    }
    await beginVisibleCanvasDrag(page, baseline.groupRotater);
    await movePointerToPagePoint(page, rotateDestination);
    await expect.poll(async () => Math.abs((await readRenderSnapshot(page)).groupOverlay?.rotation ?? 0)).toBeGreaterThan(40);
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(baseline, 'visible rotate commit');

    const resizeDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'visible side baseline'),
      'middle-right',
      {
        x: 110,
        y: 0,
      }
    );
    const resizeDestinationPage = await canvasPointToPage(page, resizeDestination);
    await beginVisibleCanvasDrag(page, baseline.groupHandles['middle-right']);
    await movePointerToPagePoint(page, resizeDestinationPage);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');

    const resizePreview = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(resizePreview, 'visible side preview');
    assertRenderItemsMatchResizePointer(
      baseline,
      resizePreview,
      'middle-right',
      resizeDestination,
      'visible side preview'
    );
    assertRenderedResizeMatchesPointer(baseline, resizePreview, 'middle-right', resizeDestination, 'visible side preview');
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(baseline, 'visible side commit');

    const secondDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'visible switch baseline'),
      'bottom-right',
      {
        x: 60,
        y: 70,
      }
    );
    const secondDestinationPage = await canvasPointToPage(page, secondDestination);
    await beginVisibleCanvasDrag(page, baseline.groupHandles['bottom-right']);
    await movePointerToPagePoint(page, secondDestinationPage, 4);
    await expect.poll(async () => (await readRenderSnapshot(page)).sessionKind).toBe('group-resize');

    const secondPreview = await readRenderSnapshot(page);
    assertRenderSelectionUiVisible(secondPreview, 'visible switch preview');
    assertRenderItemsMatchResizePointer(
      baseline,
      secondPreview,
      'bottom-right',
      secondDestination,
      'visible switch preview'
    );
    assertRenderedResizeMatchesPointer(baseline, secondPreview, 'bottom-right', secondDestination, 'visible switch preview');
  });

  test('keeps live rotated resize previews continuous while dragging real handles', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-regression-live-continuity.json');
    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    await setCanvasTestHooksEnabled(page, false);

    let baseline = await readRenderSnapshot(page);
    const initialFrame = requireRenderGroupFrame(baseline, 'continuity rotate baseline');
    const rotateDestination = await canvasPointToPage(page, rotaterDestination({
      x: initialFrame.center.x - initialFrame.width / 2,
      y: initialFrame.center.y - initialFrame.height / 2,
      width: initialFrame.width,
      height: initialFrame.height,
      rotation: initialFrame.rotation,
    }, 61));
    if (!baseline.groupRotater) {
      throw new Error('Expected a visible group rotater.');
    }
    await beginVisibleCanvasDrag(page, baseline.groupRotater);
    await movePointerToPagePoint(page, rotateDestination);
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    const resizeDestination = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'continuity resize baseline'),
      'middle-right',
      {
        x: -170,
        y: 0,
      }
    );
    const resizeStartCanvas = pointForRenderedHandle(
      requireRenderGroupFrame(baseline, 'continuity resize baseline'),
      'middle-right',
      { x: 0, y: 0 }
    );
    const resizeDestinationPage = await canvasPointToPage(page, resizeDestination);
    const startPoint = baseline.groupHandles['middle-right'];

    await beginVisibleCanvasDrag(page, startPoint);
    let previousWidth = requireRenderGroupFrame(baseline, 'continuity start').width;
    for (let step = 1; step <= 8; step += 1) {
      const pagePoint = interpolatePoint(startPoint, resizeDestinationPage, step / 8);
      await movePointerToPagePoint(page, pagePoint, 1);
      const snapshot = await readRenderSnapshot(page);
      expect(snapshot.sessionKind).toBe('group-resize');
      assertRenderSelectionUiVisible(snapshot, `continuity step ${step}`);
      assertRenderItemsMatchResizePointer(
        baseline,
        snapshot,
        'middle-right',
        interpolatePoint(resizeStartCanvas, resizeDestination, step / 8),
        `continuity step ${step}`
      );
      assertRenderedResizeMatchesPointer(
        baseline,
        snapshot,
        'middle-right',
        interpolatePoint(resizeStartCanvas, resizeDestination, step / 8),
        `continuity step ${step}`,
        5
      );
      const currentWidth = requireRenderGroupFrame(snapshot, `continuity width ${step}`).width;
      expect(currentWidth).toBeLessThanOrEqual(previousWidth + 2);
      previousWidth = currentWidth;
    }
  });

  test('keeps grouped items following the live rotated top-center resize after crossing the center', async ({ page }) => {
    await openFreshEditor(page);
    await uploadProject(page, rectangleGroupFixture, 'grouped-regression-top-center-pin.json');
    await dragCanvas(page, { x: 90, y: 110 }, { x: 470, y: 300 });
    await setCanvasTestHooksEnabled(page, false);

    let baseline = await readRenderSnapshot(page);
    const initialFrame = requireRenderGroupFrame(baseline, 'top-center rotate baseline');
    const rotateDestination = await canvasPointToPage(page, rotaterDestination({
      x: initialFrame.center.x - initialFrame.width / 2,
      y: initialFrame.center.y - initialFrame.height / 2,
      width: initialFrame.width,
      height: initialFrame.height,
      rotation: initialFrame.rotation,
    }, 61));
    if (!baseline.groupRotater) {
      throw new Error('Expected a visible group rotater.');
    }
    await beginVisibleCanvasDrag(page, baseline.groupRotater);
    await movePointerToPagePoint(page, rotateDestination);
    await releasePointer(page);

    baseline = await readRenderSnapshot(page);
    const frame = requireRenderGroupFrame(baseline, 'top-center resize baseline');
    const startCanvas = pointForRenderedHandle(frame, 'top-center', { x: 0, y: 0 });
    const destinationCanvas = pointForRenderedHandle(frame, 'top-center', { x: 0, y: 120 });
    const startPage = baseline.groupHandles['top-center'];
    const destinationPage = await canvasPointToPage(page, destinationCanvas);

    await beginVisibleCanvasDrag(page, startPage);
    for (let step = 1; step <= 8; step += 1) {
      const pagePoint = interpolatePoint(startPage, destinationPage, step / 8);
      const canvasPoint = interpolatePoint(startCanvas, destinationCanvas, step / 8);
      await movePointerToPagePoint(page, pagePoint, 1);

      const snapshot = await readRenderSnapshot(page);
      expect(snapshot.sessionKind).toBe('group-resize');
      assertRenderSelectionUiVisible(snapshot, `top-center step ${step}`);
      assertRenderItemsMatchResizePointer(
        baseline,
        snapshot,
        'top-center',
        canvasPoint,
        `top-center step ${step}`
      );
      assertRenderedResizeMatchesPointer(baseline, snapshot, 'top-center', canvasPoint, `top-center step ${step}`, 5);
    }
  });
});
