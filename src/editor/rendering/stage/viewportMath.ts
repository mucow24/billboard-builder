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

// Room smaller than this is too little to fit the canvas into: Fit then
// ignores the right panel, and if that is not enough, everything over the
// viewport.
export const MIN_FIT_AREA_WIDTH = 320;
export const MIN_FIT_AREA_HEIGHT = 240;

// What floats over the viewport's edges, in viewport coordinates: a bar along
// the top (the toolbar), a strip down the left (the tool palette) and a panel
// down the right (the inspector). A missing or empty rect (as an element with
// display: none measures) covers nothing.
export interface FitObstructions {
  top?: ViewportArea | null;
  left?: ViewportArea | null;
  right?: ViewportArea | null;
}

function coversViewport(
  rect: ViewportArea | null | undefined,
  viewportSize: { width: number; height: number },
): rect is ViewportArea {
  return (
    !!rect &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left < viewportSize.width &&
    rect.left + rect.width > 0 &&
    rect.top < viewportSize.height &&
    rect.top + rect.height > 0
  );
}

function clipViewport(
  viewportSize: { width: number; height: number },
  { top, left, right }: FitObstructions,
): ViewportArea {
  let areaTop = 0;
  let areaLeft = 0;
  let areaRight = viewportSize.width;
  if (coversViewport(top, viewportSize)) {
    areaTop = Math.max(areaTop, top.top + top.height);
  }
  if (coversViewport(left, viewportSize)) {
    areaLeft = Math.max(areaLeft, left.left + left.width);
  }
  if (coversViewport(right, viewportSize)) {
    areaRight = Math.min(areaRight, right.left);
  }

  return {
    left: areaLeft,
    top: areaTop,
    width: areaRight - areaLeft,
    height: viewportSize.height - areaTop,
  };
}

function isRoomy(area: ViewportArea): boolean {
  return area.width >= MIN_FIT_AREA_WIDTH && area.height >= MIN_FIT_AREA_HEIGHT;
}

// The part of the viewport that Fit shows the canvas in: below the toolbar,
// right of the tool palette and left of the inspector panel.
export function getFitArea(
  viewportSize: { width: number; height: number },
  obstructions: FitObstructions,
): ViewportArea {
  const clear = clipViewport(viewportSize, obstructions);
  if (isRoomy(clear)) {
    return clear;
  }

  const underPanel = clipViewport(viewportSize, { ...obstructions, right: null });
  if (isRoomy(underPanel)) {
    return underPanel;
  }

  return { left: 0, top: 0, width: viewportSize.width, height: viewportSize.height };
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
