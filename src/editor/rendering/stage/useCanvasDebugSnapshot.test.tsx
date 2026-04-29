import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createLineItem,
  createRectangleItem,
} from '../../document/documentDefaults';

import { useCanvasDebugSnapshot } from './useCanvasDebugSnapshot';

describe('useCanvasDebugSnapshot', () => {
  afterEach(() => {
    delete window.__BB_TEST__;
  });

  it('builds debug info for the current selection and preview state', () => {
    const rectangle = createRectangleItem({ id: 'shape', x: 10, y: 20, width: 80, height: 50 });
    const preview = createRectangleItem({ id: 'preview', x: 15, y: 25, width: 90, height: 60 });

    const { result, unmount } = renderHook(() =>
      useCanvasDebugSnapshot({
        beginGroupDrag: () => {},
        beginGroupResize: () => {},
        beginGroupRotate: () => {},
        startPanDrag: () => {},
        groupHandleViewportPoints: { 'middle-right': { x: 200, y: 160 } },
        groupOverlayFrame: { bounds: { x: 10, y: 20, width: 80, height: 50 }, rotation: 15 },
        groupOverlayViewportRect: { left: 100, top: 120, width: 160, height: 100 },
        groupRotaterViewportPoint: { x: 180, y: 80 },
        lastTestHookEvent: 'group-overlay',
        marqueeViewportRect: { left: 30, top: 40, width: 50, height: 60 },
        nodeClientRect: { x: 10, y: 20, width: 80, height: 50 },
        pan: { x: 100, y: 120 },
        lastDrilldownSource: 'item-hit',
        previewItem: preview,
        renderedItems: [rectangle],
        renderedSelectedItems: [rectangle],
        selectedDocumentItem: rectangle,
        selectedNodeIds: [rectangle.id],
        selectedItemViewportRect: { left: 110, top: 140, width: 160, height: 100 },
        selectedLineHandleRects: null,
        selectedNode: {
          x: () => rectangle.x,
          y: () => rectangle.y,
          rotation: () => rectangle.rotation,
          scaleX: () => rectangle.scaleX,
          scaleY: () => rectangle.scaleY,
        },
        selectedRenderedItem: rectangle,
        selectedShapeHandleRects: { rotater: { left: 140, top: 70, width: 16, height: 16 } },
        session: { kind: 'group-resize', handle: 'middle-right' },
        rendererReady: false,
        showGroupInteractionHooks: true,
        stageRef: { current: null },
        subgroupOutlineFrames: [{ nodeId: 'group-1', bounds: { x: 8, y: 18, width: 84, height: 54 } }],
        viewportRef: { current: null },
        viewportSize: { width: 1280, height: 720 },
        zoom: 2,
      }),
    );

    expect(result.current.sessionKind).toBe('group-resize');
    expect(result.current.sessionHandle).toBe('middle-right');
    expect(result.current.documentItem).toEqual(
      expect.objectContaining({ id: rectangle.id, x: rectangle.x, y: rectangle.y }),
    );
    expect(result.current.previewItem).toEqual(
      expect.objectContaining({ id: preview.id, x: preview.x, y: preview.y }),
    );
    expect(result.current.handles).toEqual(
      expect.objectContaining({
        rightMiddle: expect.objectContaining({ x: 90, y: 45 }),
      }),
    );
    expect(result.current.groupFrame).toEqual(
      expect.objectContaining({ x: 10, y: 20, width: 80, height: 50, rotation: 15 }),
    );
    expect(result.current.subgroupOutlineFrames).toEqual([
      expect.objectContaining({ x: 8, y: 18, width: 84, height: 54 }),
    ]);
    expect(result.current.hasGroupOverlay).toBe(true);
    expect(result.current.hasShapeHandles).toBe(true);
    expect(result.current.hasLineHandles).toBe(false);
    expect(result.current.lastDrilldownSource).toBe('item-hit');

    unmount();
    expect(window.__BB_TEST__).toBeUndefined();
  });

  it('registers a snapshot function that reads selected item geometry and group hook overlays', () => {
    const rectangle = createRectangleItem({ id: 'shape', x: 10, y: 20, width: 80, height: 50 });
    const line = createLineItem({ id: 'line', startX: 20, startY: 30, endX: 120, endY: 80 });

    const overlay = document.createElement('div');
    overlay.dataset.testid = 'canvas-group-overlay';
    overlay.style.left = '100px';
    overlay.style.top = '120px';
    overlay.style.width = '200px';
    overlay.style.height = '80px';
    overlay.style.transform = 'rotate(15deg)';

    const handle = document.createElement('div');
    handle.dataset.testid = 'canvas-group-handle-middle-right';
    handle.getBoundingClientRect = () =>
      ({
        left: 210,
        top: 150,
        width: 16,
        height: 16,
        right: 226,
        bottom: 166,
        x: 210,
        y: 150,
        toJSON: () => ({}),
      }) as DOMRect;

    const rotater = document.createElement('div');
    rotater.dataset.testid = 'canvas-group-rotater';
    rotater.getBoundingClientRect = () =>
      ({
        left: 180,
        top: 70,
        width: 16,
        height: 16,
        right: 196,
        bottom: 86,
        x: 180,
        y: 70,
        toJSON: () => ({}),
      }) as DOMRect;

    const shapeHandle = document.createElement('div');
    shapeHandle.dataset.testid = 'canvas-shape-handle-rotater';

    const root = document.createElement('div');
    root.append(overlay, handle, rotater, shapeHandle);

    renderHook(() =>
      useCanvasDebugSnapshot({
        beginGroupDrag: () => {},
        beginGroupResize: () => {},
        beginGroupRotate: () => {},
        startPanDrag: () => {},
        groupHandleViewportPoints: null,
        groupOverlayFrame: null,
        groupOverlayViewportRect: null,
        groupRotaterViewportPoint: null,
        lastTestHookEvent: null,
        marqueeViewportRect: null,
        nodeClientRect: null,
        pan: { x: 100, y: 120 },
        lastDrilldownSource: 'stage-surface',
        previewItem: null,
        renderedItems: [rectangle, line],
        renderedSelectedItems: [rectangle, line],
        selectedDocumentItem: rectangle,
        selectedNodeIds: ['shape', 'line'],
        selectedItemViewportRect: null,
        selectedLineHandleRects: { start: { left: 10, top: 20, width: 16, height: 16 } },
        selectedNode: null,
        selectedRenderedItem: rectangle,
        selectedShapeHandleRects: { rotater: { left: 140, top: 70, width: 16, height: 16 } },
        session: { kind: 'group-drag' },
        rendererReady: false,
        showGroupInteractionHooks: true,
        stageRef: { current: null },
        subgroupOutlineFrames: [{ nodeId: 'group-1', bounds: { x: 14, y: 22, width: 108, height: 76 } }],
        viewportRef: { current: root },
        viewportSize: { width: 1280, height: 720 },
        zoom: 2,
      }),
    );

    const snapshot = window.__BB_TEST__?.captureRenderSnapshot?.() as {
      sessionKind: string;
      selectedItems: Array<{ id: string; geometry: { width: number; height: number } }>;
      groupOverlay: { rotation: number; width: number };
      groupHandles: Record<string, { x: number; y: number }>;
      groupRotater: { x: number; y: number };
      subgroupOutlines: Array<{ x: number; y: number; width: number; height: number }>;
      hasGroupOverlay: boolean;
      hasShapeHandles: boolean;
      hasLineHandles: boolean;
    };

    expect(snapshot.sessionKind).toBe('group-drag');
    expect(snapshot.selectedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'shape',
          geometry: expect.objectContaining({ width: 80, height: 50 }),
        }),
        expect.objectContaining({
          id: 'line',
          geometry: expect.objectContaining({ width: 100, height: 50 }),
        }),
      ]),
    );
    expect(snapshot.groupOverlay).toEqual(
      expect.objectContaining({ rotation: 15, width: 100 }),
    );
    expect(snapshot.groupHandles['middle-right']).toEqual(
      expect.objectContaining({ x: 218, y: 158 }),
    );
    expect(snapshot.groupRotater).toEqual(expect.objectContaining({ x: 188, y: 78 }));
    expect(snapshot.subgroupOutlines).toEqual([
      expect.objectContaining({ x: 14, y: 22, width: 108, height: 76 }),
    ]);
    expect(snapshot.hasGroupOverlay).toBe(true);
    expect(snapshot.hasShapeHandles).toBe(true);
    expect(snapshot.hasLineHandles).toBe(false);
  });
});
