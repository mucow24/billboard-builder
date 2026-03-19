import type { Point } from '../interactionGeometry';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function toCanvasPointer(pointer: Point, zoom: number, pan: Point): Point {
  return {
    x: (pointer.x - pan.x) / zoom,
    y: (pointer.y - pan.y) / zoom,
  };
}

export function toViewportPoint(point: Point, zoom: number, pan: Point): Point {
  return {
    x: pan.x + point.x * zoom,
    y: pan.y + point.y * zoom,
  };
}

export function toViewportRect(
  rect: { x: number; y: number; width: number; height: number },
  zoom: number,
  pan: Point,
) {
  return {
    left: pan.x + rect.x * zoom,
    top: pan.y + rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

export function toOverlayStyle(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${Math.max(1, rect.width)}px`,
    height: `${Math.max(1, rect.height)}px`,
  };
}
