import { useEffect, useMemo } from 'react';
import type Konva from 'konva';

import type { CanvasItem } from '../../document/documentTypes';
import {
  getLineHandleRects,
  getShapeHandleRects,
  localToStage,
  RESIZE_HANDLE_NAMES,
  type Point,
} from '../interactionGeometry';
import { getRenderBox } from '../transformGeometry';

declare global {
  interface Window {
    __BB_TEST__?: {
      captureRenderSnapshot?: () => unknown;
    };
  }
}

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
  groupHandleViewportPoints: Record<string, Point> | null;
  groupOverlayFrame: { bounds: { x: number; y: number; width: number; height: number }; rotation: number } | null;
  groupOverlayViewportRect: { left: number; top: number; width: number; height: number } | null;
  groupRotaterViewportPoint: Point | null;
  lastTestHookEvent: string | null;
  marqueeViewportRect: { left: number; top: number; width: number; height: number } | null;
  nodeClientRect: { x: number; y: number; width: number; height: number } | null;
  pan: Point;
  previewItem: CanvasItem | null;
  renderedItems: CanvasItem[];
  renderedSelectedItems: CanvasItem[];
  selectedDocumentItem: CanvasItem | null;
  selectedItemIds: string[];
  selectedItemViewportRect: { left: number; top: number; width: number; height: number } | null;
  selectedLineHandleRects: Record<string, { left: number; top: number; width: number; height: number }> | null;
  selectedNode: {
    rotation: () => number;
    scaleX: () => number;
    scaleY: () => number;
    x: () => number;
    y: () => number;
  } | null;
  selectedRenderedItem: CanvasItem | null;
  selectedShapeHandleRects: Record<string, { left: number; top: number; width: number; height: number }> | null;
  session: { kind: string; handle?: string } | null;
  showGroupInteractionHooks: boolean;
  stageRef: React.RefObject<Konva.Stage | null>;
  subgroupOutlineFrames: Array<{
    nodeId: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  viewportSize: { width: number; height: number };
  zoom: number;
}

export function useCanvasDebugSnapshot({
  groupHandleViewportPoints,
  groupOverlayFrame,
  groupOverlayViewportRect,
  groupRotaterViewportPoint,
  lastTestHookEvent,
  marqueeViewportRect,
  nodeClientRect,
  pan,
  previewItem,
  renderedItems,
  renderedSelectedItems,
  selectedDocumentItem,
  selectedItemIds,
  selectedItemViewportRect,
  selectedLineHandleRects,
  selectedNode,
  selectedRenderedItem,
  selectedShapeHandleRects,
  session,
  showGroupInteractionHooks,
  stageRef,
  subgroupOutlineFrames,
  viewportRef,
  viewportSize,
  zoom,
}: UseCanvasDebugSnapshotParams) {
  const debugInfo = useMemo(
    () => ({
      stageSize: viewportSize,
      viewport: {
        zoom,
        panX: pan.x,
        panY: pan.y,
      },
      sessionKind: session?.kind ?? null,
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
      pan.x,
      pan.y,
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
    ],
  );

  useEffect(() => {
    function captureRenderSnapshot() {
      const stage = stageRef.current;
      const root = viewportRef.current;
      if (!stage || !root) {
        return null;
      }

      const selectedItems = renderedItems
        .filter((item) => selectedItemIds.includes(item.id))
        .map((item) => {
          const node = stage.findOne(`#render-item-${item.id}`);
          if (!node) {
            return null;
          }

          if (item.kind === 'line') {
            const points = (node as Konva.Line).points();
            return {
              id: item.id,
              kind: item.kind,
              outlinePoints: [
                { x: points[0], y: points[1] },
                { x: points[2], y: points[3] },
              ],
              geometry: {
                x: Math.min(points[0], points[2]),
                y: Math.min(points[1], points[3]),
                width: Math.max(1, Math.abs(points[2] - points[0])),
                height: Math.max(1, Math.abs(points[3] - points[1])),
                rotation: 0,
              },
            };
          }

          const renderWidth = Number(node.getAttr('renderWidth') ?? 0);
          const renderHeight = Number(node.getAttr('renderHeight') ?? 0);
          const origin = { x: node.x(), y: node.y() };
          const rotation = node.rotation();
          const outlinePoints = [
            localToStage({ x: 0, y: 0 }, origin, rotation),
            localToStage({ x: renderWidth, y: 0 }, origin, rotation),
            localToStage({ x: renderWidth, y: renderHeight }, origin, rotation),
            localToStage({ x: 0, y: renderHeight }, origin, rotation),
          ];
          return {
            id: item.id,
            kind: item.kind,
            outlinePoints,
            geometry: {
              x: origin.x,
              y: origin.y,
              width: renderWidth,
              height: renderHeight,
              rotation,
            },
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const overlay = readViewportHookRect(
        root.querySelector<HTMLElement>('[data-testid="canvas-group-overlay"]'),
      );
      const subgroupOutlines = stage
        .find('.subgroup-selection-outline')
        .map((node) => {
          const x = Number(node.getAttr('x') ?? 0);
          const y = Number(node.getAttr('y') ?? 0);
          const width = Number(node.getAttr('width') ?? 0);
          const height = Number(node.getAttr('height') ?? 0);
          return { x, y, width, height };
        });
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
        sessionKind: session?.kind ?? null,
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
        selectedItemIds: [...selectedItemIds],
        selectedItems,
        groupOverlay: canvasOverlay,
        groupHandles: handles,
        groupRotater: rotater,
        subgroupOutlines,
        hasGroupOverlay: Boolean(canvasOverlay),
        hasShapeHandles,
        hasLineHandles,
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
  }, [pan.x, pan.y, renderedItems, selectedItemIds, session, stageRef, viewportRef, zoom]);

  return debugInfo;
}
