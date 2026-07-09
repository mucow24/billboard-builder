import type {
  CanvasItem,
  LineCanvasItem,
} from '../../document/documentTypes';
import {
  localToStage,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';
import { getRenderBox } from '../transformGeometry';

const BASE_GUIDE_STROKE_WIDTH = 1;
const BASE_GUIDE_DASH = [8, 4] as const;
const BASE_HANDLE_RADIUS = 8;
const BASE_HANDLE_STROKE_WIDTH = 2;
const BASE_SELECTION_STROKE_WIDTH = 2;
const BASE_SELECTION_DASH = [8, 4] as const;
const BASE_ROTATE_HANDLE_OFFSET = 50;
const BASE_LINE_SELECTION_STROKE_WIDTH = 18;
const BASE_LINE_SELECTION_HIT_STROKE_WIDTH = 24;
const BASE_CROP_OUTLINE_UNDERLAY_WIDTH = 10;
const BASE_CROP_OUTLINE_STROKE_WIDTH = 6;
const BASE_CROP_HANDLE_UNDERLAY_WIDTH = 13;
const BASE_CROP_HANDLE_STROKE_WIDTH = 8;
const BASE_CROP_CORNER_LENGTH = 24;
const BASE_CROP_SIDE_HANDLE_LENGTH = 28;
const BASE_CROP_HANDLE_HIT_SIZE = 24;

export const OVERLAY_VIEWPORT_HANDLE_SIZE = 16;

// A polygon's vertices sit on (or inside) its AABB, so its vertex-editing
// handles land exactly on the box's corner/edge handles for a default square.
// Push the resize/rotate box outward by this margin (screen px, divided by
// zoom) so the two handle sets never collide. The resize math still anchors to
// the true AABB — the pointerOffset captured on grab absorbs the outset.
export const BASE_POLYGON_SELECTION_OUTSET = 16;

function normalizeZoom(zoom: number) {
  return zoom > 0 ? zoom : 1;
}

function scaleOverlayValue(value: number, zoom: number) {
  return value / normalizeZoom(zoom);
}

export function getCanvasOverlayMetrics(zoom: number) {
  return {
    cropCornerLength: scaleOverlayValue(BASE_CROP_CORNER_LENGTH, zoom),
    cropHandleHitSize: scaleOverlayValue(BASE_CROP_HANDLE_HIT_SIZE, zoom),
    guideDash: BASE_GUIDE_DASH.map((value) => scaleOverlayValue(value, zoom)),
    guideStrokeWidth: scaleOverlayValue(BASE_GUIDE_STROKE_WIDTH, zoom),
    cropHandleStrokeWidth: scaleOverlayValue(BASE_CROP_HANDLE_STROKE_WIDTH, zoom),
    cropHandleUnderlayWidth: scaleOverlayValue(BASE_CROP_HANDLE_UNDERLAY_WIDTH, zoom),
    cropOutlineStrokeWidth: scaleOverlayValue(BASE_CROP_OUTLINE_STROKE_WIDTH, zoom),
    cropOutlineUnderlayWidth: scaleOverlayValue(BASE_CROP_OUTLINE_UNDERLAY_WIDTH, zoom),
    cropSideHandleLength: scaleOverlayValue(BASE_CROP_SIDE_HANDLE_LENGTH, zoom),
    fullHandleRadius: scaleOverlayValue(BASE_HANDLE_RADIUS, zoom),
    handleRadius: scaleOverlayValue(BASE_HANDLE_RADIUS, zoom),
    handleStrokeWidth: scaleOverlayValue(BASE_HANDLE_STROKE_WIDTH, zoom),
    lineSelectionHitStrokeWidth: scaleOverlayValue(BASE_LINE_SELECTION_HIT_STROKE_WIDTH, zoom),
    lineSelectionStrokeWidth: scaleOverlayValue(BASE_LINE_SELECTION_STROKE_WIDTH, zoom),
    rotateHandleOffset: scaleOverlayValue(BASE_ROTATE_HANDLE_OFFSET, zoom),
    selectionDash: BASE_SELECTION_DASH.map((value) => scaleOverlayValue(value, zoom)),
    selectionStrokeWidth: scaleOverlayValue(BASE_SELECTION_STROKE_WIDTH, zoom),
  };
}

export function getShapeOverlayHandlePoints(
  item: Exclude<CanvasItem, LineCanvasItem>,
  zoom: number,
) {
  const renderBox = getRenderBox(item);
  // Polygons get their box pushed outward so its resize/rotate handles clear
  // the on-shape vertex handles (see BASE_POLYGON_SELECTION_OUTSET).
  const outset =
    item.kind === 'polygon' ? scaleOverlayValue(BASE_POLYGON_SELECTION_OUTSET, zoom) : 0;
  const origin = { x: renderBox.x - outset, y: renderBox.y - outset };
  const width = renderBox.width + outset * 2;
  const height = renderBox.height + outset * 2;
  const { rotateHandleOffset } = getCanvasOverlayMetrics(zoom);

  const localPoints: Record<ResizeHandle | 'rotater', Point> = {
    'top-left': { x: 0, y: 0 },
    'top-center': { x: width / 2, y: 0 },
    'top-right': { x: width, y: 0 },
    'middle-left': { x: 0, y: height / 2 },
    'middle-right': { x: width, y: height / 2 },
    'bottom-left': { x: 0, y: height },
    'bottom-center': { x: width / 2, y: height },
    'bottom-right': { x: width, y: height },
    rotater: { x: width / 2, y: -rotateHandleOffset },
  };

  return Object.fromEntries(
    Object.entries(localPoints).map(([name, point]) => [
      name,
      localToStage(point, origin, item.rotation),
    ]),
  ) as Record<ResizeHandle | 'rotater', Point>;
}

export function getViewportHandleRect(point: Point) {
  return {
    left: point.x - OVERLAY_VIEWPORT_HANDLE_SIZE / 2,
    top: point.y - OVERLAY_VIEWPORT_HANDLE_SIZE / 2,
    width: OVERLAY_VIEWPORT_HANDLE_SIZE,
    height: OVERLAY_VIEWPORT_HANDLE_SIZE,
  };
}

export function getResizeHandleViewportRects(
  points: Record<ResizeHandle | 'rotater', Point>,
  toViewportPoint: (point: Point) => Point,
) {
  return Object.fromEntries(
    (['rotater', ...RESIZE_HANDLE_NAMES] as Array<ResizeHandle | 'rotater'>).map((handle) => [
      handle,
      getViewportHandleRect(toViewportPoint(points[handle])),
    ]),
  ) as Record<ResizeHandle | 'rotater', ReturnType<typeof getViewportHandleRect>>;
}
