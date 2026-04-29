import { useEffect, useMemo } from 'react';

import type { CanvasItem } from '../../document/documentTypes';
import {
  getLineHandleRects,
  getShapeHandleRects,
  localToStage,
  RESIZE_HANDLE_NAMES,
  type Point,
} from '../interactionGeometry';
import type { CanvasRendererHandle } from '../renderer/canvasRendererTypes';
import { getRenderBox } from '../transformGeometry';
import { useCanvasTestApi } from './canvasTestApi';
import { getShapeOverlayHandlePoints } from './overlayGeometry';

// `Window.__BB_TEST__` is declared in `./canvasTestApi.ts`; both files share it.

function buildHandleDebug(clientRect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    rightMiddle: {
      x: clientRect.x + clientRect.width,
      y: clientRect.y + clientRect.height / 2,
    },
    rotater: {
      x: clientRect.x + clientRect.width / 2,
      y: clientRect.y - 50,
    },
  };
}

function parseRotationDegrees(transform: string | null): number {
  if (!transform) {
    return 0;
  }
  const match = /rotate\((-?\d+(?:\.\d+)?)deg\)/.exec(transform);
  return match ? Number(match[1]) : 0;
}

function readViewportHookRect(node: HTMLElement | null) {
  if (!node) {
    return null;
  }
  const width = Number.parseFloat(node.style.width || '0');
  const height = Number.parseFloat(node.style.height || '0');
  const left = Number.parseFloat(node.style.left || '0');
  const top = Number.parseFloat(node.style.top || '0');
  return {
    left,
    top,
    width,
    height,
    center: {
      x: left + width / 2,
      y: top + height / 2,
    },
    rotation: parseRotationDegrees(node.style.transform || null),
  };
}

function readViewportHookPoint(node: HTMLElement | null) {
  if (!node) {
    return null;
  }
  const bounds = node.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

interface UseCanvasDebugSnapshotParams {
  cropFullImageHandleViewportPoints?: Record<string, Point> | null;
  cropFullImageRotaterViewportPoint?: Point | null;
  cropHandleViewportPoints?: Record<string, Point> | null;
  cropSession?: {
    crop: { x: number; y: number; width: number; height: number };
    fullImageItem: CanvasItem;
    previewItem: CanvasItem;
  } | null;
  groupHandleViewportPoints: Record<string, Point> | null;
  groupOverlayFrame: { bounds: { x: number; y: number; width: number; height: number }; rotation: number } | null;
  groupOverlayViewportRect: { left: number; top: number; width: number; height: number } | null;
  groupRotaterViewportPoint: Point | null;
  lastTestHookEvent: string | null;
  marqueeViewportRect: { left: number; top: number; width: number; height: number } | null;
  nodeClientRect: { x: number; y: number; width: number; height: number } | null;
  pan: Point;
  lastDrilldownSource: 'item-hit' | 'stage-surface' | null;
  previewItem: CanvasItem | null;
  renderedItems: CanvasItem[];
  renderedSelectedItems: CanvasItem[];
  selectedDocumentItem: CanvasItem | null;
  selectedNodeIds: string[];
  selectedItemViewportRect: { left: number; top: number; width: number; height: number } | null;
  selectedLineHandleRects: Record<string, { left: number; top: number; width: number; height: number }> | null;
  selectedNode: {
    rotation: () => number;
    scaleX: () => number;
    scaleY: () => number;
    x: () => number;
    y: () => number;
  } | null;
  rendererReady?: boolean;
  selectedRenderedItem: CanvasItem | null;
  selectedShapeHandleRects: Record<string, { left: number; top: number; width: number; height: number }> | null;
  session: { kind: string; handle?: string } | null;
  showGroupInteractionHooks: boolean;
  stageRef: React.RefObject<CanvasRendererHandle | null>;
  subgroupOutlineFrames: Array<{
    nodeId: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  viewportSize: { width: number; height: number };
  zoom: number;
}

export function useCanvasDebugSnapshot({
  cropFullImageHandleViewportPoints = null,
  cropFullImageRotaterViewportPoint = null,
  cropHandleViewportPoints = null,
  cropSession = null,
  groupHandleViewportPoints,
  groupOverlayFrame,
  groupOverlayViewportRect,
  groupRotaterViewportPoint,
  lastTestHookEvent,
  marqueeViewportRect,
  nodeClientRect,
  pan,
  lastDrilldownSource,
  previewItem,
  renderedItems,
  renderedSelectedItems,
  selectedDocumentItem,
  selectedNodeIds,
  selectedItemViewportRect,
  selectedLineHandleRects,
  selectedNode,
  selectedRenderedItem,
  selectedShapeHandleRects,
  rendererReady = false,
  session,
  showGroupInteractionHooks,
  stageRef,
  subgroupOutlineFrames,
  viewportRef,
  viewportSize,
  zoom,
}: UseCanvasDebugSnapshotParams) {
  // Register the in-page test API on `window.__BB_TEST__` for e2e tests to
  // drive item interactions by id rather than by canvas coordinates.
  useCanvasTestApi({ stageRef, renderedItems, pan, zoom, rendererReady });

  const debugInfo = useMemo(
    () => ({
      stageSize: viewportSize,
      renderedItemCount: renderedItems.length,
      viewport: {
        zoom,
        panX: pan.x,
        panY: pan.y,
      },
      sessionKind: cropSession ? 'image-crop' : session?.kind ?? null,
      sessionHandle:
        session?.kind === 'resize' ||
        session?.kind === 'rotate' ||
        session?.kind === 'line-handle' ||
        session?.kind === 'group-resize' ||
        session?.kind === 'group-rotate'
          ? session.handle ?? null
          : null,
      activeAnchor:
        session?.kind === 'resize' ||
        session?.kind === 'rotate' ||
        session?.kind === 'group-resize' ||
        session?.kind === 'group-rotate'
          ? session.handle ?? null
          : null,
      cropSession: cropSession
        ? {
            crop: cropSession.crop,
            previewItem: {
              ...getRenderBox(cropSession.previewItem),
              rotation: cropSession.previewItem.rotation,
            },
            fullImageItem: {
              ...getRenderBox(cropSession.fullImageItem),
              rotation: cropSession.fullImageItem.rotation,
            },
            cropHandlePoints:
              cropSession.previewItem.kind !== 'line'
                ? getShapeOverlayHandlePoints(cropSession.previewItem, zoom)
                : null,
            fullImageHandlePoints:
              cropSession.fullImageItem.kind !== 'line'
                ? getShapeOverlayHandlePoints(cropSession.fullImageItem, zoom)
                : null,
            cropHandleViewportPoints,
            fullImageHandleViewportPoints: cropFullImageHandleViewportPoints,
            fullImageRotaterViewportPoint: cropFullImageRotaterViewportPoint,
          }
        : null,
      documentItem: selectedDocumentItem
        ? {
            ...getRenderBox(selectedDocumentItem),
            rotation: selectedDocumentItem.rotation,
            kind: selectedDocumentItem.kind,
            id: selectedDocumentItem.id,
          }
        : null,
      previewItem: previewItem
        ? {
            ...getRenderBox(previewItem),
            rotation: previewItem.rotation,
            kind: previewItem.kind,
            id: previewItem.id,
          }
        : null,
      node: selectedNode
        ? {
            x: selectedNode.x(),
            y: selectedNode.y(),
            rotation: selectedNode.rotation(),
            scaleX: selectedNode.scaleX(),
            scaleY: selectedNode.scaleY(),
          }
        : null,
      nodeClientRect,
      anchorClientRects:
        selectedRenderedItem && selectedRenderedItem.kind !== 'line'
          ? getShapeHandleRects(selectedRenderedItem)
          : null,
      handles: nodeClientRect ? buildHandleDebug(nodeClientRect) : null,
      lineHandleRects:
        selectedRenderedItem?.kind === 'line'
          ? getLineHandleRects(selectedRenderedItem)
          : null,
      selectedItemViewportRect,
      marqueeViewportRect,
      groupOverlayViewportRect,
      groupHandleViewportPoints,
      groupRotaterViewportPoint,
      subgroupOutlineFrames: subgroupOutlineFrames.map((frame) => ({
        ...frame.bounds,
      })),
      hasGroupOverlay: showGroupInteractionHooks,
      hasShapeHandles: Boolean(selectedShapeHandleRects),
      hasLineHandles: Boolean(selectedLineHandleRects),
      lastDrilldownSource,
      selectedItems: renderedSelectedItems.map((item) =>
        item.kind === 'line'
          ? {
              ...getRenderBox(item),
              kind: item.kind,
              id: item.id,
              rotation: 0,
              startX: item.startX,
              startY: item.startY,
              endX: item.endX,
              endY: item.endY,
            }
          : {
              ...getRenderBox(item),
              kind: item.kind,
              id: item.id,
              rotation: item.rotation,
            },
      ),
      groupFrame: groupOverlayFrame
        ? {
            ...groupOverlayFrame.bounds,
            rotation: groupOverlayFrame.rotation,
          }
        : null,
      lastTestHookEvent,
    }),
    [
      groupHandleViewportPoints,
      groupOverlayFrame,
      groupOverlayViewportRect,
      groupRotaterViewportPoint,
      lastTestHookEvent,
      marqueeViewportRect,
      nodeClientRect,
      renderedItems.length,
      pan.x,
      pan.y,
      lastDrilldownSource,
      previewItem,
      renderedSelectedItems,
      selectedDocumentItem,
      selectedNode,
      selectedRenderedItem,
      selectedShapeHandleRects,
      selectedLineHandleRects,
      session,
      selectedItemViewportRect,
      showGroupInteractionHooks,
      subgroupOutlineFrames,
      viewportSize,
      zoom,
      cropFullImageHandleViewportPoints,
      cropFullImageRotaterViewportPoint,
      cropHandleViewportPoints,
      cropSession,
    ],
  );

  useEffect(() => {
    function captureRenderSnapshot() {
      const root = viewportRef.current;
      if (!root) {
        return null;
      }

      const selectedItems = renderedItems
        .filter((item) => selectedNodeIds.includes(item.id))
        .map((item) => {
          if (item.kind === 'line') {
            return {
              id: item.id,
              kind: item.kind,
              outlinePoints: [
                { x: item.startX, y: item.startY },
                { x: item.endX, y: item.endY },
              ],
              geometry: {
                x: Math.min(item.startX, item.endX),
                y: Math.min(item.startY, item.endY),
                width: Math.max(1, Math.abs(item.endX - item.startX)),
                height: Math.max(1, Math.abs(item.endY - item.startY)),
                rotation: 0,
              },
            };
          }

          const box = getRenderBox(item);
          const origin = { x: box.x, y: box.y };
          const rotation = item.rotation;
          const outlinePoints = [
            localToStage({ x: 0, y: 0 }, origin, rotation),
            localToStage({ x: box.width, y: 0 }, origin, rotation),
            localToStage({ x: box.width, y: box.height }, origin, rotation),
            localToStage({ x: 0, y: box.height }, origin, rotation),
          ];
          return {
            id: item.id,
            kind: item.kind,
            outlinePoints,
            geometry: {
              x: origin.x,
              y: origin.y,
              width: box.width,
              height: box.height,
              rotation,
            },
          };
        });

      const overlay = readViewportHookRect(
        root.querySelector<HTMLElement>('[data-testid="canvas-group-overlay"]'),
      );
      const cropPanOverlay = readViewportHookRect(
        root.querySelector<HTMLElement>('[data-testid="canvas-crop-pan-overlay"]'),
      );
      const handles = Object.fromEntries(
        RESIZE_HANDLE_NAMES.flatMap((handle) => {
          const point = readViewportHookPoint(
            root.querySelector<HTMLElement>(`[data-testid="canvas-group-handle-${handle}"]`),
          );
          return point ? [[handle, point] as const] : [];
        }),
      );
      const rotater = readViewportHookPoint(
        root.querySelector<HTMLElement>('[data-testid="canvas-group-rotater"]'),
      );
      const hasShapeHandles = Boolean(
        root.querySelector<HTMLElement>('[data-testid^="canvas-shape-handle-"]'),
      );
      const hasLineHandles = Boolean(
        root.querySelector<HTMLElement>('[data-testid^="canvas-line-handle-"]'),
      );

      const canvasOverlay = overlay
        ? {
            x: (overlay.left - pan.x) / zoom,
            y: (overlay.top - pan.y) / zoom,
            width: overlay.width / zoom,
            height: overlay.height / zoom,
            center: {
              x: (overlay.center.x - pan.x) / zoom,
              y: (overlay.center.y - pan.y) / zoom,
            },
            rotation: overlay.rotation,
            viewportRect: overlay,
          }
        : null;

      return {
        sessionKind: cropSession ? 'image-crop' : session?.kind ?? null,
        sessionHandle:
          session?.kind === 'resize' ||
          session?.kind === 'rotate' ||
          session?.kind === 'line-handle' ||
          session?.kind === 'group-resize' ||
          session?.kind === 'group-rotate'
            ? session.handle ?? null
            : null,
        viewport: {
          zoom,
          panX: pan.x,
          panY: pan.y,
        },
        selectedNodeIds: [...selectedNodeIds],
        selectedItems,
        groupOverlay: canvasOverlay,
        groupHandles: handles,
        groupRotater: rotater,
        subgroupOutlines: subgroupOutlineFrames.map((f) => f.bounds),
        hasGroupOverlay: Boolean(canvasOverlay),
        hasShapeHandles,
        hasLineHandles,
        cropPanOverlay,
      };
    }

    window.__BB_TEST__ = {
      ...window.__BB_TEST__,
      captureRenderSnapshot,
    };

    return () => {
      if (!window.__BB_TEST__) {
        return;
      }
      delete window.__BB_TEST__.captureRenderSnapshot;
      if (Object.keys(window.__BB_TEST__).length === 0) {
        delete window.__BB_TEST__;
      }
    };
  }, [cropSession, pan.x, pan.y, renderedItems, selectedNodeIds, session, subgroupOutlineFrames, viewportRef, zoom]);

  return debugInfo;
}
