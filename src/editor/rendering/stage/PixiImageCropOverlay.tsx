import { useCallback, useMemo, useRef } from 'react';
import { Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

import type { ImageCanvasItem } from '../../document/documentTypes';
import {
  getSelectionOutlinePoints,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import { getRenderBox } from '../transformGeometry';

import {
  getCanvasOverlayMetrics,
  getShapeOverlayHandlePoints,
} from './overlayGeometry';
import { PixiImageContent } from './PixiItemLayer';

// ── Colours ────────────────────────────────────────────────────────────────
const FULL_IMAGE_STROKE = 0x3b82f6;
const FULL_HANDLE_FILL = 0xffffff;
const CROP_OUTLINE_OVERLAY = 0x111111;
const CROP_OUTLINE_UNDERLAY = 0xffffff;

// ── Types ──────────────────────────────────────────────────────────────────

interface PixiImageCropOverlayProps {
  beginCropFullResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginCropFullRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropPan: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  commitCropSession: () => boolean;
  fullImageItem: ImageCanvasItem;
  previewItem: ImageCanvasItem;
  toCanvasPointer: (pointer: Point) => Point;
  zoom: number;
}

// ── Crop handle visual points (L-shapes at corners, bars at edges) ─────────

function getCropHandleVisualPoints(
  item: ImageCanvasItem,
  handle: ResizeHandle,
  zoom: number,
): number[] {
  const m = getCanvasOverlayMetrics(zoom);
  const { width, height } = item;
  switch (handle) {
    case 'top-left':
      return [0, m.cropCornerLength, 0, 0, m.cropCornerLength, 0];
    case 'top-center':
      return [width / 2 - m.cropSideHandleLength / 2, 0, width / 2 + m.cropSideHandleLength / 2, 0];
    case 'top-right':
      return [width - m.cropCornerLength, 0, width, 0, width, m.cropCornerLength];
    case 'middle-left':
      return [0, height / 2 - m.cropSideHandleLength / 2, 0, height / 2 + m.cropSideHandleLength / 2];
    case 'middle-right':
      return [width, height / 2 - m.cropSideHandleLength / 2, width, height / 2 + m.cropSideHandleLength / 2];
    case 'bottom-left':
      return [0, height - m.cropCornerLength, 0, height, m.cropCornerLength, height];
    case 'bottom-center':
      return [width / 2 - m.cropSideHandleLength / 2, height, width / 2 + m.cropSideHandleLength / 2, height];
    case 'bottom-right':
      return [width - m.cropCornerLength, height, width, height, width, height - m.cropCornerLength];
  }
}

// ── Helpers to draw polylines via Graphics ─────────────────────────────────

function drawPolyline(g: Graphics, pts: number[], stroke: number, width: number) {
  if (pts.length < 4) return;
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    g.lineTo(pts[i], pts[i + 1]);
  }
  g.stroke({ color: stroke, width });
}

// ── Component ──────────────────────────────────────────────────────────────

export function PixiImageCropOverlay({
  beginCropFullResize,
  beginCropFullRotate,
  beginCropPan,
  beginCropResize,
  commitCropSession,
  fullImageItem,
  previewItem,
  toCanvasPointer,
  zoom,
}: PixiImageCropOverlayProps) {
  const m = getCanvasOverlayMetrics(zoom);
  const fullOutlinePoints = getSelectionOutlinePoints(fullImageItem);
  const fullHandlePoints = getShapeOverlayHandlePoints(fullImageItem, zoom);
  const cropHandlePoints = getShapeOverlayHandlePoints(previewItem, zoom);
  const fullRenderBox = getRenderBox(fullImageItem);
  const fullRotationRad = (fullImageItem.rotation * Math.PI) / 180;
  const previewRotationRad = (previewItem.rotation * Math.PI) / 180;

  // ── Double-click detection for commit ──────────────────────────────────
  const lastClickRef = useRef(0);

  // ── Pan area over full image (transparent, interactive) ────────────────
  const drawPanArea = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, fullRenderBox.width, fullRenderBox.height);
      g.fill({ color: 0x000000, alpha: 0.001 });
    },
    [fullRenderBox.width, fullRenderBox.height],
  );

  const handlePanMouseDown = useCallback(
    (e: FederatedPointerEvent) => {
      if ((e.nativeEvent as MouseEvent).button !== 0) return;
      e.stopPropagation();

      const pointer = { x: e.global.x, y: e.global.y };

      // Double-click → commit
      const now = Date.now();
      if (now - lastClickRef.current < 400) {
        lastClickRef.current = 0;
        commitCropSession();
        return;
      }
      lastClickRef.current = now;

      beginCropPan(toCanvasPointer(pointer), 'overlay');
    },
    [beginCropPan, commitCropSession, toCanvasPointer],
  );

  // ── Full image outline (blue closed polyline) ─────────────────────────
  const drawFullOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      // Close the outline by appending the first point
      const closed = fullOutlinePoints.length >= 4
        ? [...fullOutlinePoints, fullOutlinePoints[0], fullOutlinePoints[1]]
        : fullOutlinePoints;
      drawPolyline(g, closed, FULL_IMAGE_STROKE, m.selectionStrokeWidth);
    },
    [fullOutlinePoints, m.selectionStrokeWidth],
  );

  // ── Full image resize handles (blue circles) ──────────────────────────
  const drawFullHandles = useCallback(
    (g: Graphics) => {
      g.clear();
      for (const handle of RESIZE_HANDLE_NAMES) {
        const pt = fullHandlePoints[handle];
        g.circle(pt.x, pt.y, m.fullHandleRadius);
        g.fill(FULL_HANDLE_FILL);
        g.stroke({ color: FULL_IMAGE_STROKE, width: m.handleStrokeWidth });
      }
      // Rotate handle
      const rot = fullHandlePoints.rotater;
      g.circle(rot.x, rot.y, m.fullHandleRadius);
      g.fill(FULL_HANDLE_FILL);
      g.stroke({ color: FULL_IMAGE_STROKE, width: m.handleStrokeWidth });
    },
    [fullHandlePoints, m.fullHandleRadius, m.handleStrokeWidth],
  );

  // ── Hit areas for full image handles (invisible, interactive) ─────────
  const fullHandleHitSize = m.cropHandleHitSize;

  const fullHandleMouseDownMap = useMemo(
    () => Object.fromEntries(
      RESIZE_HANDLE_NAMES.map((handle) => [
        handle,
        (e: FederatedPointerEvent) => {
          if ((e.nativeEvent as MouseEvent).button !== 0) return;
          e.stopPropagation();
          beginCropFullResize(handle, toCanvasPointer({ x: e.global.x, y: e.global.y }), 'overlay');
        },
      ]),
    ) as Record<ResizeHandle, (e: FederatedPointerEvent) => void>,
    [beginCropFullResize, toCanvasPointer],
  );

  const fullHandleHitArea = useMemo(
    () => new Rectangle(
      -fullHandleHitSize / 2, -fullHandleHitSize / 2,
      fullHandleHitSize, fullHandleHitSize,
    ),
    [fullHandleHitSize],
  );

  const cropHandleHitArea = useMemo(
    () => new Rectangle(
      -m.cropHandleHitSize / 2, -m.cropHandleHitSize / 2,
      m.cropHandleHitSize, m.cropHandleHitSize,
    ),
    [m.cropHandleHitSize],
  );

  const panHitArea = useMemo(
    () => new Rectangle(0, 0, fullRenderBox.width, fullRenderBox.height),
    [fullRenderBox.width, fullRenderBox.height],
  );

  const handleRotateMouseDown = useCallback(
    (e: FederatedPointerEvent) => {
      if ((e.nativeEvent as MouseEvent).button !== 0) return;
      e.stopPropagation();
      beginCropFullRotate(toCanvasPointer({ x: e.global.x, y: e.global.y }), 'overlay');
    },
    [beginCropFullRotate, toCanvasPointer],
  );

  // ── Crop outline (white underlay + black overlay) ─────────────────────
  const previewRenderBox = getRenderBox(previewItem);

  const drawCropOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      const w = previewRenderBox.width;
      const h = previewRenderBox.height;
      const outlinePts = [0, 0, w, 0, w, h, 0, h, 0, 0];

      // White underlay
      drawPolyline(g, outlinePts, CROP_OUTLINE_UNDERLAY, m.cropOutlineUnderlayWidth);
      // Black overlay
      drawPolyline(g, outlinePts, CROP_OUTLINE_OVERLAY, m.cropOutlineStrokeWidth);

      // Handle visuals (underlay + overlay for each handle)
      for (const handle of RESIZE_HANDLE_NAMES) {
        const pts = getCropHandleVisualPoints(previewItem, handle, zoom);
        drawPolyline(g, pts, CROP_OUTLINE_UNDERLAY, m.cropHandleUnderlayWidth);
      }
      for (const handle of RESIZE_HANDLE_NAMES) {
        const pts = getCropHandleVisualPoints(previewItem, handle, zoom);
        drawPolyline(g, pts, CROP_OUTLINE_OVERLAY, m.cropHandleStrokeWidth);
      }
    },
    [previewItem, previewRenderBox.width, previewRenderBox.height, zoom, m],
  );

  // ── Hit areas for crop handles (invisible, interactive) ───────────────
  const cropHandleMouseDownMap = useMemo(
    () => Object.fromEntries(
      RESIZE_HANDLE_NAMES.map((handle) => [
        handle,
        (e: FederatedPointerEvent) => {
          if ((e.nativeEvent as MouseEvent).button !== 0) return;
          e.stopPropagation();
          beginCropResize(handle, toCanvasPointer({ x: e.global.x, y: e.global.y }), 'overlay');
        },
      ]),
    ) as Record<ResizeHandle, (e: FederatedPointerEvent) => void>,
    [beginCropResize, toCanvasPointer],
  );

  return (
    <>
      {/* Dimmed full image (background) */}
      <pixiContainer
        x={fullRenderBox.x}
        y={fullRenderBox.y}
        rotation={fullRotationRad}
        alpha={Math.min(1, fullImageItem.opacity * 0.35)}
        eventMode="none"
      >
        <PixiImageContent item={fullImageItem} />
      </pixiContainer>

      {/* Preview image (active crop area) */}
      <pixiContainer
        x={previewRenderBox.x}
        y={previewRenderBox.y}
        rotation={previewRotationRad}
        alpha={previewItem.opacity}
        eventMode="none"
      >
        <PixiImageContent item={previewItem} />
      </pixiContainer>

      {/* Pan area over full image */}
      <pixiContainer
        x={fullRenderBox.x}
        y={fullRenderBox.y}
        rotation={fullRotationRad}
        eventMode="static"
        hitArea={panHitArea}
        onMouseDown={handlePanMouseDown}
      >
        <pixiGraphics draw={drawPanArea} eventMode="none" />
      </pixiContainer>

      {/* Full image outline (blue dashed) */}
      <pixiGraphics draw={drawFullOutline} eventMode="none" />

      {/* Full image handles (visual) */}
      <pixiGraphics draw={drawFullHandles} eventMode="none" />

      {/* Full image handle hit areas */}
      {RESIZE_HANDLE_NAMES.map((handle) => {
        const pt = fullHandlePoints[handle];
        return (
          <pixiContainer
            key={`crop-full-hit-${handle}`}
            x={pt.x}
            y={pt.y}
            eventMode="static"
            hitArea={fullHandleHitArea}
            onMouseDown={fullHandleMouseDownMap[handle]}
          />
        );
      })}

      {/* Rotate handle hit area */}
      <pixiContainer
        x={fullHandlePoints.rotater.x}
        y={fullHandlePoints.rotater.y}
        eventMode="static"
        hitArea={fullHandleHitArea}
        onMouseDown={handleRotateMouseDown}
      />

      {/* Crop outline + handle visuals (non-interactive, in preview space) */}
      <pixiContainer
        x={previewRenderBox.x}
        y={previewRenderBox.y}
        rotation={previewRotationRad}
        eventMode="none"
      >
        <pixiGraphics draw={drawCropOutline} eventMode="none" />
      </pixiContainer>

      {/* Crop handle hit areas (in stage space) */}
      {RESIZE_HANDLE_NAMES.map((handle) => {
        const pt = cropHandlePoints[handle];
        return (
          <pixiContainer
            key={`crop-handle-hit-${handle}`}
            x={pt.x}
            y={pt.y}
            eventMode="static"
            hitArea={cropHandleHitArea}
            onMouseDown={cropHandleMouseDownMap[handle]}
          />
        );
      })}
    </>
  );
}
