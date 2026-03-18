import type { CanvasItem, LineCanvasItem } from '../document/documentTypes';

export interface RenderBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransformPreview extends RenderBox {
  itemId: string;
  rotation: number;
}

export interface TransformSnapshot extends RenderBox {
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface Point {
  x: number;
  y: number;
}

interface NormalizedAxisTransform {
  position: number;
  size: number;
}

export function getRenderBox(item: CanvasItem): RenderBox {
  if (item.kind === 'line') {
    return {
      x: Math.min(item.startX, item.endX),
      y: Math.min(item.startY, item.endY),
      width: Math.max(1, Math.abs(item.endX - item.startX)),
      height: Math.max(1, Math.abs(item.endY - item.startY)),
    };
  }

  return {
    x: item.x,
    y: item.y,
    width: item.width * item.scaleX,
    height: item.height * item.scaleY,
  };
}

function normalizeAxisTransform(position: number, baseSize: number, scale: number, zeroSize = 1): NormalizedAxisTransform {
  const scaledSize = baseSize * scale;
  if (scaledSize === 0) {
    return {
      position,
      size: zeroSize,
    };
  }

  const nextEdge = position + scaledSize;
  return {
    position: Math.min(position, nextEdge),
    size: Math.abs(scaledSize),
  };
}

export function buildTransformCommit(baseBox: RenderBox, snapshot: TransformSnapshot, zeroSize = 1) {
  const normalizedX = normalizeAxisTransform(snapshot.x, baseBox.width, snapshot.scaleX, zeroSize);
  const normalizedY = normalizeAxisTransform(snapshot.y, baseBox.height, snapshot.scaleY, zeroSize);

  return {
    x: normalizedX.position,
    y: normalizedY.position,
    width: normalizedX.size,
    height: normalizedY.size,
    rotation: snapshot.rotation,
    scaleX: 1,
    scaleY: 1,
  };
}

export function applyPreviewToItem<T extends CanvasItem>(item: T, preview: TransformPreview | null): T {
  if (!preview || preview.itemId !== item.id || item.kind === 'line') {
    return item;
  }

  return {
    ...item,
    x: preview.x,
    y: preview.y,
    width: preview.width,
    height: preview.height,
    rotation: preview.rotation,
    scaleX: 1,
    scaleY: 1,
  };
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

export function getSelectionRenderBounds(items: CanvasItem[]): RenderBox | null {
  if (items.length === 0) {
    return null;
  }
  const quads = items.flatMap((item) => getItemSelectionPoints(item));
  const xs = quads.map((point) => point.x);
  const ys = quads.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}

export function getItemSelectionPoints(item: CanvasItem): Point[] {
  if (item.kind === 'line') {
    return [
      { x: item.startX, y: item.startY },
      { x: item.endX, y: item.endY },
    ];
  }
  const box = getRenderBox(item);
  const radians = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    { x: 0, y: 0 },
    { x: box.width, y: 0 },
    { x: box.width, y: box.height },
    { x: 0, y: box.height },
  ];
  return corners.map((corner) => ({
    x: box.x + corner.x * cos - corner.y * sin,
    y: box.y + corner.x * sin + corner.y * cos,
  }));
}

function pointInRect(point: Point, rect: RenderBox): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(a1, b1, a2)) return true;
  if (d2 === 0 && onSegment(a1, b2, a2)) return true;
  if (d3 === 0 && onSegment(b1, a1, b2)) return true;
  if (d4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

function lineIntersectsRect(line: LineCanvasItem, rect: RenderBox): boolean {
  const start = { x: line.startX, y: line.startY };
  const end = { x: line.endX, y: line.endY };
  if (pointInRect(start, rect) || pointInRect(end, rect)) {
    return true;
  }
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  for (let index = 0; index < corners.length; index += 1) {
    if (segmentsIntersect(start, end, corners[index], corners[(index + 1) % corners.length])) {
      return true;
    }
  }
  return false;
}

export function itemIntersectsSelectionRect(item: CanvasItem, rect: RenderBox): boolean {
  if (item.kind === 'line') {
    return lineIntersectsRect(item, rect);
  }
  const polygon = getItemSelectionPoints(item);
  if (polygon.some((point) => pointInRect(point, rect))) {
    return true;
  }
  const rectCorners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  if (rectCorners.some((point) => pointInPolygon(point, polygon))) {
    return true;
  }
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    for (let rectIndex = 0; rectIndex < rectCorners.length; rectIndex += 1) {
      const c = rectCorners[rectIndex];
      const d = rectCorners[(rectIndex + 1) % rectCorners.length];
      if (segmentsIntersect(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

export function buildGroupDragPreviews(items: CanvasItem[], deltaX: number, deltaY: number): CanvasItem[] {
  return items.map((item) => item.kind === 'line'
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

export function buildGroupResizePreviews(items: CanvasItem[], bounds: RenderBox, handle: string, currentPointer: Point): CanvasItem[] {
  const nextBounds = getResizedBoundsFromHandle(bounds, handle, currentPointer);
  return items.map((item) => {
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
    const box = getRenderBox(item);
    const topLeft = scalePointWithinBounds({ x: box.x, y: box.y }, bounds, nextBounds);
    return {
      ...item,
      x: topLeft.x,
      y: topLeft.y,
      width: Math.max(1, box.width * (nextBounds.width / Math.max(bounds.width, 1))),
      height: Math.max(1, box.height * (nextBounds.height / Math.max(bounds.height, 1))),
      scaleX: 1,
      scaleY: 1,
    };
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
