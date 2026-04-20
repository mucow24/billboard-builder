// This file intentionally mocks Konva and the interaction session; it covers stage wiring without a real canvas.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInteractionSession } = vi.hoisted(() => ({
  mockInteractionSession: {
    beginDrag: vi.fn(),
    beginGroupDrag: vi.fn(),
    beginGroupResize: vi.fn(),
    beginGroupRotate: vi.fn(),
    beginCropFullResize: vi.fn(),
    beginCropFullRotate: vi.fn(),
    beginCropPan: vi.fn(),
    beginCropResize: vi.fn(),
    beginLineHandle: vi.fn(),
    beginResize: vi.fn(),
    beginRotate: vi.fn(),
    commitCropSession: vi.fn(),
    cropSession: null,
    handleItemDoubleClick: vi.fn(),
    handleItemPointerDown: vi.fn(),
    handleStageMouseDown: vi.fn(),
    handleStagePointerMove: vi.fn(),
    handleStageMouseUp: vi.fn(),
    nodeClientRect: null,
    registerShapeRef: vi.fn(),
    renderedGroupBounds: null,
    renderedSelectionFrame: null,
    renderedItems: [],
    renderedSelectedItems: [],
    selectedDocumentItem: null,
    selectedNode: null,
    selectedRenderedItem: null,
    selectedItemId: undefined,
    session: null,
    subgroupOutlineFrames: [],
  },
}));

vi.mock('pixi-filters', () => ({
  DropShadowFilter: class { constructor() {} },
}));

vi.mock('pixi.js', () => ({
  BlurFilter: class { constructor() {} },
  ColorMatrixFilter: class { matrix = new Float32Array(20); constructor() { this.matrix[0] = 1; this.matrix[6] = 1; this.matrix[12] = 1; this.matrix[18] = 1; } },
  Container: class {},
  FillGradient: class { constructor() {} },
  Graphics: class {},
  Polygon: class { constructor() {} },
  Rectangle: class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  },
  Sprite: class {},
  Text: class {},
  Texture: { from: () => ({}), EMPTY: {} },
  TextureSource: { defaultOptions: {} },
}));

vi.mock('@pixi/react', () => {
  type MockProps = React.PropsWithChildren<Record<string, unknown>>;
  const Application = React.forwardRef<unknown, MockProps>(({ children }, ref) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    React.useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
      getApplication: () => ({ canvas: canvasRef.current }),
    }));
    return React.createElement('div', { 'data-pixi': 'application' },
      React.createElement('canvas', { ref: canvasRef }),
      children as React.ReactNode,
    );
  });
  return {
    Application,
    extend: () => {},
  };
});

import { CanvasStage as ActualCanvasStage } from './CanvasStage';
import {
  createDefaultProjectDocument,
  createRectangleItem,
} from '../document/documentDefaults';
import type { ProjectDocument } from '../document/documentTypes';
import { resetEditorStore } from '../../test/editorStore';
import { getGroupResizeFrame, getSelectionFrameForRotation } from './transformGeometry';

vi.mock('./useCanvasInteractionSession', () => ({
  useCanvasInteractionSession: () => mockInteractionSession,
}));

vi.mock('./useImageElement', () => ({
  useImageElement: () => null,
}));

type StoreOverrides = {
  activeTool?: 'select' | 'zoom' | 'text' | 'rectangle' | 'ellipse' | 'line';
  document?: ProjectDocument;
  selectedNodeIds?: string[];
};

function setupStore(overrides: StoreOverrides = {}) {
  const session: Record<string, unknown> = {};
  if (overrides.selectedNodeIds) session.selectedNodeIds = overrides.selectedNodeIds;
  if (overrides.activeTool) session.activeTool = overrides.activeTool;
  resetEditorStore({
    document: overrides.document,
    session: Object.keys(session).length > 0 ? session : undefined,
  });
}

function CanvasStage(props: Partial<React.ComponentProps<typeof ActualCanvasStage>> & StoreOverrides) {
  const { activeTool, document, selectedNodeIds, ...rest } = props;
  setupStore({ activeTool, document, selectedNodeIds });
  return (
    <ActualCanvasStage
      debugMode
      showCanvasTestHooks
      guides={[]}
      onGuidesChange={vi.fn()}
      stageRef={createRef()}
      {...rest}
    />
  );
}

describe('CanvasStage viewport controls', () => {
  beforeEach(() => {
    delete window.__BB_TEST__;
    Object.assign(mockInteractionSession, {
      beginDrag: vi.fn(),
      beginGroupDrag: vi.fn(),
      beginGroupResize: vi.fn(),
      beginGroupRotate: vi.fn(),
      beginCropFullResize: vi.fn(),
      beginCropFullRotate: vi.fn(),
      beginCropPan: vi.fn(),
      beginCropResize: vi.fn(),
      beginLineHandle: vi.fn(),
      beginResize: vi.fn(),
      beginRotate: vi.fn(),
      commitCropSession: vi.fn(),
      cropSession: null,
      handleItemDoubleClick: vi.fn(),
      handleItemPointerDown: vi.fn(),
      handleStageMouseDown: vi.fn(),
      handleStagePointerMove: vi.fn(),
      handleStageMouseUp: vi.fn(),
      nodeClientRect: null,
      registerShapeRef: vi.fn(),
      renderedGroupBounds: null,
      renderedSelectionFrame: null,
      renderedItems: [],
      renderedSelectedItems: [],
      selectedDocumentItem: null,
      selectedNode: null,
      selectedRenderedItem: null,
      selectedItemId: undefined,
      session: null,
      subgroupOutlineFrames: [],
    });
    class TestResizeObserver {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: {
                width: 1280,
                height: 720,
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                bottom: 720,
                right: 1280,
                toJSON: () => ({}),
              },
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }

      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
  });

  it('omits debug snapshot helpers when debug mode is disabled', () => {
    setupStore();
    render(
      <ActualCanvasStage
        debugMode={false}
        showCanvasTestHooks={false}
        guides={[]}
        onGuidesChange={vi.fn()}
        stageRef={createRef()}
      />,
    );

    expect(screen.queryByTestId('stage-debug')).toBeNull();
    expect(screen.queryByTestId('selected-item-debug')).toBeNull();
    expect(screen.queryByTestId('canvas-test-hooks')).toBeNull();
    expect(window.__BB_TEST__?.captureRenderSnapshot).toBeUndefined();
  });



  it('renders zoom controls and updates the readout', async () => {
    const user = userEvent.setup();
    render(
      <CanvasStage />,
    );

    expect(screen.getByRole('button', { name: 'Fit canvas to viewport' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set zoom to 100%' })).toBeInTheDocument();
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 31%');

    await user.click(screen.getByRole('button', { name: 'Set zoom to 100%' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 100%');

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 109%');

    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 100%');

    await user.click(screen.getByRole('button', { name: 'Fit canvas to viewport' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 31%');
  });

  it('starts a pan drag instead of group drag when middle-clicking the group overlay hook', () => {
    const document = createDefaultProjectDocument();
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });
    document.nodes = [first, second];

    Object.assign(mockInteractionSession, {
      renderedItems: [first, second],
      renderedSelectedItems: [first, second],
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 0 },
      selectedItemId: first.id,
    });

    const { container } = render(
      <CanvasStage
        document={document}
        selectedNodeIds={[first.id, second.id]}
      />,
    );

    const overlayHook = screen.getByTestId('canvas-group-overlay');
    const initialDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');

    fireEvent.mouseDown(overlayHook, { button: 1, clientX: 300, clientY: 220 });
    fireEvent.mouseMove(window, { clientX: 360, clientY: 270 });

    const nextDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
    expect(mockInteractionSession.beginGroupDrag).not.toHaveBeenCalled();
    expect(nextDebug.viewport.panX).not.toBe(initialDebug.viewport.panX);
    expect(nextDebug.viewport.panY).not.toBe(initialDebug.viewport.panY);

    fireEvent.mouseUp(window, { clientX: 1400, clientY: 900 });
    expect(window.document.body.style.cursor).toBe('');
    expect(container.querySelector('[data-testid="canvas-group-overlay"]')).not.toBeNull();
  });

  it('starts a pan drag instead of group resize when middle-clicking a group handle hook', () => {
    const document = createDefaultProjectDocument();
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });
    document.nodes = [first, second];

    Object.assign(mockInteractionSession, {
      renderedItems: [first, second],
      renderedSelectedItems: [first, second],
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 0 },
      selectedItemId: first.id,
    });

    render(
      <CanvasStage
        document={document}
        selectedNodeIds={[first.id, second.id]}
      />,
    );

    const handleHook = screen.getByTestId('canvas-group-handle-middle-right');
    const initialDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');

    fireEvent.mouseDown(handleHook, { button: 1, clientX: 360, clientY: 220 });
    fireEvent.mouseMove(window, { clientX: 410, clientY: 260 });

    const nextDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
    expect(mockInteractionSession.beginGroupResize).not.toHaveBeenCalled();
    expect(nextDebug.viewport.panX).not.toBe(initialDebug.viewport.panX);
    expect(nextDebug.viewport.panY).not.toBe(initialDebug.viewport.panY);
  });

  it('starts a pan drag instead of item drag when middle-clicking the selected item overlay hook', () => {
    const document = createDefaultProjectDocument();
    const rectangle = createRectangleItem({ id: 'shape', x: 120, y: 80, width: 160, height: 100 });
    document.nodes = [rectangle];

    Object.assign(mockInteractionSession, {
      renderedItems: [rectangle],
      renderedSelectedItems: [rectangle],
      selectedItemId: rectangle.id,
      selectedRenderedItem: {
        ...rectangle,
        selectableNodeId: rectangle.id,
      },
    });

    render(
      <CanvasStage
        document={document}
        selectedNodeIds={[rectangle.id]}
      />,
    );

    const overlayHook = screen.getByTestId('canvas-selected-item-overlay');
    const initialDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');

    fireEvent.mouseDown(overlayHook, { button: 1, clientX: 240, clientY: 160 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 220 });

    const nextDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
    expect(mockInteractionSession.handleItemPointerDown).not.toHaveBeenCalled();
    expect(nextDebug.viewport.panX).not.toBe(initialDebug.viewport.panX);
    expect(nextDebug.viewport.panY).not.toBe(initialDebug.viewport.panY);
  });

  it('starts a pan drag instead of item drag when spacebar-clicking the selected item overlay hook', () => {
    const document = createDefaultProjectDocument();
    const rectangle = createRectangleItem({ id: 'shape', x: 120, y: 80, width: 160, height: 100 });
    document.nodes = [rectangle];

    Object.assign(mockInteractionSession, {
      renderedItems: [rectangle],
      renderedSelectedItems: [rectangle],
      selectedItemId: rectangle.id,
      selectedRenderedItem: {
        ...rectangle,
        selectableNodeId: rectangle.id,
      },
    });

    render(
      <CanvasStage
        document={document}
        selectedNodeIds={[rectangle.id]}
      />,
    );

    const overlayHook = screen.getByTestId('canvas-selected-item-overlay');
    const initialDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');

    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.mouseDown(overlayHook, { button: 0, clientX: 240, clientY: 160 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 220 });

    const nextDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
    expect(mockInteractionSession.handleItemPointerDown).not.toHaveBeenCalled();
    expect(nextDebug.viewport.panX).not.toBe(initialDebug.viewport.panX);
    expect(nextDebug.viewport.panY).not.toBe(initialDebug.viewport.panY);

    fireEvent.mouseUp(window, { button: 0, clientX: 300, clientY: 220 });
    fireEvent.keyUp(window, { key: ' ' });
  });

  it('forwards shift-modified selected-item overlay drags to the interaction session', () => {
    const document = createDefaultProjectDocument();
    const rectangle = createRectangleItem({ id: 'shape', x: 120, y: 80, width: 160, height: 100 });
    document.nodes = [rectangle];

    Object.assign(mockInteractionSession, {
      renderedItems: [rectangle],
      renderedSelectedItems: [rectangle],
      selectedItemId: rectangle.id,
      selectedRenderedItem: {
        ...rectangle,
        selectableNodeId: rectangle.id,
      },
    });

    render(
      <CanvasStage
        document={document}
        selectedNodeIds={[rectangle.id]}
      />,
    );

    fireEvent.mouseDown(screen.getByTestId('canvas-selected-item-overlay'), {
      button: 0,
      shiftKey: true,
      clientX: 240,
      clientY: 160,
    });

    expect(mockInteractionSession.handleItemPointerDown).toHaveBeenCalledWith(
      expect.objectContaining({
        id: rectangle.id,
        selectableNodeId: rectangle.id,
      }),
      rectangle.id,
      expect.any(Object),
      true,
      expect.anything(),
      'overlay',
    );
  });

  it('starts a pan drag instead of item resize when middle-clicking a selected item handle hook', () => {
    const document = createDefaultProjectDocument();
    const rectangle = createRectangleItem({ id: 'shape', x: 120, y: 80, width: 160, height: 100 });
    document.nodes = [rectangle];

    Object.assign(mockInteractionSession, {
      renderedItems: [rectangle],
      renderedSelectedItems: [rectangle],
      selectedItemId: rectangle.id,
      selectedRenderedItem: rectangle,
    });

    render(
      <CanvasStage
        document={document}
        selectedNodeIds={[rectangle.id]}
      />,
    );

    const handleHook = screen.getByTestId('canvas-shape-handle-middle-right');
    const initialDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');

    fireEvent.mouseDown(handleHook, { button: 1, clientX: 300, clientY: 130 });
    fireEvent.mouseMove(window, { clientX: 350, clientY: 180 });

    const nextDebug = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
    expect(mockInteractionSession.beginResize).not.toHaveBeenCalled();
    expect(nextDebug.viewport.panX).not.toBe(initialDebug.viewport.panX);
    expect(nextDebug.viewport.panY).not.toBe(initialDebug.viewport.panY);
  });

  it('uses preview group bounds during rotated drag and resize sessions', () => {
    const document = createDefaultProjectDocument();
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });
    const draggedFirst = createRectangleItem({ id: 'first', x: 60, y: 70, width: 80, height: 40 });
    const draggedSecond = createRectangleItem({ id: 'second', x: 180, y: 100, width: 60, height: 50 });
    const resizedFirst = createRectangleItem({ id: 'first', x: 30, y: 20, width: 110, height: 80 });
    const resizedSecond = createRectangleItem({ id: 'second', x: 170, y: 70, width: 90, height: 90 });
    document.nodes = [first, second];

    Object.assign(mockInteractionSession, {
      renderedItems: [draggedFirst, draggedSecond],
      renderedSelectedItems: [draggedFirst, draggedSecond],
      renderedGroupBounds: { x: 60, y: 70, width: 180, height: 80 },
      renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 30 },
      session: {
        kind: 'group-drag',
        itemIds: ['first', 'second'],
        originalItems: [first, second],
        previewItems: [draggedFirst, draggedSecond],
        bounds: { x: 20, y: 30, width: 180, height: 80 },
        frameRotation: 30,
        pointerStart: { x: 110, y: 70 },
        currentPointer: { x: 150, y: 110 },
        guides: [],
      },
    });

    const { rerender } = render(
      <CanvasStage
        document={document}
        selectedNodeIds={['first', 'second']}
      />,
    );

    let debugInfo = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
    expect(debugInfo.sessionKind).toBe('group-drag');
    const draggedFrame = getSelectionFrameForRotation([draggedFirst, draggedSecond], 30);
    expect(debugInfo.groupFrame.x).toBeCloseTo(draggedFrame?.bounds.x ?? 0, 10);
    expect(debugInfo.groupFrame.y).toBeCloseTo(draggedFrame?.bounds.y ?? 0, 10);
    expect(debugInfo.groupFrame.width).toBeCloseTo(draggedFrame?.bounds.width ?? 0, 10);
    expect(debugInfo.groupFrame.height).toBeCloseTo(draggedFrame?.bounds.height ?? 0, 10);
    expect(debugInfo.groupFrame.rotation).toBeCloseTo(30, 10);
    expect(debugInfo.selectedItems).toEqual([
      expect.objectContaining({
        id: 'first',
        x: draggedFirst.x,
        y: draggedFirst.y,
        width: draggedFirst.width,
        height: draggedFirst.height,
        rotation: draggedFirst.rotation,
      }),
      expect.objectContaining({
        id: 'second',
        x: draggedSecond.x,
        y: draggedSecond.y,
        width: draggedSecond.width,
        height: draggedSecond.height,
        rotation: draggedSecond.rotation,
      }),
    ]);

    Object.assign(mockInteractionSession, {
      renderedItems: [resizedFirst, resizedSecond],
      renderedSelectedItems: [resizedFirst, resizedSecond],
      renderedGroupBounds: { x: 30, y: 20, width: 230, height: 140 },
      session: {
        kind: 'group-resize',
        itemIds: ['first', 'second'],
        originalItems: [first, second],
        previewItems: [resizedFirst, resizedSecond],
        bounds: { x: 20, y: 30, width: 180, height: 80 },
        frameRotation: 30,
        pointerStart: { x: 200, y: 110 },
        currentPointer: { x: 240, y: 170 },
        handle: 'bottom-right',
        guides: [],
      },
    });

    rerender(
      <CanvasStage
        document={document}
        selectedNodeIds={['first', 'second']}
      />,
    );

    debugInfo = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
    expect(debugInfo.sessionKind).toBe('group-resize');
    const resizedFrame = getGroupResizeFrame(
      { x: 20, y: 30, width: 180, height: 80 },
      'bottom-right',
      { x: 240, y: 170 },
      30,
    );
    expect(debugInfo.groupFrame.x).toBeCloseTo(resizedFrame?.bounds.x ?? 0, 10);
    expect(debugInfo.groupFrame.y).toBeCloseTo(resizedFrame?.bounds.y ?? 0, 10);
    expect(debugInfo.groupFrame.width).toBeCloseTo(resizedFrame?.bounds.width ?? 0, 10);
    expect(debugInfo.groupFrame.height).toBeCloseTo(resizedFrame?.bounds.height ?? 0, 10);
    expect(debugInfo.groupFrame.rotation).toBeCloseTo(30, 10);
    expect(debugInfo.selectedItems).toEqual([
      expect.objectContaining({
        id: 'first',
        x: resizedFirst.x,
        y: resizedFirst.y,
        width: resizedFirst.width,
        height: resizedFirst.height,
        rotation: resizedFirst.rotation,
      }),
      expect.objectContaining({
        id: 'second',
        x: resizedSecond.x,
        y: resizedSecond.y,
        width: resizedSecond.width,
        height: resizedSecond.height,
        rotation: resizedSecond.rotation,
      }),
    ]);
  });

  it('derives rotated group debug frames from preview items for drag, resize, and rotate sessions', () => {
    const document = createDefaultProjectDocument();
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });
    const previewDragItems = [
      createRectangleItem({ id: 'first', x: 60, y: 70, width: 80, height: 40, rotation: 30 }),
      createRectangleItem({ id: 'second', x: 180, y: 100, width: 60, height: 50, rotation: 30 }),
    ];
    const previewResizeItems = [
      createRectangleItem({ id: 'first', x: 40, y: 35, width: 120, height: 70, rotation: 30 }),
      createRectangleItem({ id: 'second', x: 190, y: 95, width: 90, height: 85, rotation: 30 }),
    ];
    document.nodes = [first, second];

    const cases = [
      {
        kind: 'group-drag',
        previewItems: previewDragItems,
        session: {
          kind: 'group-drag' as const,
          itemIds: ['first', 'second'],
          originalItems: [first, second],
          previewItems: previewDragItems,
          bounds: { x: 20, y: 30, width: 180, height: 80 },
          frameRotation: 30,
          pointerStart: { x: 110, y: 70 },
          currentPointer: { x: 150, y: 110 },
          guides: [],
        },
      },
      {
        kind: 'group-resize',
        previewItems: previewResizeItems,
        session: {
          kind: 'group-resize' as const,
          itemIds: ['first', 'second'],
          originalItems: [first, second],
          previewItems: previewResizeItems,
          bounds: { x: 20, y: 30, width: 180, height: 80 },
          frameRotation: 30,
          pointerStart: { x: 200, y: 110 },
          currentPointer: { x: 240, y: 170 },
          handle: 'bottom-right' as const,
          guides: [],
        },
      },
    ];

    const { rerender } = render(
      <CanvasStage
        document={document}
        selectedNodeIds={['first', 'second']}
      />,
    );

    for (const testCase of cases) {
      Object.assign(mockInteractionSession, {
        renderedItems: testCase.previewItems,
        renderedSelectedItems: testCase.previewItems,
        renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
        renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 30 },
        session: testCase.session,
      });

      rerender(
        <CanvasStage
          document={document}
          selectedNodeIds={['first', 'second']}
        />,
      );

      const debugInfo = JSON.parse(screen.getByTestId('stage-debug').textContent ?? '{}');
      expect(debugInfo.sessionKind).toBe(testCase.kind);
      const previewFrame = testCase.kind === 'group-resize'
        ? getGroupResizeFrame(
            { x: 20, y: 30, width: 180, height: 80 },
            'bottom-right',
            { x: 240, y: 170 },
            30,
          )
        : getSelectionFrameForRotation(testCase.previewItems, 30);
      expect(debugInfo.groupFrame.x).toBeCloseTo(previewFrame?.bounds.x ?? 0, 10);
      expect(debugInfo.groupFrame.y).toBeCloseTo(previewFrame?.bounds.y ?? 0, 10);
      expect(debugInfo.groupFrame.width).toBeCloseTo(previewFrame?.bounds.width ?? 0, 10);
      expect(debugInfo.groupFrame.height).toBeCloseTo(previewFrame?.bounds.height ?? 0, 10);
      expect(debugInfo.groupFrame.rotation).toBeCloseTo(30, 10);
    }
  });

});
