import type { CanvasItem, PolygonCanvasItem } from '../document/documentTypes';
import { polygonBounds } from '../document/polygonVertices';

import { getItemSelectionPoints } from './selectionGeometry';
import type { Point, RenderBox } from './transformGeometry';

interface ResizeFrameAxes {
  origin: Point;
  rotation: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface SelectionFrame {
  bounds: RenderBox;
  rotation: number;
}

function rotatePoint(point: Point, center: Point, deltaDegrees: number): Point {
  const radians = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

// Polygons carry their geometry in the vertex list, so every group transform
// maps the vertices point-by-point and re-derives the AABB.
function mapPolygonItem(
  item: PolygonCanvasItem,
  mapPoint: (point: Point) => Point,
): PolygonCanvasItem {
  const vertices = item.vertices.map((vertex) => mapPoint(vertex));
  return { ...item, vertices, ...polygonBounds(vertices), scaleX: 1, scaleY: 1 };
}

function normalizeRect(rect: RenderBox): RenderBox {
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  return {
    x: Math.min(rect.x, x2),
    y: Math.min(rect.y, y2),
    width: Math.max(1, Math.abs(rect.width)),
    height: Math.max(1, Math.abs(rect.height)),
  };
}

function scalePointWithinBounds(point: Point, bounds: RenderBox, nextBounds: RenderBox): Point {
  const safeWidth = Math.max(bounds.width, 1);
  const safeHeight = Math.max(bounds.height, 1);
  return {
    x: nextBounds.x + ((point.x - bounds.x) / safeWidth) * nextBounds.width,
    y: nextBounds.y + ((point.y - bounds.y) / safeHeight) * nextBounds.height,
  };
}

function stageToOriginLocal(point: Point, origin: Point, rotation: number): Point {
  const rotated = rotatePoint(point, origin, -rotation);
  return {
    x: rotated.x - origin.x,
    y: rotated.y - origin.y,
  };
}

function originLocalToStage(point: Point, origin: Point, rotation: number): Point {
  return rotatePoint(
    {
      x: origin.x + point.x,
      y: origin.y + point.y,
    },
    origin,
    rotation
  );
}

function getBaseResizeFrameAxes(bounds: RenderBox, rotation: number): ResizeFrameAxes {
  const origin = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  return {
    origin,
    rotation,
    left: -bounds.width / 2,
    right: bounds.width / 2,
    top: -bounds.height / 2,
    bottom: bounds.height / 2,
  };
}

function getResizedFrameAxes(
  bounds: RenderBox,
  handle: string,
  currentPointer: Point,
  rotation: number
): ResizeFrameAxes {
  const axes = getBaseResizeFrameAxes(bounds, rotation);
  const localPointer = stageToOriginLocal(currentPointer, axes.origin, rotation);
  let { left, right, top, bottom } = axes;

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
    left = axes.left;
    right = axes.right;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    top = axes.top;
    bottom = axes.bottom;
  }

  return {
    ...axes,
    left,
    right,
    top,
    bottom,
  };
}

function selectionFrameFromAxes(axes: ResizeFrameAxes): SelectionFrame {
  const width = Math.abs(axes.right - axes.left);
  const height = Math.abs(axes.bottom - axes.top);
  const localCenter = {
    x: (axes.left + axes.right) / 2,
    y: (axes.top + axes.bottom) / 2,
  };
  const stageCenter = originLocalToStage(localCenter, axes.origin, axes.rotation);
  return {
    bounds: {
      x: stageCenter.x - width / 2,
      y: stageCenter.y - height / 2,
      width: Math.max(1, width),
      height: Math.max(1, height),
    },
    rotation: axes.rotation,
  };
}

function mapPointBetweenResizeFrames(
  point: Point,
  fromAxes: ResizeFrameAxes,
  toAxes: ResizeFrameAxes
): Point {
  const local = stageToOriginLocal(point, fromAxes.origin, fromAxes.rotation);
  const normalized = {
    x: (local.x - fromAxes.left) / Math.max(fromAxes.right - fromAxes.left, 1),
    y: (local.y - fromAxes.top) / Math.max(fromAxes.bottom - fromAxes.top, 1),
  };
  return originLocalToStage(
    {
      x: toAxes.left + (toAxes.right - toAxes.left) * normalized.x,
      y: toAxes.top + (toAxes.bottom - toAxes.top) * normalized.y,
    },
    toAxes.origin,
    toAxes.rotation
  );
}

function rebuildShapeItemFromCorners<T extends CanvasItem>(
  item: T,
  points: [Point, Point, Point, Point]
): T {
  const vectors = (from: Point, to: Point) => ({
    x: to.x - from.x,
    y: to.y - from.y,
  });
  const magnitude = (vector: Point) => Math.hypot(vector.x, vector.y);
  const cross = (first: Point, second: Point) => first.x * second.y - first.y * second.x;
  const dot = (first: Point, second: Point) => first.x * second.x + first.y * second.y;

  let best:
    | {
        anchor: Point;
        widthVector: Point;
        heightVector: Point;
      }
    | null = null;

  for (let index = 0; index < points.length; index += 1) {
    const anchor = points[index];
    const next = vectors(anchor, points[(index + 1) % points.length]);
    const previous = vectors(anchor, points[(index + points.length - 1) % points.length]);
    const candidates = [
      {
        widthVector: next,
        heightVector: previous,
      },
      {
        widthVector: previous,
        heightVector: next,
      },
    ];

    for (const candidate of candidates) {
      const width = magnitude(candidate.widthVector);
      const height = magnitude(candidate.heightVector);
      if (width < 0.001 || height < 0.001) {
        continue;
      }
      const orthogonality = Math.abs(dot(candidate.widthVector, candidate.heightVector)) / (width * height);
      if (orthogonality > 1e-3) {
        continue;
      }
      if (cross(candidate.widthVector, candidate.heightVector) <= 0) {
        continue;
      }
      best = {
        anchor,
        widthVector: candidate.widthVector,
        heightVector: candidate.heightVector,
      };
      break;
    }

    if (best) {
      break;
    }
  }

  if (!best) {
    const [topLeft, topRight, , bottomLeft] = points;
    best = {
      anchor: topLeft,
      widthVector: {
        x: topRight.x - topLeft.x,
        y: topRight.y - topLeft.y,
      },
      heightVector: {
        x: bottomLeft.x - topLeft.x,
        y: bottomLeft.y - topLeft.y,
      },
    };
  }

  return {
    ...item,
    x: best.anchor.x,
    y: best.anchor.y,
    width: Math.max(1, magnitude(best.widthVector)),
    height: Math.max(1, magnitude(best.heightVector)),
    rotation: (Math.atan2(best.widthVector.y, best.widthVector.x) * 180) / Math.PI,
    scaleX: 1,
    scaleY: 1,
  };
}

export function buildGroupDragPreviews(items: CanvasItem[], deltaX: number, deltaY: number): CanvasItem[] {
  return items.map((item) => item.kind === 'polygon'
    ? mapPolygonItem(item, (point) => ({ x: point.x + deltaX, y: point.y + deltaY }))
    : item.kind === 'line'
    ? {
        ...item,
        x: item.x + deltaX,
        y: item.y + deltaY,
        startX: item.startX + deltaX,
        startY: item.startY + deltaY,
        endX: item.endX + deltaX,
        endY: item.endY + deltaY,
      }
    : {
        ...item,
        x: item.x + deltaX,
        y: item.y + deltaY,
      });
}

export function getResizedBoundsFromHandle(bounds: RenderBox, handle: string, currentPointer: Point): RenderBox {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  let nextX = bounds.x;
  let nextY = bounds.y;
  let nextRight = right;
  let nextBottom = bottom;
  if (handle.includes('left')) nextX = currentPointer.x;
  if (handle.includes('right')) nextRight = currentPointer.x;
  if (handle.includes('top')) nextY = currentPointer.y;
  if (handle.includes('bottom')) nextBottom = currentPointer.y;
  if (handle === 'top-center' || handle === 'bottom-center') {
    nextX = bounds.x;
    nextRight = right;
  }
  if (handle === 'middle-left' || handle === 'middle-right') {
    nextY = bounds.y;
    nextBottom = bottom;
  }
  return normalizeRect({ x: nextX, y: nextY, width: nextRight - nextX, height: nextBottom - nextY });
}

export function getGroupResizeBounds(
  bounds: RenderBox,
  handle: string,
  currentPointer: Point,
  frameRotation = 0
): RenderBox {
  if (frameRotation === 0) {
    return getResizedBoundsFromHandle(bounds, handle, currentPointer);
  }

  return selectionFrameFromAxes(
    getResizedFrameAxes(bounds, handle, currentPointer, frameRotation)
  ).bounds;
}

export function getGroupResizeFrame(
  bounds: RenderBox,
  handle: string,
  currentPointer: Point,
  frameRotation = 0
): SelectionFrame {
  if (frameRotation === 0) {
    return {
      bounds: getResizedBoundsFromHandle(bounds, handle, currentPointer),
      rotation: 0,
    };
  }

  return selectionFrameFromAxes(
    getResizedFrameAxes(bounds, handle, currentPointer, frameRotation)
  );
}

function buildAxisAlignedGroupResizePreviews(
  items: CanvasItem[],
  bounds: RenderBox,
  handle: string,
  currentPointer: Point
): CanvasItem[] {
  const nextBounds = getResizedBoundsFromHandle(bounds, handle, currentPointer);
  return items.map((item) => {
    if (item.kind === 'polygon') {
      return mapPolygonItem(item, (point) => scalePointWithinBounds(point, bounds, nextBounds));
    }
    if (item.kind === 'line') {
      const start = scalePointWithinBounds({ x: item.startX, y: item.startY }, bounds, nextBounds);
      const end = scalePointWithinBounds({ x: item.endX, y: item.endY }, bounds, nextBounds);
      return {
        ...item,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.max(1, Math.abs(end.x - start.x)),
        height: Math.max(1, Math.abs(end.y - start.y)),
      };
    }
    const [topLeft, topRight, , bottomLeft] = getItemSelectionPoints(item).map((point) =>
      scalePointWithinBounds(point, bounds, nextBounds)
    );
    const width = Math.max(1, Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y));
    const height = Math.max(1, Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y));
    const rotation = (Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x) * 180) / Math.PI;
    return {
      ...item,
      x: topLeft.x,
      y: topLeft.y,
      width,
      height,
      rotation,
      scaleX: 1,
      scaleY: 1,
    };
  });
}

export function buildGroupResizePreviews(
  items: CanvasItem[],
  bounds: RenderBox,
  handle: string,
  currentPointer: Point,
  frameRotation = 0
): CanvasItem[] {
  if (frameRotation === 0) {
    return buildAxisAlignedGroupResizePreviews(items, bounds, handle, currentPointer);
  }

  const fromAxes = getBaseResizeFrameAxes(bounds, frameRotation);
  const toAxes = getResizedFrameAxes(bounds, handle, currentPointer, frameRotation);

  return items.map((item) => {
    if (item.kind === 'polygon') {
      return mapPolygonItem(item, (point) => mapPointBetweenResizeFrames(point, fromAxes, toAxes));
    }
    if (item.kind === 'line') {
      const start = mapPointBetweenResizeFrames(
        { x: item.startX, y: item.startY },
        fromAxes,
        toAxes
      );
      const end = mapPointBetweenResizeFrames(
        { x: item.endX, y: item.endY },
        fromAxes,
        toAxes
      );
      return {
        ...item,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.max(1, Math.abs(end.x - start.x)),
        height: Math.max(1, Math.abs(end.y - start.y)),
      };
    }

    const mappedPoints = getItemSelectionPoints(item).map((point) =>
      mapPointBetweenResizeFrames(point, fromAxes, toAxes)
    ) as [Point, Point, Point, Point];
    return rebuildShapeItemFromCorners(item, mappedPoints);
  });
}

export function buildGroupRotatePreviews(items: CanvasItem[], bounds: RenderBox, startPointer: Point, currentPointer: Point, snap = false): CanvasItem[] {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
  const currentAngle = Math.atan2(currentPointer.y - center.y, currentPointer.x - center.x);
  let deltaDegrees = ((currentAngle - startAngle) * 180) / Math.PI;
  if (snap) {
    deltaDegrees = Math.round(deltaDegrees / 15) * 15;
  }
  return items.map((item) => {
    if (item.kind === 'polygon') {
      return mapPolygonItem(item, (point) => rotatePoint(point, center, deltaDegrees));
    }
    if (item.kind === 'line') {
      const start = rotatePoint({ x: item.startX, y: item.startY }, center, deltaDegrees);
      const end = rotatePoint({ x: item.endX, y: item.endY }, center, deltaDegrees);
      return {
        ...item,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.max(1, Math.abs(end.x - start.x)),
        height: Math.max(1, Math.abs(end.y - start.y)),
      };
    }
    const origin = rotatePoint({ x: item.x, y: item.y }, center, deltaDegrees);
    return {
      ...item,
      x: origin.x,
      y: origin.y,
      rotation: item.rotation + deltaDegrees,
    };
  });
}
