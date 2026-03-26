import {
  createEllipseItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  ImageCanvasItem,
  LineCanvasItem,
  SnapRect,
} from '../document/documentTypes';
import { getRenderBox } from './transformGeometry';
import { getItemRect, getSnappedRect, SNAP_THRESHOLD } from './snapping';
import { measureWordWrappedTextHeight } from './textMeasurement';

export interface Point {
  x: number;
  y: number;
}

export type ResizeHandle =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type InteractionHandle = ResizeHandle | 'rotater' | 'start' | 'end';

export interface InteractionItemPreview {
  item: CanvasItem;
  guides: GuideLine[];
}

const HANDLE_SIZE = 16;
const ROTATE_HANDLE_OFFSET = 50;
const CREATE_CLICK_THRESHOLD = 4;

export const RESIZE_HANDLE_NAMES: ResizeHandle[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

function toRadians(rotation: number) {
  return (rotation * Math.PI) / 180;
}

export function rotateVector(point: Point, rotation: number): Point {
  const angle = toRadians(rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function stageToLocal(
  point: Point,
  origin: Point,
  rotation: number
): Point {
  return rotateVector(
    {
      x: point.x - origin.x,
      y: point.y - origin.y,
    },
    -rotation
  );
}

export function localToStage(
  point: Point,
  origin: Point,
  rotation: number
): Point {
  const rotated = rotateVector(point, rotation);
  return {
    x: origin.x + rotated.x,
    y: origin.y + rotated.y,
  };
}

function normalizeBounds(
  left: number,
  top: number,
  right: number,
  bottom: number
) {
  return {
    left: Math.min(left, right),
    right: Math.max(left, right),
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
  };
}

function rectFromBounds(bounds: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}) {
  return {
    x: bounds.left,
    y: bounds.top,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top),
  };
}

export function getShapeHandlePoints(
  item: Exclude<CanvasItem, LineCanvasItem>
) {
  const renderBox = getRenderBox(item);
  const origin = { x: renderBox.x, y: renderBox.y };
  const width = renderBox.width;
  const height = renderBox.height;

  const localPoints: Record<ResizeHandle | 'rotater', Point> = {
    'top-left': { x: 0, y: 0 },
    'top-center': { x: width / 2, y: 0 },
    'top-right': { x: width, y: 0 },
    'middle-left': { x: 0, y: height / 2 },
    'middle-right': { x: width, y: height / 2 },
    'bottom-left': { x: 0, y: height },
    'bottom-center': { x: width / 2, y: height },
    'bottom-right': { x: width, y: height },
    rotater: { x: width / 2, y: -ROTATE_HANDLE_OFFSET },
  };

  return Object.fromEntries(
    Object.entries(localPoints).map(([name, point]) => [
      name,
      localToStage(point, origin, item.rotation),
    ])
  ) as Record<ResizeHandle | 'rotater', Point>;
}

export function getShapeHandleRects(
  item: Exclude<CanvasItem, LineCanvasItem>
) {
  const points = getShapeHandlePoints(item);
  return Object.fromEntries(
    Object.entries(points).map(([name, point]) => [
      name,
      {
        x: point.x - HANDLE_SIZE / 2,
        y: point.y - HANDLE_SIZE / 2,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      },
    ])
  ) as Record<ResizeHandle | 'rotater', SnapRect>;
}

export function getLineHandleRects(item: LineCanvasItem) {
  return {
    start: {
      x: item.startX - HANDLE_SIZE / 2,
      y: item.startY - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    },
    end: {
      x: item.endX - HANDLE_SIZE / 2,
      y: item.endY - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    },
  };
}

export function getSelectionOutlinePoints(
  item: Exclude<CanvasItem, LineCanvasItem>
) {
  const renderBox = getRenderBox(item);
  const origin = { x: renderBox.x, y: renderBox.y };
  const corners = [
    { x: 0, y: 0 },
    { x: renderBox.width, y: 0 },
    { x: renderBox.width, y: renderBox.height },
    { x: 0, y: renderBox.height },
  ].map((point) => localToStage(point, origin, item.rotation));

  return corners.flatMap((point) => [point.x, point.y]);
}

function getCenter(item: Exclude<CanvasItem, LineCanvasItem>) {
  const renderBox = getRenderBox(item);
  return localToStage(
    {
      x: renderBox.width / 2,
      y: renderBox.height / 2,
    },
    {
      x: renderBox.x,
      y: renderBox.y,
    },
    item.rotation
  );
}

function buildSnapCandidates(
  siblingItems: CanvasItem[],
  stageRect: SnapRect
) {
  const vertical = [0, stageRect.width / 2, stageRect.width];
  const horizontal = [0, stageRect.height / 2, stageRect.height];

  for (const sibling of siblingItems) {
    const rect = getItemRect(sibling);
    vertical.push(rect.x, rect.x + rect.width / 2, rect.x + rect.width);
    horizontal.push(rect.y, rect.y + rect.height / 2, rect.y + rect.height);
  }

  return { vertical, horizontal };
}

function snapValue(
  value: number,
  orientation: 'vertical' | 'horizontal',
  siblingItems: CanvasItem[],
  stageRect: SnapRect,
  threshold = SNAP_THRESHOLD
) {
  const candidates = buildSnapCandidates(siblingItems, stageRect)[orientation];
  let bestDelta: number | null = null;
  let bestPosition: number | null = null;

  for (const candidate of candidates) {
    const delta = candidate - value;
    if (Math.abs(delta) > threshold) {
      continue;
    }
    if (bestDelta === null || Math.abs(delta) < Math.abs(bestDelta)) {
      bestDelta = delta;
      bestPosition = candidate;
    }
  }

  if (bestDelta === null || bestPosition === null) {
    return null;
  }

  return {
    value: value + bestDelta,
    guide: {
      orientation,
      position: bestPosition,
    } as GuideLine,
  };
}

function applyShapeFrame<T extends Exclude<CanvasItem, LineCanvasItem>>(
  item: T,
  localRect: SnapRect
): T {
  const renderBox = getRenderBox(item);
  const stageOrigin = localToStage(
    { x: localRect.x, y: localRect.y },
    { x: item.x, y: item.y },
    item.rotation
  );
  const resizedItem = {
    ...item,
    x: stageOrigin.x,
    y: stageOrigin.y,
    width: localRect.width,
    height: localRect.height,
    scaleX: 1,
    scaleY: 1,
  };

  if (item.kind !== 'image') {
    return resizedItem;
  }

  const scaleX = localRect.width / Math.max(renderBox.width, 1);
  const scaleY = localRect.height / Math.max(renderBox.height, 1);

  return {
    ...resizedItem,
    sourceTransform: {
      ...item.sourceTransform,
      x: item.sourceTransform.x * scaleX,
      y: item.sourceTransform.y * scaleY,
      width: item.sourceTransform.width * scaleX,
      height: item.sourceTransform.height * scaleY,
    },
  };
}

function withLineGeometry(
  item: LineCanvasItem,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): LineCanvasItem {
  return {
    ...item,
    startX,
    startY,
    endX,
    endY,
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.max(1, Math.abs(endX - startX)),
    height: Math.max(1, Math.abs(endY - startY)),
    scaleX: 1,
    scaleY: 1,
  };
}

export function solveDragSession(
  item: CanvasItem,
  startPointer: Point,
  currentPointer: Point,
  siblingItems: CanvasItem[],
  stageRect: SnapRect,
  snapEnabled = true,
  threshold?: number
): InteractionItemPreview {
  const deltaX = currentPointer.x - startPointer.x;
  const deltaY = currentPointer.y - startPointer.y;

  if (item.kind === 'line') {
    const rawStartX = item.startX + deltaX;
    const rawStartY = item.startY + deltaY;
    const rawEndX = item.endX + deltaX;
    const rawEndY = item.endY + deltaY;
    const rawRect = {
      x: Math.min(rawStartX, rawEndX),
      y: Math.min(rawStartY, rawEndY),
      width: Math.max(1, Math.abs(rawEndX - rawStartX)),
      height: Math.max(1, Math.abs(rawEndY - rawStartY)),
    };
    const snapped = snapEnabled ? getSnappedRect(rawRect, siblingItems, stageRect, threshold) : { rect: rawRect, guides: [] };
    const offsetX = snapped.rect.x - rawRect.x;
    const offsetY = snapped.rect.y - rawRect.y;

    return {
      item: withLineGeometry(
        item,
        rawStartX + offsetX,
        rawStartY + offsetY,
        rawEndX + offsetX,
        rawEndY + offsetY
      ),
      guides: snapped.guides,
    };
  }

  const renderBox = getRenderBox(item);
  const rawRect = {
    x: renderBox.x + deltaX,
    y: renderBox.y + deltaY,
    width: renderBox.width,
    height: renderBox.height,
  };
  const snapped = snapEnabled ? getSnappedRect(rawRect, siblingItems, stageRect, threshold) : { rect: rawRect, guides: [] };

  return {
    item: {
      ...item,
      x: snapped.rect.x,
      y: snapped.rect.y,
      scaleX: 1,
      scaleY: 1,
    },
    guides: snapped.guides,
  };
}

function applyAspectRatio(
  item: ImageCanvasItem,
  handle: ResizeHandle,
  rawEdges: { left: number; top: number; right: number; bottom: number }
) {
  if (
    handle === 'top-center' ||
    handle === 'middle-left' ||
    handle === 'middle-right' ||
    handle === 'bottom-center'
  ) {
    return rawEdges;
  }

  const ratio = item.width / item.height;
  const fixedX = handle.includes('left') ? item.width : 0;
  const fixedY = handle.startsWith('top') ? item.height : 0;
  let width = Math.abs(rawEdges.right - rawEdges.left);
  let height = Math.abs(rawEdges.bottom - rawEdges.top);

  if (height === 0 || width / height > ratio) {
    height = width / ratio;
  } else {
    width = height * ratio;
  }

  return {
    left: handle.includes('left') ? fixedX - width : 0,
    right: handle.includes('left') ? fixedX : width,
    top: handle.startsWith('top') ? fixedY - height : 0,
    bottom: handle.startsWith('top') ? fixedY : height,
  };
}

export function solveResizeSession(
  item: Exclude<CanvasItem, LineCanvasItem>,
  handle: ResizeHandle,
  pointer: Point,
  pointerOffset: Point,
  siblingItems: CanvasItem[],
  stageRect: SnapRect,
  snapEnabled = true,
  threshold?: number
): InteractionItemPreview {
  const renderBox = getRenderBox(item);
  const adjustedPointer = {
    x: pointer.x - pointerOffset.x,
    y: pointer.y - pointerOffset.y,
  };
  const localPoint = stageToLocal(
    adjustedPointer,
    { x: renderBox.x, y: renderBox.y },
    item.rotation
  );
  const rawEdges = {
    left: 0,
    top: 0,
    right: renderBox.width,
    bottom: renderBox.height,
  };

  if (handle.includes('left')) {
    rawEdges.left = localPoint.x;
  }
  if (handle.includes('right')) {
    rawEdges.right = localPoint.x;
  }
  if (handle.startsWith('top')) {
    rawEdges.top = localPoint.y;
  }
  if (handle.startsWith('bottom')) {
    rawEdges.bottom = localPoint.y;
  }
  if (handle === 'top-center') {
    rawEdges.top = localPoint.y;
  }
  if (handle === 'bottom-center') {
    rawEdges.bottom = localPoint.y;
  }
  if (handle === 'middle-left') {
    rawEdges.left = localPoint.x;
  }
  if (handle === 'middle-right') {
    rawEdges.right = localPoint.x;
  }

  const ratioEdges =
    item.kind === 'image' && item.preserveAspectRatio
      ? applyAspectRatio(item, handle, rawEdges)
      : rawEdges;

  const guides: GuideLine[] = [];
  if (snapEnabled && Math.abs(item.rotation) < 0.001) {
    if (handle.includes('left') || handle === 'middle-left') {
      const snapped = snapValue(
        renderBox.x + ratioEdges.left,
        'vertical',
        siblingItems,
        stageRect,
        threshold
      );
      if (snapped) {
        ratioEdges.left = snapped.value - renderBox.x;
        guides.push(snapped.guide);
      }
    }
    if (handle.includes('right') || handle === 'middle-right') {
      const snapped = snapValue(
        renderBox.x + ratioEdges.right,
        'vertical',
        siblingItems,
        stageRect,
        threshold
      );
      if (snapped) {
        ratioEdges.right = snapped.value - renderBox.x;
        guides.push(snapped.guide);
      }
    }
    if (handle.startsWith('top') || handle === 'top-center') {
      const snapped = snapValue(
        renderBox.y + ratioEdges.top,
        'horizontal',
        siblingItems,
        stageRect,
        threshold
      );
      if (snapped) {
        ratioEdges.top = snapped.value - renderBox.y;
        guides.push(snapped.guide);
      }
    }
    if (handle.startsWith('bottom') || handle === 'bottom-center') {
      const snapped = snapValue(
        renderBox.y + ratioEdges.bottom,
        'horizontal',
        siblingItems,
        stageRect,
        threshold
      );
      if (snapped) {
        ratioEdges.bottom = snapped.value - renderBox.y;
        guides.push(snapped.guide);
      }
    }
  }

  const normalized = normalizeBounds(
    ratioEdges.left,
    ratioEdges.top,
    ratioEdges.right,
    ratioEdges.bottom
  );
  const localRect = rectFromBounds(normalized);
  const previewItem = applyShapeFrame(item, localRect);

  if (previewItem.kind === 'text') {
    previewItem.height = Math.max(
      localRect.height,
      measureWordWrappedTextHeight(previewItem, localRect.width)
    );
  }

  return {
    item: previewItem,
    guides,
  };
}

export function solveRotateSession(
  item: Exclude<CanvasItem, LineCanvasItem>,
  startPointer: Point,
  currentPointer: Point,
  snapAbsolute = false
): InteractionItemPreview {
  const center = getCenter(item);
  const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
  const nextAngle = Math.atan2(currentPointer.y - center.y, currentPointer.x - center.x);
  const rawRotation = item.rotation + ((nextAngle - startAngle) * 180) / Math.PI;
  const nextRotation = snapAbsolute ? Math.round(rawRotation / 22.5) * 22.5 : rawRotation;
  const renderBox = getRenderBox(item);
  const halfVector = rotateVector(
    {
      x: renderBox.width / 2,
      y: renderBox.height / 2,
    },
    nextRotation
  );

  return {
    item: {
      ...item,
      x: center.x - halfVector.x,
      y: center.y - halfVector.y,
      rotation: nextRotation,
      scaleX: 1,
      scaleY: 1,
    },
    guides: [],
  };
}

export function solveLineHandleSession(
  item: LineCanvasItem,
  handle: 'start' | 'end',
  pointer: Point,
  pointerOffset: Point,
  siblingItems: CanvasItem[],
  stageRect: SnapRect,
  snapEnabled = true,
  threshold = SNAP_THRESHOLD
): InteractionItemPreview {
  const adjustedPointer = {
    x: pointer.x - pointerOffset.x,
    y: pointer.y - pointerOffset.y,
  };
  const snapped = snapEnabled ? getSnappedRect(
    {
      x: adjustedPointer.x - 1,
      y: adjustedPointer.y - 1,
      width: 2,
      height: 2,
    },
    siblingItems,
    stageRect,
    threshold
  ) : { rect: { x: adjustedPointer.x - 1, y: adjustedPointer.y - 1, width: 2, height: 2 }, guides: [] };
  const nextPoint = {
    x: snapped.rect.x + 1,
    y: snapped.rect.y + 1,
  };
  const anchorPoint = handle === 'start' ? { x: item.endX, y: item.endY } : { x: item.startX, y: item.startY };
  const guides = [...snapped.guides];
  if (Math.abs(nextPoint.y - anchorPoint.y) <= threshold) {
    nextPoint.y = anchorPoint.y;
    guides.push({ orientation: 'horizontal', position: anchorPoint.y });
  }
  if (Math.abs(nextPoint.x - anchorPoint.x) <= threshold) {
    nextPoint.x = anchorPoint.x;
    guides.push({ orientation: 'vertical', position: anchorPoint.x });
  }

  return {
    item:
      handle === 'start'
        ? withLineGeometry(
            item,
            nextPoint.x,
            nextPoint.y,
            item.endX,
            item.endY
          )
        : withLineGeometry(
            item,
            item.startX,
            item.startY,
            nextPoint.x,
            nextPoint.y
          ),
    guides,
  };
}

function centerDefaultItem<T extends CanvasItem>(item: T, pointer: Point): T {
  if (item.kind === 'line') {
    const centerX = (item.startX + item.endX) / 2;
    const centerY = (item.startY + item.endY) / 2;
    const deltaX = pointer.x - centerX;
    const deltaY = pointer.y - centerY;
    return withLineGeometry(
      item,
      item.startX + deltaX,
      item.startY + deltaY,
      item.endX + deltaX,
      item.endY + deltaY
    ) as T;
  }

  return {
    ...item,
    x: pointer.x - item.width / 2,
    y: pointer.y - item.height / 2,
  };
}

function finalizeCreatedItem<T extends CanvasItem>(item: T): T {
  if (item.kind !== 'text') {
    return item;
  }

  return {
    ...item,
    height: Math.max(item.height, measureWordWrappedTextHeight(item, item.width)),
  };
}

export function isCreateTool(
  tool: CanvasTool
): tool is Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'> {
  return tool === 'text' || tool === 'rectangle' || tool === 'ellipse' || tool === 'line';
}

export function buildCreatedItem(
  tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>,
  startPointer: Point,
  currentPointer: Point
): CanvasItem {
  const deltaX = currentPointer.x - startPointer.x;
  const deltaY = currentPointer.y - startPointer.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= CREATE_CLICK_THRESHOLD) {
    switch (tool) {
      case 'text':
        return finalizeCreatedItem(centerDefaultItem(createTextItem(), startPointer));
      case 'rectangle':
        return centerDefaultItem(createRectangleItem(), startPointer);
      case 'ellipse':
        return centerDefaultItem(createEllipseItem(), startPointer);
      case 'line':
        return centerDefaultItem(createLineItem(), startPointer);
    }
  }

  if (tool === 'line') {
    return withLineGeometry(
      createLineItem(),
      startPointer.x,
      startPointer.y,
      currentPointer.x,
      currentPointer.y
    );
  }

  const bounds = normalizeBounds(
    startPointer.x,
    startPointer.y,
    currentPointer.x,
    currentPointer.y
  );
  const rect = rectFromBounds(bounds);

  switch (tool) {
    case 'text':
      return finalizeCreatedItem(createTextItem(rect));
    case 'rectangle':
      return createRectangleItem(rect);
    case 'ellipse':
      return createEllipseItem(rect);
  }
}

export function getCreatePreview(
  tool: Extract<CanvasTool, 'text' | 'rectangle' | 'ellipse' | 'line'>,
  startPointer: Point,
  currentPointer: Point
) {
  if (tool === 'line') {
    return withLineGeometry(
      createLineItem(),
      startPointer.x,
      startPointer.y,
      currentPointer.x,
      currentPointer.y
    );
  }

  const bounds = normalizeBounds(
    startPointer.x,
    startPointer.y,
    currentPointer.x,
    currentPointer.y
  );
  const rect = rectFromBounds(bounds);

  switch (tool) {
    case 'text':
      return finalizeCreatedItem(createTextItem(rect));
    case 'rectangle':
      return createRectangleItem(rect);
    case 'ellipse':
      return createEllipseItem(rect);
  }
}
