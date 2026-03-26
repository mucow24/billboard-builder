import type { CanvasItem } from '../../document/documentTypes';
import {
  localToStage,
  RESIZE_HANDLE_NAMES,
} from '../interactionGeometry';
import { normalizeRectFromPoints, rotateGroupPointerDelta } from '../interactionSession';
import {
  getGroupResizeFrame,
  getRenderBox,
  getSelectionFrameForRotation,
} from '../transformGeometry';
import {
  getCanvasOverlayMetrics,
  getResizeHandleViewportRects,
  getShapeOverlayHandlePoints,
  getViewportHandleRect,
} from './overlayGeometry';

interface RotationSession {
  bounds: { x: number; y: number; width: number; height: number };
  currentPointer: { x: number; y: number };
  frameRotation: number;
  pointerStart: { x: number; y: number };
  previewItems: CanvasItem[];
}

interface GroupResizeSession extends RotationSession {
  handle: string;
}

interface StageViewportAdapter {
  toViewportPoint: (point: { x: number; y: number }) => { x: number; y: number };
  toViewportRect: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => { left: number; top: number; width: number; height: number };
}

function getGroupOverlayFrame(params: {
  renderedGroupBounds: { x: number; y: number; width: number; height: number } | null;
  renderedSelectionFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  session: {
    kind: string;
    bounds?: { x: number; y: number; width: number; height: number };
    currentPointer?: { x: number; y: number };
    frameRotation?: number;
    handle?: string;
    pointerStart?: { x: number; y: number };
    previewItems?: CanvasItem[];
    shiftConstrain?: boolean;
  } | null;
}) {
  const baseGroupFrame =
    params.renderedSelectionFrame ??
    (params.renderedGroupBounds
      ? { bounds: params.renderedGroupBounds, rotation: 0 }
      : null);
  const rotationSession =
    params.session?.kind === 'group-rotate' ? (params.session as RotationSession) : null;
  const dragSession =
    params.session?.kind === 'group-drag' ? (params.session as RotationSession) : null;
  const resizeSession =
    params.session?.kind === 'group-resize'
      ? (params.session as GroupResizeSession)
      : null;

  if (rotationSession) {
    return getSelectionFrameForRotation(
      rotationSession.previewItems,
      rotationSession.frameRotation +
        rotateGroupPointerDelta(
          rotationSession.bounds,
          rotationSession.pointerStart,
          rotationSession.currentPointer,
          Boolean(params.session?.shiftConstrain),
        ),
    );
  }

  if (dragSession) {
    return getSelectionFrameForRotation(
      dragSession.previewItems,
      dragSession.frameRotation,
    );
  }

  if (resizeSession) {
    return getGroupResizeFrame(
      resizeSession.bounds,
      resizeSession.handle as never,
      resizeSession.currentPointer,
      resizeSession.frameRotation,
    );
  }

  return baseGroupFrame;
}

export function buildStageDerivedState(params: {
  activeTool?: string;
  canvasBounds: { x: number; y: number; width: number; height: number };
  renderedGroupBounds: { x: number; y: number; width: number; height: number } | null;
  renderedSelectedItems: CanvasItem[];
  renderedSelectionFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  selectedRenderedItem: CanvasItem | null;
  cropSession?: {
    previewItem: CanvasItem;
    fullImageItem: CanvasItem;
  } | null;
  session: {
    kind: string;
    currentPointer?: { x: number; y: number };
    frameRotation?: number;
    handle?: string;
    pointerStart?: { x: number; y: number };
    previewItem?: CanvasItem;
    previewItems?: CanvasItem[];
    tool?: string;
    bounds?: { x: number; y: number; width: number; height: number };
  } | null;
  zoom: number;
  viewport: StageViewportAdapter;
}) {
  const cropSession = params.cropSession ?? null;
  const overlayMetrics = getCanvasOverlayMetrics(params.zoom);
  const groupOverlayFrame = getGroupOverlayFrame({
    renderedGroupBounds: params.renderedGroupBounds,
    renderedSelectionFrame: params.renderedSelectionFrame,
    session: params.session,
  });
  const selectedShapeHandleRects =
    !cropSession &&
    params.renderedSelectedItems.length <= 1 &&
    params.selectedRenderedItem &&
    params.selectedRenderedItem.kind !== 'line'
      ? getResizeHandleViewportRects(
          getShapeOverlayHandlePoints(params.selectedRenderedItem, params.zoom),
          params.viewport.toViewportPoint,
        )
      : null;
  const selectedLineHandleRects =
    !cropSession &&
    params.renderedSelectedItems.length <= 1 &&
    params.selectedRenderedItem?.kind === 'line'
      ? {
          start: getViewportHandleRect(
            params.viewport.toViewportPoint({
              x: params.selectedRenderedItem.startX,
              y: params.selectedRenderedItem.startY,
            }),
          ),
          end: getViewportHandleRect(
            params.viewport.toViewportPoint({
              x: params.selectedRenderedItem.endX,
              y: params.selectedRenderedItem.endY,
            }),
          ),
        }
      : null;
  const marqueeViewportRect =
    params.session?.kind === 'marquee' &&
    params.session.pointerStart &&
    params.session.currentPointer
      ? (() => {
          const rect = normalizeRectFromPoints(
            params.session.pointerStart,
            params.session.currentPointer,
          );
          return params.viewport.toViewportRect(rect);
        })()
      : null;
  const groupOverlayViewportRect = groupOverlayFrame
    ? params.viewport.toViewportRect(groupOverlayFrame.bounds)
    : null;
  const selectedItemViewportRect =
    params.renderedSelectedItems.length <= 1 && params.selectedRenderedItem
      ? params.viewport.toViewportRect(getRenderBox(params.selectedRenderedItem))
      : null;
  const groupHandleViewportPoints = groupOverlayFrame
    ? Object.fromEntries(
        RESIZE_HANDLE_NAMES.map((handle) => {
          const width = groupOverlayFrame.bounds.width;
          const height = groupOverlayFrame.bounds.height;
          const localPoint = {
            x: handle.includes('left')
              ? -width / 2
              : handle.includes('right')
                ? width / 2
                : 0,
            y: handle.includes('top')
              ? -height / 2
              : handle.includes('bottom')
                ? height / 2
                : 0,
          };
          const center = {
            x: groupOverlayFrame.bounds.x + width / 2,
            y: groupOverlayFrame.bounds.y + height / 2,
          };
          return [
            handle,
            params.viewport.toViewportPoint(
              localToStage(localPoint, center, groupOverlayFrame.rotation),
            ),
          ] as const;
        }),
      )
    : null;
  const groupRotaterViewportPoint = groupOverlayFrame
    ? params.viewport.toViewportPoint(
        localToStage(
          { x: 0, y: -(groupOverlayFrame.bounds.height / 2) - overlayMetrics.rotateHandleOffset },
          {
            x: groupOverlayFrame.bounds.x + groupOverlayFrame.bounds.width / 2,
            y: groupOverlayFrame.bounds.y + groupOverlayFrame.bounds.height / 2,
          },
          groupOverlayFrame.rotation,
        ),
      )
    : null;
  const cropHandleViewportPoints = cropSession
    ? Object.fromEntries(
        RESIZE_HANDLE_NAMES.map((handle) => [
          handle,
          params.viewport.toViewportPoint(
            getShapeOverlayHandlePoints(
              cropSession.previewItem as Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
              params.zoom,
            )[handle],
          ),
        ]),
      )
    : null;
  const cropFullImageHandleViewportPoints = cropSession
    ? Object.fromEntries(
        RESIZE_HANDLE_NAMES.map((handle) => [
          handle,
          params.viewport.toViewportPoint(
            getShapeOverlayHandlePoints(
              cropSession.fullImageItem as Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
              params.zoom,
            )[handle],
          ),
        ]),
      )
    : null;
  const cropFullImageRotaterViewportPoint = cropSession
    ? params.viewport.toViewportPoint(
        getShapeOverlayHandlePoints(
          cropSession.fullImageItem as Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
          params.zoom,
        ).rotater,
      )
    : null;

  return {
    cropFullImageHandleViewportPoints,
    cropFullImageRotaterViewportPoint,
    cropHandleViewportPoints,
    groupHandleViewportPoints,
    groupOverlayFrame,
    groupOverlayViewportRect,
    groupRotaterViewportPoint,
    marqueeViewportRect,
    selectedItemViewportRect,
    selectedLineHandleRects,
    selectedShapeHandleRects,
    showGroupInteractionHooks: params.renderedSelectedItems.length > 1 && params.activeTool === 'select',
  };
}
