import type { Point } from '../interactionGeometry';

export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 16;
const SEAM_ZOOM_ALIGNMENT_GRID = 64;

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

// Reads what the user typed into the HUD zoom readout as a percentage ("150",
// "150%", " 37.5 % "). Returns the zoom factor, or null when the text is not a
// positive number. Clamping and snapping happen when the zoom is applied.
export function parseZoomPercentInput(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*%?\s*$/.exec(text);
  if (!match) {
    return null;
  }
  const percent = Number(match[1]);
  if (!Number.isFinite(percent) || percent <= 0) {
    return null;
  }
  return percent / 100;
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

export interface ViewportArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Beside a panel narrower than this, there is too little room to fit the
// canvas into, so Fit uses the whole viewport instead.
export const MIN_FIT_AREA_WIDTH = 320;

// The part of the viewport that Fit shows the canvas in: everything left of a
// panel floating over the viewport's right side. `panelRect` is in viewport
// coordinates; null (or an empty rect, as a hidden panel measures) means
// nothing covers the viewport.
export function getFitArea(
  viewportSize: { width: number; height: number },
  panelRect: ViewportArea | null,
): ViewportArea {
  const wholeViewport = { left: 0, top: 0, width: viewportSize.width, height: viewportSize.height };
  if (!panelRect || panelRect.width <= 0 || panelRect.height <= 0) {
    return wholeViewport;
  }

  const overlapsViewport =
    panelRect.left < viewportSize.width &&
    panelRect.left + panelRect.width > 0 &&
    panelRect.top < viewportSize.height &&
    panelRect.top + panelRect.height > 0;
  if (!overlapsViewport || panelRect.left < MIN_FIT_AREA_WIDTH) {
    return wholeViewport;
  }

  return { ...wholeViewport, width: panelRect.left };
}

// The zoom and pan that show the whole canvas centered in `area`, with a
// margin of 5% of the area on each side.
export function fitCanvasToArea(
  canvasSize: { width: number; height: number },
  area: ViewportArea,
  devicePixelRatio: number,
): { zoom: number; pan: Point } {
  const requestedZoom = clampZoom(
    Math.min(
      area.width / Math.max(canvasSize.width, 1),
      area.height / Math.max(canvasSize.height, 1),
    ) * 0.9,
  );
  const zoom = floorZoomToSeamFriendlyStep(requestedZoom, devicePixelRatio);

  return {
    zoom,
    pan: {
      x: area.left + (area.width - canvasSize.width * zoom) / 2,
      y: area.top + (area.height - canvasSize.height * zoom) / 2,
    },
  };
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
