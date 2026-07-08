import type { CanvasItem, LineCanvasItem } from '../document/documentTypes';

import { getRenderBox, type Point, type RenderBox } from './transformGeometry';

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

export function getItemSelectionPoints(item: CanvasItem): Point[] {
  if (item.kind === 'line') {
    return [
      { x: item.startX, y: item.startY },
      { x: item.endX, y: item.endY },
    ];
  }
  if (item.kind === 'polygon') {
    return item.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
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

export function getItemAABB(item: CanvasItem): RenderBox {
  if (item.kind === 'line' || Math.abs(item.rotation) < 0.001) {
    return getRenderBox(item);
  }
  const points = getItemSelectionPoints(item);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
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

export function getSelectionFrameForRotation(
  items: CanvasItem[],
  rotation: number,
  centerHint?: Point
): { bounds: RenderBox; rotation: number } | null {
  if (items.length === 0) {
    return null;
  }

  const referenceBounds = getSelectionRenderBounds(items);
  if (!referenceBounds) {
    return null;
  }

  const origin = centerHint ?? {
    x: referenceBounds.x + referenceBounds.width / 2,
    y: referenceBounds.y + referenceBounds.height / 2,
  };
  const localPoints = items
    .flatMap((item) => getItemSelectionPoints(item))
    .map((point) => rotatePoint(point, origin, -rotation));

  const minX = Math.min(...localPoints.map((point) => point.x));
  const maxX = Math.max(...localPoints.map((point) => point.x));
  const minY = Math.min(...localPoints.map((point) => point.y));
  const maxY = Math.max(...localPoints.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const localCenter = {
    x: minX + width / 2,
    y: minY + height / 2,
  };
  const stageCenter = rotatePoint(localCenter, origin, rotation);

  return {
    bounds: {
      x: stageCenter.x - width / 2,
      y: stageCenter.y - height / 2,
      width,
      height,
    },
    rotation,
  };
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

function openChainIntersectsRect(vertices: Point[], rect: RenderBox): boolean {
  if (vertices.some((vertex) => pointInRect(vertex, rect))) {
    return true;
  }
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  for (let index = 0; index < vertices.length - 1; index += 1) {
    for (let rectIndex = 0; rectIndex < corners.length; rectIndex += 1) {
      if (
        segmentsIntersect(
          vertices[index],
          vertices[index + 1],
          corners[rectIndex],
          corners[(rectIndex + 1) % corners.length],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function itemIntersectsSelectionRect(item: CanvasItem, rect: RenderBox): boolean {
  if (item.kind === 'line') {
    return lineIntersectsRect(item, rect);
  }
  // An OPEN polygon has no interior and no closing edge: only stroke-chain
  // contact counts, so a marquee inside the mouth of a U-shape selects nothing.
  if (item.kind === 'polygon' && !item.closed) {
    return openChainIntersectsRect(getItemSelectionPoints(item), rect);
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
