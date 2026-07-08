import { expect, type Page } from '@playwright/test';

import {
  beginGroupHandleDrag,
  movePointerToCanvasPoint,
  readRenderSnapshot,
  readStageDebug,
  releasePointer,
  type CanvasPoint,
  type RenderSnapshot,
  type RenderSnapshotItem,
  type StageDebugInfo,
} from './editor';

export type DebugGroupFrame = NonNullable<StageDebugInfo['groupFrame']>;
export type DebugSelectedItem = NonNullable<StageDebugInfo['selectedItems']>[number];
export type RenderGroupFrame = NonNullable<RenderSnapshot['groupOverlay']>;

export function rotateVector(vector: CanvasPoint, rotationDegrees: number): CanvasPoint {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

export function stageToLocal(point: CanvasPoint, origin: CanvasPoint, rotationDegrees: number): CanvasPoint {
  return rotateVector(
    {
      x: point.x - origin.x,
      y: point.y - origin.y,
    },
    -rotationDegrees
  );
}

export function localToStage(point: CanvasPoint, origin: CanvasPoint, rotationDegrees: number): CanvasPoint {
  const rotated = rotateVector(point, rotationDegrees);
  return {
    x: origin.x + rotated.x,
    y: origin.y + rotated.y,
  };
}

export function frameCenter(frame: DebugGroupFrame): CanvasPoint {
  return {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
}

export function pointForRenderedHandle(frame: RenderGroupFrame, handle: string, delta: CanvasPoint): CanvasPoint {
  return pointForHandle(
    {
      x: frame.center.x - frame.width / 2,
      y: frame.center.y - frame.height / 2,
      width: frame.width,
      height: frame.height,
      rotation: frame.rotation,
    },
    handle,
    delta
  );
}

export function rotaterDestination(frame: DebugGroupFrame, targetRotationDegrees: number): CanvasPoint {
  const center = frameCenter(frame);
  const radius = frame.height / 2 + 50;
  const rotated = rotateVector({ x: 0, y: -radius }, targetRotationDegrees);
  return {
    x: center.x + rotated.x,
    y: center.y + rotated.y,
  };
}

export function pointForHandle(frame: DebugGroupFrame, handle: string, delta: CanvasPoint): CanvasPoint {
  const localPoint = {
    x: handle.includes('left') ? -frame.width / 2 : handle.includes('right') ? frame.width / 2 : 0,
    y: handle.includes('top') ? -frame.height / 2 : handle.includes('bottom') ? frame.height / 2 : 0,
  };
  return localToStage(
    {
      x: localPoint.x + delta.x,
      y: localPoint.y + delta.y,
    },
    frameCenter(frame),
    frame.rotation
  );
}

export function expectPointClose(actual: CanvasPoint, expected: CanvasPoint, tolerance = 3) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
}

export function requireRenderGroupFrame(snapshot: RenderSnapshot, label: string): RenderGroupFrame {
  expect(snapshot.groupOverlay, `${label}: expected a rendered group overlay`).toBeTruthy();
  if (!snapshot.groupOverlay) {
    throw new Error(`${label}: expected a rendered group overlay`);
  }
  return snapshot.groupOverlay;
}

export function requireRenderSelectedItems(snapshot: RenderSnapshot, label: string): RenderSnapshotItem[] {
  expect(snapshot.selectedItems, `${label}: expected rendered selected items`).toBeTruthy();
  expect(snapshot.selectedItems.length, `${label}: expected rendered selected items`).toBeGreaterThan(0);
  return snapshot.selectedItems;
}

export function requireGroupFrame(debug: StageDebugInfo, label: string): DebugGroupFrame {
  expect(debug.groupFrame, `${label}: expected a group frame`).toBeTruthy();
  if (!debug.groupFrame) {
    throw new Error(`${label}: expected a group frame`);
  }
  return debug.groupFrame;
}

export function requireSelectedItems(debug: StageDebugInfo, label: string): DebugSelectedItem[] {
  expect(debug.selectedItems, `${label}: expected selected items`).toBeTruthy();
  if (!debug.selectedItems) {
    throw new Error(`${label}: expected selected items`);
  }
  return debug.selectedItems;
}

export function assertRenderSelectionUiVisible(snapshot: RenderSnapshot, label: string) {
  requireRenderGroupFrame(snapshot, label);
  expect(Object.keys(snapshot.groupHandles), `${label}: expected all group handles`).toHaveLength(8);
  expect(snapshot.groupRotater, `${label}: expected a rendered rotater`).toBeTruthy();
}

export function assertFiniteGeometry(debug: StageDebugInfo, label: string) {
  const frame = requireGroupFrame(debug, label);
  expect(Number.isFinite(frame.x), `${label}: frame.x should be finite`).toBe(true);
  expect(Number.isFinite(frame.y), `${label}: frame.y should be finite`).toBe(true);
  expect(Number.isFinite(frame.width), `${label}: frame.width should be finite`).toBe(true);
  expect(Number.isFinite(frame.height), `${label}: frame.height should be finite`).toBe(true);
  expect(frame.width, `${label}: frame.width should stay positive`).toBeGreaterThan(0.5);
  expect(frame.height, `${label}: frame.height should stay positive`).toBeGreaterThan(0.5);

  for (const item of requireSelectedItems(debug, label)) {
    expect(Number.isFinite(item.x), `${label}: ${item.id} x should be finite`).toBe(true);
    expect(Number.isFinite(item.y), `${label}: ${item.id} y should be finite`).toBe(true);
    expect(Number.isFinite(item.width), `${label}: ${item.id} width should be finite`).toBe(true);
    expect(Number.isFinite(item.height), `${label}: ${item.id} height should be finite`).toBe(true);
    expect(item.width, `${label}: ${item.id} width should stay positive`).toBeGreaterThan(0.5);
    expect(item.height, `${label}: ${item.id} height should stay positive`).toBeGreaterThan(0.5);
    if (item.kind === 'line') {
      expect(Number.isFinite(item.startX), `${label}: ${item.id} startX should be finite`).toBe(true);
      expect(Number.isFinite(item.startY), `${label}: ${item.id} startY should be finite`).toBe(true);
      expect(Number.isFinite(item.endX), `${label}: ${item.id} endX should be finite`).toBe(true);
      expect(Number.isFinite(item.endY), `${label}: ${item.id} endY should be finite`).toBe(true);
    }
  }
}

export function assertGroupOverlayGeometry(debug: StageDebugInfo, label: string) {
  const frame = requireGroupFrame(debug, label);
  const overlay = debug.groupOverlayViewportRect;
  const handles = debug.groupHandleViewportPoints;
  const rotater = debug.groupRotaterViewportPoint;

  expect(overlay, `${label}: expected a viewport overlay rect`).toBeTruthy();
  expect(handles, `${label}: expected viewport handle points`).toBeTruthy();
  expect(rotater, `${label}: expected a rotater point`).toBeTruthy();
  if (!overlay || !handles || !rotater) {
    return;
  }

  const center = {
    x: overlay.left + overlay.width / 2,
    y: overlay.top + overlay.height / 2,
  };
  const halfWidth = overlay.width / 2;
  const halfHeight = overlay.height / 2;
  const rotaterOffset = (frame.height / 2) * debug.viewport.zoom + 50;

  expectPointClose(
    handles['middle-right'],
    {
      x: center.x + rotateVector({ x: halfWidth, y: 0 }, frame.rotation).x,
      y: center.y + rotateVector({ x: halfWidth, y: 0 }, frame.rotation).y,
    }
  );
  expectPointClose(
    handles['bottom-right'],
    {
      x: center.x + rotateVector({ x: halfWidth, y: halfHeight }, frame.rotation).x,
      y: center.y + rotateVector({ x: halfWidth, y: halfHeight }, frame.rotation).y,
    }
  );
  expectPointClose(
    rotater,
    {
      x: center.x + rotateVector({ x: 0, y: -rotaterOffset }, frame.rotation).x,
      y: center.y + rotateVector({ x: 0, y: -rotaterOffset }, frame.rotation).y,
    }
  );
}

function shapeCenter(item: DebugSelectedItem): CanvasPoint {
  return localToStage(
    { x: item.width / 2, y: item.height / 2 },
    { x: item.x, y: item.y },
    item.rotation
  );
}

function itemReferencePoints(item: DebugSelectedItem): Record<string, CanvasPoint> {
  if (item.kind === 'line') {
    return {
      start: { x: item.startX!, y: item.startY! },
      end: { x: item.endX!, y: item.endY! },
      midpoint: {
        x: (item.startX! + item.endX!) / 2,
        y: (item.startY! + item.endY!) / 2,
      },
    };
  }

  return {
    anchor: { x: item.x, y: item.y },
    center: shapeCenter(item),
  };
}

function itemOutlinePoints(item: DebugSelectedItem): CanvasPoint[] {
  if (item.kind === 'line') {
    return [
      { x: item.startX!, y: item.startY! },
      { x: item.endX!, y: item.endY! },
    ];
  }

  const corners = [
    { x: 0, y: 0 },
    { x: item.width, y: 0 },
    { x: item.width, y: item.height },
    { x: 0, y: item.height },
  ];
  return corners.map((corner) => localToStage(corner, { x: item.x, y: item.y }, item.rotation));
}

function renderItemReferencePoints(item: RenderSnapshotItem): Record<string, CanvasPoint> {
  if (item.kind === 'line') {
    return {
      start: item.outlinePoints[0],
      end: item.outlinePoints[1],
      midpoint: {
        x: (item.outlinePoints[0].x + item.outlinePoints[1].x) / 2,
        y: (item.outlinePoints[0].y + item.outlinePoints[1].y) / 2,
      },
    };
  }

  return {
    anchor: item.outlinePoints[0],
    center: {
      x: (item.outlinePoints[0].x + item.outlinePoints[2].x) / 2,
      y: (item.outlinePoints[0].y + item.outlinePoints[2].y) / 2,
    },
  };
}

export function mapPointBetweenFrames(
  point: CanvasPoint,
  fromFrame: DebugGroupFrame,
  toFrame: DebugGroupFrame
): CanvasPoint {
  const fromCenter = frameCenter(fromFrame);
  const toCenter = frameCenter(toFrame);
  const local = stageToLocal(point, fromCenter, fromFrame.rotation);
  const normalized = {
    x: (local.x + fromFrame.width / 2) / Math.max(fromFrame.width, 1),
    y: (local.y + fromFrame.height / 2) / Math.max(fromFrame.height, 1),
  };
  return localToStage(
    {
      x: (normalized.x - 0.5) * toFrame.width,
      y: (normalized.y - 0.5) * toFrame.height,
    },
    toCenter,
    toFrame.rotation
  );
}

function getSignedResizeAxes(
  frame: RenderGroupFrame,
  handle: string,
  pointer: CanvasPoint
) {
  const localPointer = stageToLocal(pointer, frame.center, frame.rotation);
  let left = -frame.width / 2;
  let right = frame.width / 2;
  let top = -frame.height / 2;
  let bottom = frame.height / 2;

  if (handle.includes('left')) {
    left = localPointer.x;
  }
  if (handle.includes('right')) {
    right = localPointer.x;
  }
  if (handle.includes('top')) {
    top = localPointer.y;
  }
  if (handle.includes('bottom')) {
    bottom = localPointer.y;
  }
  if (handle === 'top-center' || handle === 'bottom-center') {
    left = -frame.width / 2;
    right = frame.width / 2;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    top = -frame.height / 2;
    bottom = frame.height / 2;
  }

  return {
    left,
    right,
    top,
    bottom,
  };
}

function mapPointThroughSignedResize(
  point: CanvasPoint,
  beforeFrame: RenderGroupFrame,
  handle: string,
  pointer: CanvasPoint
) {
  const local = stageToLocal(point, beforeFrame.center, beforeFrame.rotation);
  const axes = getSignedResizeAxes(beforeFrame, handle, pointer);
  const normalized = {
    x: (local.x + beforeFrame.width / 2) / Math.max(beforeFrame.width, 1),
    y: (local.y + beforeFrame.height / 2) / Math.max(beforeFrame.height, 1),
  };
  return localToStage(
    {
      x: axes.left + (axes.right - axes.left) * normalized.x,
      y: axes.top + (axes.bottom - axes.top) * normalized.y,
    },
    beforeFrame.center,
    beforeFrame.rotation
  );
}

function expectPointSetClose(
  actual: CanvasPoint[],
  expected: CanvasPoint[],
  label: string,
  tolerance = 4
) {
  expect(actual, `${label}: point-count mismatch`).toHaveLength(expected.length);
  const remaining = [...actual];

  for (const target of expected) {
    let matchIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const deltaX = candidate.x - target.x;
      const deltaY = candidate.y - target.y;
      if (Math.abs(deltaX) > tolerance || Math.abs(deltaY) > tolerance) {
        return;
      }
      const distance = deltaX * deltaX + deltaY * deltaY;
      if (distance < bestDistance) {
        bestDistance = distance;
        matchIndex = index;
      }
    });
    expect(matchIndex, `${label}: missing point near (${target.x.toFixed(2)}, ${target.y.toFixed(2)})`).toBeGreaterThanOrEqual(0);
    if (matchIndex >= 0) {
      remaining.splice(matchIndex, 1);
    }
  }
}

export function assertSelectedItemsFollowFrameTransform(
  before: StageDebugInfo,
  after: StageDebugInfo,
  label: string,
  mode: 'drag' | 'rotate' | 'resize'
) {
  const beforeFrame = requireGroupFrame(before, `${label} before`);
  const afterFrame = requireGroupFrame(after, `${label} after`);
  const beforeItems = requireSelectedItems(before, `${label} before`);
  const afterItems = requireSelectedItems(after, `${label} after`);
  const afterItemsById = new Map(afterItems.map((item) => [item.id, item] as const));
  const deltaRotation = afterFrame.rotation - beforeFrame.rotation;
  const scaleX = afterFrame.width / Math.max(beforeFrame.width, 1);
  const scaleY = afterFrame.height / Math.max(beforeFrame.height, 1);

  expect(afterItems.map((item) => item.id).sort()).toEqual(beforeItems.map((item) => item.id).sort());

  for (const beforeItem of beforeItems) {
    const afterItem = afterItemsById.get(beforeItem.id);
    expect(afterItem, `${label}: expected ${beforeItem.id} to remain selected`).toBeTruthy();
    if (!afterItem) {
      continue;
    }

    const beforePoints = itemReferencePoints(beforeItem);
    const afterPoints = itemReferencePoints(afterItem);
    for (const [key, point] of Object.entries(beforePoints)) {
      expectPointClose(afterPoints[key], mapPointBetweenFrames(point, beforeFrame, afterFrame), 4);
    }

    if (beforeItem.kind === 'line') {
      continue;
    }

    if (mode === 'resize') {
      expect(afterItem.width).toBeCloseTo(beforeItem.width * scaleX, 0);
      expect(afterItem.height).toBeCloseTo(beforeItem.height * scaleY, 0);
      expect(afterItem.rotation).toBeCloseTo(beforeItem.rotation, 1);
      continue;
    }

    expect(afterItem.width).toBeCloseTo(beforeItem.width, 1);
    expect(afterItem.height).toBeCloseTo(beforeItem.height, 1);
    if (mode === 'rotate') {
      expect(afterItem.rotation).toBeCloseTo(beforeItem.rotation + deltaRotation, 1);
    } else {
      expect(afterItem.rotation).toBeCloseTo(beforeItem.rotation, 1);
    }
  }
}

export function assertRenderItemsMatchResizePointer(
  before: RenderSnapshot,
  after: RenderSnapshot,
  handle: string,
  pointer: CanvasPoint,
  label: string
) {
  const beforeFrame = requireRenderGroupFrame(before, `${label} before`);
  const beforeItems = requireRenderSelectedItems(before, `${label} before`);
  const afterItemsById = new Map(
    requireRenderSelectedItems(after, `${label} after`).map((item) => [item.id, item] as const)
  );

  for (const beforeItem of beforeItems) {
    const afterItem = afterItemsById.get(beforeItem.id);
    expect(afterItem, `${label}: expected ${beforeItem.id} to remain selected`).toBeTruthy();
    if (!afterItem) {
      continue;
    }

    const expectedPoints = beforeItem.outlinePoints.map((point) =>
      mapPointThroughSignedResize(point, beforeFrame, handle, pointer)
    );
    expectPointSetClose(
      afterItem.outlinePoints,
      expectedPoints,
      `${label}: ${beforeItem.id}`
    );
  }
}

export function assertGroupFrameTightlyWrapsSelectedItems(debug: StageDebugInfo, label: string) {
  const frame = requireGroupFrame(debug, label);
  const center = frameCenter(frame);
  const localPoints = requireSelectedItems(debug, label)
    .flatMap((item) => itemOutlinePoints(item))
    .map((point) => stageToLocal(point, center, frame.rotation));

  const minX = Math.min(...localPoints.map((point) => point.x));
  const maxX = Math.max(...localPoints.map((point) => point.x));
  const minY = Math.min(...localPoints.map((point) => point.y));
  const maxY = Math.max(...localPoints.map((point) => point.y));

  expect(minX).toBeCloseTo(-frame.width / 2, 1);
  expect(maxX).toBeCloseTo(frame.width / 2, 1);
  expect(minY).toBeCloseTo(-frame.height / 2, 1);
  expect(maxY).toBeCloseTo(frame.height / 2, 1);
}

/**
 * How far (in canvas px) the group overlay frame is from tightly wrapping its
 * selected items. Returns null when there is no overlay/items to measure.
 *
 * The render snapshot reads the overlay frame from the live DOM but the item
 * geometry from a React-state closure, so mid-gesture the two can be a commit
 * apart — the frame reflects the new size while the items still hold the old
 * one, leaving a visible gap. A near-zero deviation means the closure has
 * caught up to the DOM and the snapshot is internally consistent.
 */
export function renderFrameWrapDeviation(snapshot: RenderSnapshot): number | null {
  const frame = snapshot.groupOverlay;
  const items = snapshot.selectedItems;
  if (!frame || items.length === 0) {
    return null;
  }
  const localPoints = items
    .flatMap((item) => item.outlinePoints)
    .map((point) => stageToLocal(point, frame.center, frame.rotation));
  const minX = Math.min(...localPoints.map((point) => point.x));
  const maxX = Math.max(...localPoints.map((point) => point.x));
  const minY = Math.min(...localPoints.map((point) => point.y));
  const maxY = Math.max(...localPoints.map((point) => point.y));
  return Math.max(
    Math.abs(minX + frame.width / 2),
    Math.abs(maxX - frame.width / 2),
    Math.abs(minY + frame.height / 2),
    Math.abs(maxY - frame.height / 2)
  );
}

export function assertRenderFrameTightlyWrapsItems(snapshot: RenderSnapshot, label: string) {
  const frame = requireRenderGroupFrame(snapshot, label);
  const localPoints = requireRenderSelectedItems(snapshot, label)
    .flatMap((item) => item.outlinePoints)
    .map((point) => stageToLocal(point, frame.center, frame.rotation));

  const minX = Math.min(...localPoints.map((point) => point.x));
  const maxX = Math.max(...localPoints.map((point) => point.x));
  const minY = Math.min(...localPoints.map((point) => point.y));
  const maxY = Math.max(...localPoints.map((point) => point.y));

  expect(minX).toBeCloseTo(-frame.width / 2, 1);
  expect(maxX).toBeCloseTo(frame.width / 2, 1);
  expect(minY).toBeCloseTo(-frame.height / 2, 1);
  expect(maxY).toBeCloseTo(frame.height / 2, 1);
}

export function assertRenderItemsFollowFrameTransform(
  before: RenderSnapshot,
  after: RenderSnapshot,
  label: string,
  mode: 'drag' | 'rotate' | 'resize'
) {
  const beforeFrame = requireRenderGroupFrame(before, `${label} before`);
  const afterFrame = requireRenderGroupFrame(after, `${label} after`);
  const beforeItems = requireRenderSelectedItems(before, `${label} before`);
  const afterItemsById = new Map(requireRenderSelectedItems(after, `${label} after`).map((item) => [item.id, item] as const));

  for (const beforeItem of beforeItems) {
    const afterItem = afterItemsById.get(beforeItem.id);
    expect(afterItem, `${label}: expected ${beforeItem.id} to remain selected`).toBeTruthy();
    if (!afterItem) {
      continue;
    }

    for (const [key, point] of Object.entries(renderItemReferencePoints(beforeItem))) {
      const expected = mapPointBetweenFrames(
        point,
        {
          x: beforeFrame.center.x - beforeFrame.width / 2,
          y: beforeFrame.center.y - beforeFrame.height / 2,
          width: beforeFrame.width,
          height: beforeFrame.height,
          rotation: beforeFrame.rotation,
        },
        {
          x: afterFrame.center.x - afterFrame.width / 2,
          y: afterFrame.center.y - afterFrame.height / 2,
          width: afterFrame.width,
          height: afterFrame.height,
          rotation: afterFrame.rotation,
        }
      );
      expectPointClose(renderItemReferencePoints(afterItem)[key], expected, 4);
    }

    if (beforeItem.kind === 'line') {
      continue;
    }

    if (mode === 'resize') {
      const scaleX = afterFrame.width / Math.max(beforeFrame.width, 1);
      const scaleY = afterFrame.height / Math.max(beforeFrame.height, 1);
      expect(afterItem.geometry.width).toBeCloseTo(beforeItem.geometry.width * scaleX, 0);
      expect(afterItem.geometry.height).toBeCloseTo(beforeItem.geometry.height * scaleY, 0);
    } else {
      expect(afterItem.geometry.width).toBeCloseTo(beforeItem.geometry.width, 1);
      expect(afterItem.geometry.height).toBeCloseTo(beforeItem.geometry.height, 1);
    }
  }
}

/**
 * Compute the group frame (width/height/center) that a signed resize of
 * `beforeFrame` should produce when the given handle is dragged to `pointer`.
 * This is the same math `assertRenderedResizeMatchesPointer` verifies against,
 * factored out so a poll can wait for the rendered frame to actually reach it.
 */
export function expectedResizeFrame(
  beforeFrame: RenderGroupFrame,
  handle: string,
  pointer: CanvasPoint
): { width: number; height: number; center: CanvasPoint } {
  const localPointer = stageToLocal(pointer, beforeFrame.center, beforeFrame.rotation);
  let left = -beforeFrame.width / 2;
  let right = beforeFrame.width / 2;
  let top = -beforeFrame.height / 2;
  let bottom = beforeFrame.height / 2;

  if (handle.includes('left')) {
    left = localPointer.x;
  }
  if (handle.includes('right')) {
    right = localPointer.x;
  }
  if (handle.includes('top')) {
    top = localPointer.y;
  }
  if (handle.includes('bottom')) {
    bottom = localPointer.y;
  }
  if (handle === 'top-center' || handle === 'bottom-center') {
    left = -beforeFrame.width / 2;
    right = beforeFrame.width / 2;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    top = -beforeFrame.height / 2;
    bottom = beforeFrame.height / 2;
  }

  const normalizedLeft = Math.min(left, right);
  const normalizedRight = Math.max(left, right);
  const normalizedTop = Math.min(top, bottom);
  const normalizedBottom = Math.max(top, bottom);
  return {
    width: Math.max(1, normalizedRight - normalizedLeft),
    height: Math.max(1, normalizedBottom - normalizedTop),
    center: localToStage(
      {
        x: (normalizedLeft + normalizedRight) / 2,
        y: (normalizedTop + normalizedBottom) / 2,
      },
      beforeFrame.center,
      beforeFrame.rotation
    ),
  };
}

export function assertRenderedResizeMatchesPointer(
  before: RenderSnapshot,
  after: RenderSnapshot,
  handle: string,
  pointer: CanvasPoint,
  label: string,
  sizeTolerance = 2.5
) {
  const beforeFrame = requireRenderGroupFrame(before, `${label} before`);
  const afterFrame = requireRenderGroupFrame(after, `${label} after`);
  const expected = expectedResizeFrame(beforeFrame, handle, pointer);

  expect(afterFrame.rotation).toBeCloseTo(beforeFrame.rotation, 1);
  expect(Math.abs(afterFrame.width - expected.width)).toBeLessThanOrEqual(sizeTolerance);
  expect(Math.abs(afterFrame.height - expected.height)).toBeLessThanOrEqual(sizeTolerance);
  expectPointClose(afterFrame.center, expected.center, 3);
}

// Matches the per-axis tolerance of `assertRenderFrameTightlyWrapsItems`
// (`toBeCloseTo(_, 1)` ⇒ < 0.05), so a snapshot that clears the convergence
// gate also clears that assertion.
const FRAME_WRAP_CONSISTENCY_TOLERANCE = 0.05;

// Minimum overlay-center shift (canvas px) that proves a group drag actually
// landed, versus a stale pre-move commit whose center hasn't budged. Well
// below any drag the specs perform and well above measurement noise.
const GROUP_DRAG_MIN_SHIFT = 20;

/**
 * True when the snapshot's DOM-sourced overlay frame tightly wraps its
 * closure-sourced items — i.e. the two data sources are from the same commit.
 * A skewed snapshot (frame a commit ahead of its items) is what makes the
 * item-following assertions flake under load, so callers gate on this.
 */
export function isRenderSnapshotSelfConsistent(snapshot: RenderSnapshot): boolean {
  const deviation = renderFrameWrapDeviation(snapshot);
  return deviation !== null && deviation < FRAME_WRAP_CONSISTENCY_TOLERANCE;
}

/**
 * Move the pointer to `pointer` during an in-progress group resize and return
 * the rendered snapshot once its geometry actually reflects that pointer.
 *
 * Why this exists: the editor coalesces gesture updates to one React commit
 * per animation frame (`updateSession` in useCanvasInteractionSession), and
 * the render snapshot reads that committed React state — not the live pointer.
 * `session.kind` flips to 'group-resize' on the *first* commit after the
 * gesture begins (before the move lands), so polling only on `sessionKind`
 * can read a stale, zero-delta frame under parallel/SwiftShader load where
 * animation frames are irregular. Instead we dispatch the move once and poll
 * (reads only) until the rendered frame converges on the pointer-derived
 * geometry — the same shape as `rotateRenderedGroupTo`, which waits on the
 * actual rotation. The poll must not re-dispatch the move: repeated moves
 * leave extra coalesced commits in flight, and the release that follows then
 * commits a frame that trails the items by a pixel or two.
 */
export async function moveGroupResizeToPointer(
  page: Page,
  before: RenderSnapshot,
  handle: string,
  pointer: CanvasPoint,
  label: string,
  sizeTolerance = 5,
  centerTolerance = 3
): Promise<RenderSnapshot> {
  const beforeFrame = requireRenderGroupFrame(before, `${label} before`);
  const expected = expectedResizeFrame(beforeFrame, handle, pointer);
  await movePointerToCanvasPoint(page, pointer);

  let converged: RenderSnapshot | null = null;
  await expect
    .poll(
      async () => {
        const snapshot = await readRenderSnapshot(page);
        const frame = snapshot.groupOverlay;
        if (snapshot.sessionKind !== 'group-resize' || !frame) {
          return false;
        }
        // The frame (read from the DOM) must both reflect the pointer *and*
        // tightly wrap the items (read from the React-state closure). Requiring
        // self-consistency keeps us from returning a snapshot whose frame has
        // advanced a commit ahead of its items — that skew is exactly what
        // makes assertRenderItemsMatchResizePointer flake under load.
        const matches =
          Math.abs(frame.width - expected.width) <= sizeTolerance &&
          Math.abs(frame.height - expected.height) <= sizeTolerance &&
          Math.abs(frame.center.x - expected.center.x) <= centerTolerance &&
          Math.abs(frame.center.y - expected.center.y) <= centerTolerance &&
          isRenderSnapshotSelfConsistent(snapshot);
        if (matches) {
          converged = snapshot;
        }
        return matches;
      },
      { message: `${label}: waiting for rendered group resize to reach the pointer` }
    )
    .toBe(true);

  if (!converged) {
    throw new Error(`${label}: group resize preview never converged on the pointer`);
  }
  return converged;
}

/**
 * Read a group-selection snapshot once it is internally consistent — i.e. the
 * DOM-sourced overlay frame tightly wraps the closure-sourced items. Use this
 * for reads taken right after a commit (post-`releasePointer`), where the item
 * closure can momentarily trail the freshly re-rendered overlay by a frame and
 * make `assertRenderFrameTightlyWrapsItems` flake.
 */
export async function readSettledGroupSnapshot(page: Page, label: string): Promise<RenderSnapshot> {
  let settled: RenderSnapshot | null = null;
  await expect
    .poll(
      async () => {
        const snapshot = await readRenderSnapshot(page);
        const ok = isRenderSnapshotSelfConsistent(snapshot);
        if (ok) {
          settled = snapshot;
        }
        return ok;
      },
      { message: `${label}: waiting for a self-consistent committed group snapshot` }
    )
    .toBe(true);

  if (!settled) {
    throw new Error(`${label}: group snapshot never settled`);
  }
  return settled;
}

/**
 * Move the pointer to `destination` during an in-progress group drag and
 * return the rendered snapshot once the drag has both landed (the overlay
 * center has shifted off its pre-drag position) and settled (frame and items
 * agree). Like `moveGroupResizeToPointer`, this replaces a bare
 * `sessionKind === 'group-drag'` gate, which can read a frame that moved a
 * commit ahead of its items and flake `assertRenderItemsFollowFrameTransform`.
 */
export async function moveGroupDragToPointer(
  page: Page,
  before: RenderSnapshot,
  destination: CanvasPoint,
  label: string
): Promise<RenderSnapshot> {
  const beforeFrame = requireRenderGroupFrame(before, `${label} before`);
  await movePointerToCanvasPoint(page, destination);

  let converged: RenderSnapshot | null = null;
  await expect
    .poll(
      async () => {
        const snapshot = await readRenderSnapshot(page);
        const frame = snapshot.groupOverlay;
        if (snapshot.sessionKind !== 'group-drag' || !frame) {
          return false;
        }
        const shift = Math.hypot(
          frame.center.x - beforeFrame.center.x,
          frame.center.y - beforeFrame.center.y
        );
        const ok = shift > GROUP_DRAG_MIN_SHIFT && isRenderSnapshotSelfConsistent(snapshot);
        if (ok) {
          converged = snapshot;
        }
        return ok;
      },
      { message: `${label}: waiting for the group drag to land and settle` }
    )
    .toBe(true);

  if (!converged) {
    throw new Error(`${label}: group drag preview never settled`);
  }
  return converged;
}

/**
 * Poll during (or right after) a group gesture until the rendered overlay
 * frame satisfies `predicate`, then return that snapshot. Use it for snapped
 * gestures whose settled geometry is a known guide value rather than the raw
 * pointer: gating on `sessionKind` alone reads whatever frame the first
 * coalesced commit happened to carry — often the pre-snap (or pre-move) one —
 * so the assertion sees a half-finished transform under load. Pass
 * `expectedSessionKind` to also require an active/'null' session phase.
 */
export async function readGroupFrameWhen(
  page: Page,
  predicate: (frame: RenderGroupFrame) => boolean,
  label: string,
  expectedSessionKind?: string | null
): Promise<RenderSnapshot> {
  let matched: RenderSnapshot | null = null;
  await expect
    .poll(
      async () => {
        const snapshot = await readRenderSnapshot(page);
        const frame = snapshot.groupOverlay;
        if (!frame) {
          return false;
        }
        if (expectedSessionKind !== undefined && snapshot.sessionKind !== expectedSessionKind) {
          return false;
        }
        const ok = predicate(frame);
        if (ok) {
          matched = snapshot;
        }
        return ok;
      },
      { message: `${label}: waiting for the rendered group frame to settle` }
    )
    .toBe(true);

  if (!matched) {
    throw new Error(`${label}: group frame never settled`);
  }
  return matched;
}

export async function rotateRenderedGroupTo(page: Page, targetRotationDegrees: number) {
  const beforeRotate = await readRenderSnapshot(page);
  const initialFrame = requireRenderGroupFrame(beforeRotate, 'before rotating rendered group');

  await beginGroupHandleDrag(page, 'rotater');
  await movePointerToCanvasPoint(page, rotaterDestination({
    x: initialFrame.center.x - initialFrame.width / 2,
    y: initialFrame.center.y - initialFrame.height / 2,
    width: initialFrame.width,
    height: initialFrame.height,
    rotation: initialFrame.rotation,
  }, targetRotationDegrees));
  await expect
    .poll(async () => Math.abs((await readRenderSnapshot(page)).groupOverlay?.rotation ?? 0))
    .toBeGreaterThan(Math.abs(targetRotationDegrees) - 5);

  const rotatePreview = await readRenderSnapshot(page);
  assertRenderSelectionUiVisible(rotatePreview, `rotation ${targetRotationDegrees} preview`);
  assertRenderItemsFollowFrameTransform(beforeRotate, rotatePreview, `rotation ${targetRotationDegrees} preview`, 'rotate');
  assertRenderFrameTightlyWrapsItems(rotatePreview, `rotation ${targetRotationDegrees} preview`);

  await releasePointer(page);
  return readRenderSnapshot(page);
}

export async function rotateGroupTo(page: Page, targetRotationDegrees: number) {
  const beforeRotate = await readStageDebug(page);
  const initialFrame = requireGroupFrame(beforeRotate, 'before rotating group');

  await beginGroupHandleDrag(page, 'rotater');
  await movePointerToCanvasPoint(page, rotaterDestination(initialFrame, targetRotationDegrees));
  await expect
    .poll(async () => Math.abs((await readStageDebug(page)).groupFrame?.rotation ?? 0))
    .toBeGreaterThan(Math.abs(targetRotationDegrees) - 5);

  const rotatePreview = await readStageDebug(page);
  assertFiniteGeometry(rotatePreview, `rotation ${targetRotationDegrees} preview`);
  assertGroupOverlayGeometry(rotatePreview, `rotation ${targetRotationDegrees} preview`);
  assertSelectedItemsFollowFrameTransform(
    beforeRotate,
    rotatePreview,
    `rotation ${targetRotationDegrees} preview`,
    'rotate'
  );

  await releasePointer(page);

  const afterRotate = await readStageDebug(page);
  assertFiniteGeometry(afterRotate, `rotation ${targetRotationDegrees} commit`);
  assertGroupOverlayGeometry(afterRotate, `rotation ${targetRotationDegrees} commit`);
  assertSelectedItemsFollowFrameTransform(
    beforeRotate,
    afterRotate,
    `rotation ${targetRotationDegrees} commit`,
    'rotate'
  );
  assertGroupFrameTightlyWrapsSelectedItems(afterRotate, `rotation ${targetRotationDegrees} commit`);
  return afterRotate;
}
