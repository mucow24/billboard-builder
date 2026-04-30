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
  const expectedCenter = localToStage(
    {
      x: (normalizedLeft + normalizedRight) / 2,
      y: (normalizedTop + normalizedBottom) / 2,
    },
    beforeFrame.center,
    beforeFrame.rotation
  );

  expect(afterFrame.rotation).toBeCloseTo(beforeFrame.rotation, 1);
  expect(Math.abs(afterFrame.width - Math.max(1, normalizedRight - normalizedLeft))).toBeLessThanOrEqual(sizeTolerance);
  expect(Math.abs(afterFrame.height - Math.max(1, normalizedBottom - normalizedTop))).toBeLessThanOrEqual(sizeTolerance);
  expectPointClose(afterFrame.center, expectedCenter, 3);
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
