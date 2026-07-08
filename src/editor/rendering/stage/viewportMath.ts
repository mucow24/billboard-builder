import type { Point } from '../interactionGeometry';

export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 16;
const SEAM_ZOOM_ALIGNMENT_GRID = 64;

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function alignToDevicePixels(value: number, devicePixelRatio: number): number {
  const safeDevicePixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

  return Math.round(value * safeDevicePixelRatio) / safeDevicePixelRatio;
}

export function alignViewportPanToDevicePixels(
  pan: Point,
  devicePixelRatio: number,
): Point {
  return {
    x: alignToDevicePixels(pan.x, devicePixelRatio),
    y: alignToDevicePixels(pan.y, devicePixelRatio),
  };
}

export function getDevicePixelRatio(): number {
  if (typeof window === 'undefined') {
    return 1;
  }

  const devicePixelRatio = window.devicePixelRatio;
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
}

function getSeamZoomScale(devicePixelRatio: number): number {
  const safeDevicePixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

  return SEAM_ZOOM_ALIGNMENT_GRID * safeDevicePixelRatio;
}

// Quantize live zoom so common power-of-two scene coordinates land on cleaner
// device-pixel boundaries without changing the requested zoom dramatically.
export function snapZoomToSeamFriendlyStep(
  zoom: number,
  devicePixelRatio: number,
): number {
  const scale = getSeamZoomScale(devicePixelRatio);
  return clampZoom(Math.round(zoom * scale) / scale);
}

// Fit-to-viewport must remain conservative, so snap down instead of to nearest.
export function floorZoomToSeamFriendlyStep(
  zoom: number,
  devicePixelRatio: number,
): number {
  const scale = getSeamZoomScale(devicePixelRatio);
  return clampZoom(Math.floor(zoom * scale) / scale);
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
