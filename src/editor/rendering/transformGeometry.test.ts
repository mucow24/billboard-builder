import { describe, expect, it } from 'vitest';

import {
  buildGroupDragPreviews,
  buildGroupResizePreviews,
  buildGroupRotatePreviews,
  getGroupResizeBounds,
  getItemSelectionPoints,
  getRenderBox,
  getSelectionFrameForRotation,
  getResizedBoundsFromHandle,
  getSelectionRenderBounds,
  itemIntersectsSelectionRect,
  translateRenderBox,
} from './transformGeometry';
import {
  createEllipseItem,
  createLineItem,
  createRectangleItem,
} from '../document/documentDefaults';
import type { CanvasItem } from '../document/documentTypes';

function rotatePoint(point: { x: number; y: number }, origin: { x: number; y: number }, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + (point.x - origin.x) * cos - (point.y - origin.y) * sin,
    y: origin.y + (point.x - origin.x) * sin + (point.y - origin.y) * cos,
  };
}

function mapPointBetweenFrames(
  point: { x: number; y: number },
  fromFrame: { bounds: { x: number; y: number; width: number; height: number }; rotation: number },
  toFrame: { bounds: { x: number; y: number; width: number; height: number }; rotation: number }
) {
  const fromCenter = {
    x: fromFrame.bounds.x + fromFrame.bounds.width / 2,
    y: fromFrame.bounds.y + fromFrame.bounds.height / 2,
  };
  const toCenter = {
    x: toFrame.bounds.x + toFrame.bounds.width / 2,
    y: toFrame.bounds.y + toFrame.bounds.height / 2,
  };
  const local = rotatePoint(point, fromCenter, -fromFrame.rotation);
  const normalized = {
    x: (local.x - fromFrame.bounds.x) / Math.max(fromFrame.bounds.width, 1),
    y: (local.y - fromFrame.bounds.y) / Math.max(fromFrame.bounds.height, 1),
  };
  return rotatePoint(
    {
      x: toFrame.bounds.x + normalized.x * toFrame.bounds.width,
      y: toFrame.bounds.y + normalized.y * toFrame.bounds.height,
    },
    toCenter,
    toFrame.rotation
  );
}

function stageToLocal(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number
) {
  return {
    x: rotatePoint(point, origin, -rotation).x - origin.x,
    y: rotatePoint(point, origin, -rotation).y - origin.y,
  };
}

function localToStage(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotation: number
) {
  return rotatePoint(
    {
      x: origin.x + point.x,
      y: origin.y + point.y,
    },
    origin,
    rotation
  );
}

function getSignedResizeAxes(
  bounds: { x: number; y: number; width: number; height: number },
  rotation: number,
  handle: string,
  currentPointer: { x: number; y: number }
) {
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const localPointer = stageToLocal(currentPointer, center, rotation);
  let left = -bounds.width / 2;
  let right = bounds.width / 2;
  let top = -bounds.height / 2;
  let bottom = bounds.height / 2;

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
    left = -bounds.width / 2;
    right = bounds.width / 2;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    top = -bounds.height / 2;
    bottom = bounds.height / 2;
  }

  return {
    center,
    rotation,
    left,
    right,
    top,
    bottom,
  };
}

function mapPointThroughSignedResize(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
  rotation: number,
  handle: string,
  currentPointer: { x: number; y: number }
) {
  const axes = getSignedResizeAxes(bounds, rotation, handle, currentPointer);
  const local = stageToLocal(point, axes.center, rotation);
  const normalized = {
    x: (local.x + bounds.width / 2) / Math.max(bounds.width, 1),
    y: (local.y + bounds.height / 2) / Math.max(bounds.height, 1),
  };
  return localToStage(
    {
      x: axes.left + (axes.right - axes.left) * normalized.x,
      y: axes.top + (axes.bottom - axes.top) * normalized.y,
    },
    axes.center,
    rotation
  );
}

function expectPointSetClose(
  actual: Array<{ x: number; y: number }>,
  expected: Array<{ x: number; y: number }>,
  tolerance = 5
) {
  expect(actual).toHaveLength(expected.length);
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
    expect(matchIndex).toBeGreaterThanOrEqual(0);
    if (matchIndex >= 0) {
      remaining.splice(matchIndex, 1);
    }
  }
}

function expectedFrameFromHandleDrag(
  bounds: { x: number; y: number; width: number; height: number },
  rotation: number,
  handle: string,
  currentPointer: { x: number; y: number }
) {
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const localPointer = rotatePoint(currentPointer, center, -rotation);
  let left = bounds.x;
  let right = bounds.x + bounds.width;
  let top = bounds.y;
  let bottom = bounds.y + bounds.height;

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
    left = bounds.x;
    right = bounds.x + bounds.width;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    top = bounds.y;
    bottom = bounds.y + bounds.height;
  }

  const normalizedLeft = Math.min(left, right);
  const normalizedRight = Math.max(left, right);
  const normalizedTop = Math.min(top, bottom);
  const normalizedBottom = Math.max(top, bottom);
  const localCenter = {
    x: (normalizedLeft + normalizedRight) / 2,
    y: (normalizedTop + normalizedBottom) / 2,
  };
  const stageCenter = rotatePoint(localCenter, center, rotation);

  return {
    bounds: {
      x: stageCenter.x - (normalizedRight - normalizedLeft) / 2,
      y: stageCenter.y - (normalizedBottom - normalizedTop) / 2,
      width: normalizedRight - normalizedLeft,
      height: normalizedBottom - normalizedTop,
    },
    rotation,
  };
}

function itemOutlinePoints(item: CanvasItem) {
  if (item.kind === 'line') {
    return [
      { x: item.startX, y: item.startY },
      { x: item.endX, y: item.endY },
    ];
  }
  const corners = [
    { x: 0, y: 0 },
    { x: item.width, y: 0 },
    { x: item.width, y: item.height },
    { x: 0, y: item.height },
  ];
  return corners.map((corner) => rotatePoint({ x: item.x + corner.x, y: item.y + corner.y }, { x: item.x, y: item.y }, item.rotation));
}

function assertFrameTightAroundItems(
  items: CanvasItem[],
  frame: { bounds: { x: number; y: number; width: number; height: number }; rotation: number }
) {
  const center = {
    x: frame.bounds.x + frame.bounds.width / 2,
    y: frame.bounds.y + frame.bounds.height / 2,
  };
  const localPoints = items
    .flatMap((item) => itemOutlinePoints(item))
    .map((point) => rotatePoint(point, center, -frame.rotation));
  const xs = localPoints.map((point) => point.x);
  const ys = localPoints.map((point) => point.y);
  expect(Math.min(...xs)).toBeCloseTo(frame.bounds.x, 1);
  expect(Math.max(...xs)).toBeCloseTo(frame.bounds.x + frame.bounds.width, 1);
  expect(Math.min(...ys)).toBeCloseTo(frame.bounds.y, 1);
  expect(Math.max(...ys)).toBeCloseTo(frame.bounds.y + frame.bounds.height, 1);
}

describe('transform geometry helpers', () => {
  it('derives a top-left render box for ellipse and rectangle items', () => {
    const rectangle = createRectangleItem({ x: 100, y: 200, width: 240, height: 80 });
    const ellipse = createEllipseItem({ x: 100, y: 200, width: 240, height: 80 });

    expect(getRenderBox(rectangle)).toEqual({
      x: 100,
      y: 200,
      width: 240,
      height: 80,
    });
    expect(getRenderBox(ellipse)).toEqual({
      x: 100,
      y: 200,
      width: 240,
      height: 80,
    });
  });

  it('computes a render box for line items', () => {
    const line = createLineItem({
      startX: 240,
      startY: 120,
      endX: 160,
      endY: 150,
    });

    expect(getRenderBox(line)).toEqual({
      x: 160,
      y: 120,
      width: 80,
      height: 30,
    });
  });

  it('offsets every item in a dragged group, including line endpoints', () => {
    const rectangle = createRectangleItem({ x: 100, y: 120, width: 80, height: 40 });
    const line = createLineItem({ startX: 160, startY: 140, endX: 260, endY: 180 });

    const previews = buildGroupDragPreviews([rectangle, line], 25, -15);

    expect(previews[0]).toMatchObject({
      x: 125,
      y: 105,
    });
    expect(previews[1]).toMatchObject({
      startX: 185,
      startY: 125,
      endX: 285,
      endY: 165,
      x: 145,
      y: 105,
    });
  });

  it('normalizes resized bounds from side handles and flipped drags', () => {
    const bounds = { x: 100, y: 80, width: 200, height: 120 };

    expect(
      getResizedBoundsFromHandle(bounds, 'middle-right', { x: 360, y: 500 })
    ).toEqual({
      x: 100,
      y: 80,
      width: 260,
      height: 120,
    });
    expect(
      getResizedBoundsFromHandle(bounds, 'top-left', { x: 340, y: 260 })
    ).toEqual({
      x: 300,
      y: 200,
      width: 40,
      height: 60,
    });
  });

  it('resizes group previews proportionally for shapes and lines', () => {
    const rectangle = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const line = createLineItem({ startX: 180, startY: 100, endX: 260, endY: 140 });
    const bounds = { x: 100, y: 100, width: 160, height: 40 };

    const previews = buildGroupResizePreviews(
      [rectangle, line],
      bounds,
      'middle-right',
      { x: 340, y: 120 }
    );

    expect(previews[0]).toMatchObject({
      x: 100,
      y: 100,
      width: 120,
      height: 40,
    });
    expect(previews[1]).toMatchObject({
      startX: 220,
      startY: 100,
      endX: 340,
      endY: 140,
      x: 220,
      y: 100,
      width: 120,
      height: 40,
    });
  });

  it('resizes a rotated group along the rotated frame rather than world axes', () => {
    const first = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ x: 220, y: 100, width: 80, height: 40 });
    const bounds = { x: 100, y: 100, width: 200, height: 40 };
    const center = { x: 200, y: 120 };
    const rotatedItems = buildGroupRotatePreviews(
      [first, second],
      bounds,
      { x: center.x, y: center.y - 100 },
      { x: center.x + 100, y: center.y }
    );

    const previews = buildGroupResizePreviews(
      rotatedItems,
      bounds,
      'middle-right',
      { x: center.x, y: center.y + bounds.width / 2 + 80 },
      90
    );
    const previewFrame = getSelectionFrameForRotation(previews, 90);
    const expectedFrame = expectedFrameFromHandleDrag(
      bounds,
      90,
      'middle-right',
      { x: center.x, y: center.y + bounds.width / 2 + 80 }
    );

    expect(previewFrame).toEqual(expectedFrame);
  });

  it('translates group frames without recomputing from rendered item bounds', () => {
    expect(translateRenderBox({ x: 100, y: 120, width: 200, height: 40 }, 30, 50)).toEqual({
      x: 130,
      y: 170,
      width: 200,
      height: 40,
    });
  });

  it('computes rotated group resize bounds in frame-local coordinates', () => {
    const bounds = { x: 100, y: 100, width: 200, height: 40 };
    const center = { x: 200, y: 120 };

    expect(
      getGroupResizeBounds(
        bounds,
        'middle-right',
        { x: center.x, y: center.y + bounds.width / 2 + 80 },
        90
      )
    ).toEqual({
      x: 60,
      y: 140,
      width: 280,
      height: 40,
    });
  });

  it('derives a tight rotated selection frame from transformed items', () => {
    const first = createRectangleItem({
      x: 491.95742541744534,
      y: 149.67908016820786,
      width: 162.60692115950522,
      height: 64,
      rotation: 121.16557781446062,
    });
    const second = createRectangleItem({
      x: 317.47841164755494,
      y: 360.87644284358583,
      width: 149.05634439621312,
      height: 58,
      rotation: 121.16557781446062,
    });

    expect(
      getSelectionFrameForRotation(
        [first, second],
        121.16557781446062,
        { x: 424.8487546458423, y: 256.9506172839506 }
      )
    ).toEqual({
      bounds: expect.objectContaining({
        width: expect.closeTo(420.06787966205513, 5),
        height: expect.closeTo(98, 5),
      }),
      rotation: 121.16557781446062,
    });
  });

  it('maps rotated group resize previews into the resized frame instead of the original frame center', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createLineItem({ id: 'second', startX: 220, startY: 100, endX: 300, endY: 140 });
    const bounds = { x: 100, y: 100, width: 200, height: 40 };
    const rotatedFrame = { bounds, rotation: 90 };

    const rotatedItems = buildGroupRotatePreviews(
      [first, second],
      bounds,
      { x: 200, y: 20 },
      { x: 300, y: 120 }
    );
    const previews = buildGroupResizePreviews(
      rotatedItems,
      bounds,
      'middle-right',
      { x: 200, y: 300 },
      90
    );
    const resizedFrame = expectedFrameFromHandleDrag(bounds, 90, 'middle-right', { x: 200, y: 300 });

    expect(getSelectionFrameForRotation(previews, 90)).toEqual(resizedFrame);

    if (previews[1].kind !== 'line' || rotatedItems[1].kind !== 'line') {
      throw new Error('Expected line previews.');
    }

    expect(previews[1].startX).toBeCloseTo(
      mapPointBetweenFrames(
        { x: rotatedItems[1].startX, y: rotatedItems[1].startY },
        rotatedFrame,
        resizedFrame
      ).x,
      5
    );
    expect(previews[1].startY).toBeCloseTo(
      mapPointBetweenFrames(
        { x: rotatedItems[1].startX, y: rotatedItems[1].startY },
        rotatedFrame,
        resizedFrame
      ).y,
      5
    );
    expect(previews[1].endX).toBeCloseTo(
      mapPointBetweenFrames(
        { x: rotatedItems[1].endX, y: rotatedItems[1].endY },
        rotatedFrame,
        resizedFrame
      ).x,
      5
    );
    expect(previews[1].endY).toBeCloseTo(
      mapPointBetweenFrames(
        { x: rotatedItems[1].endX, y: rotatedItems[1].endY },
        rotatedFrame,
        resizedFrame
      ).y,
      5
    );
  });

  it('keeps the rotated resize preview frame anchored to the dragged handle path', () => {
    const first = createRectangleItem({ x: 120, y: 140, width: 120, height: 64 });
    const second = createRectangleItem({ x: 320, y: 180, width: 110, height: 58 });
    const bounds = { x: 120, y: 140, width: 310, height: 98 };
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const radians = (61 * Math.PI) / 180;
    const rotatedItems = buildGroupRotatePreviews(
      [first, second],
      bounds,
      { x: center.x, y: center.y - 120 },
      { x: center.x + 120 * Math.sin(radians), y: center.y - 120 * Math.cos(radians) }
    );
    const pointer = { x: center.x + 50, y: center.y + 160 };
    const previews = buildGroupResizePreviews(
      rotatedItems,
      bounds,
      'middle-right',
      pointer,
      61
    );
    const previewFrame = getSelectionFrameForRotation(previews, 61);
    const expectedBounds = expectedFrameFromHandleDrag(bounds, 61, 'middle-right', pointer).bounds;

    expect(previewFrame).toEqual({
      bounds: expect.objectContaining({
        x: expect.closeTo(expectedBounds.x, 5),
        y: expect.closeTo(expectedBounds.y, 5),
        width: expect.closeTo(expectedBounds.width, 5),
        height: expect.closeTo(expectedBounds.height, 5),
      }),
      rotation: 61,
    });
  });

  it('rotates group previews for shapes and lines and snaps when requested', () => {
    const rectangle = createRectangleItem({ x: 100, y: 100, width: 80, height: 40 });
    const line = createLineItem({ startX: 180, startY: 120, endX: 260, endY: 120 });
    const bounds = getSelectionRenderBounds([rectangle, line]);
    if (!bounds) {
      throw new Error('Expected selection bounds');
    }

    const previews = buildGroupRotatePreviews(
      [rectangle, line],
      bounds,
      { x: bounds.x + bounds.width / 2, y: bounds.y - 100 },
      { x: bounds.x + bounds.width / 2 + 100, y: bounds.y + bounds.height / 2 },
      true
    );

    expect(previews[0]).toMatchObject({
      rotation: 90,
    });
    expect(previews[1]).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it('detects selection intersections for rotated shapes and crossing lines', () => {
    const rotated = createRectangleItem({
      x: 120,
      y: 120,
      width: 80,
      height: 40,
      rotation: 45,
    });
    const line = createLineItem({
      startX: 20,
      startY: 160,
      endX: 220,
      endY: 160,
    });

    expect(
      itemIntersectsSelectionRect(rotated, { x: 150, y: 130, width: 20, height: 20 })
    ).toBe(true);
    expect(
      itemIntersectsSelectionRect(line, { x: 100, y: 150, width: 20, height: 20 })
    ).toBe(true);
    expect(
      itemIntersectsSelectionRect(rotated, { x: 260, y: 260, width: 20, height: 20 })
    ).toBe(false);
  });

  it('keeps rotated group resize previews tight across handle and angle matrices', () => {
    const handles = [
      'top-left',
      'top-center',
      'top-right',
      'middle-left',
      'middle-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ] as const;
    const angles = [17, 61, 121];
    const baseItems = [
      createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 }),
      createRectangleItem({ id: 'second', x: 240, y: 130, width: 60, height: 70 }),
      createLineItem({ id: 'third', startX: 190, startY: 90, endX: 330, endY: 210 }),
    ];
    const bounds = getSelectionRenderBounds(baseItems);
    if (!bounds) {
      throw new Error('Expected base selection bounds.');
    }

    for (const angle of angles) {
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const rotatedItems = buildGroupRotatePreviews(
        baseItems,
        bounds,
        { x: center.x, y: center.y - 120 },
        rotatePoint({ x: center.x, y: center.y - 120 }, center, angle)
      );

      for (const handle of handles) {
        const pointer = {
          x: center.x + (handle.includes('left') ? -120 : handle.includes('right') ? 120 : 0),
          y: center.y + (handle.includes('top') ? -90 : handle.includes('bottom') ? 90 : 0),
        };
        const previews = buildGroupResizePreviews(rotatedItems, bounds, handle, pointer, angle);
        const frame = getSelectionFrameForRotation(previews, angle, center);
        expect(frame, `expected a frame for ${handle} at ${angle} degrees`).toBeTruthy();
        if (!frame) {
          continue;
        }
        assertFrameTightAroundItems(previews, frame);
      }
    }
  });

  it('maps frame-aligned shape corners through group resize previews instead of scaling only the top-left box', () => {
    const item = createRectangleItem({
      x: 160,
      y: 120,
      width: 100,
      height: 60,
      rotation: 0,
    });
    const bounds = { x: 100, y: 100, width: 240, height: 160 };
    const nextBounds = getResizedBoundsFromHandle(bounds, 'middle-right', { x: 420, y: 180 });
    const preview = buildGroupResizePreviews([item], bounds, 'middle-right', { x: 420, y: 180 })[0];
    if (preview.kind === 'line') {
      throw new Error('Expected a rectangle preview.');
    }

    const expectedCorners = getItemSelectionPoints(item).map((point) =>
      mapPointBetweenFrames(
        point,
        { bounds, rotation: 0 },
        { bounds: nextBounds, rotation: 0 }
      )
    );
    const previewCorners = getItemSelectionPoints(preview);

    previewCorners.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expectedCorners[index].x, 5);
      expect(point.y).toBeCloseTo(expectedCorners[index].y, 5);
    });
  });

  it('keeps rotated group resize previews following signed handle motion after crossing the center', () => {
    const baseItems = [
      createRectangleItem({ id: 'first', x: 120, y: 140, width: 120, height: 64 }),
      createRectangleItem({ id: 'second', x: 320, y: 180, width: 110, height: 58 }),
    ];
    const bounds = { x: 120, y: 140, width: 310, height: 98 };
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const angle = 61;
    const rotatedItems = buildGroupRotatePreviews(
      baseItems,
      bounds,
      { x: center.x, y: center.y - 120 },
      rotatePoint({ x: center.x, y: center.y - 120 }, center, angle)
    );
    const currentPointer = localToStage({ x: 0, y: 71 }, center, angle);
    const previews = buildGroupResizePreviews(
      rotatedItems,
      bounds,
      'top-center',
      currentPointer,
      angle
    );

    previews.forEach((preview, index) => {
      const expectedPoints = getItemSelectionPoints(rotatedItems[index]).map((point) =>
        mapPointThroughSignedResize(point, bounds, angle, 'top-center', currentPointer)
      );
      expectPointSetClose(getItemSelectionPoints(preview), expectedPoints);
    });
  });
});
