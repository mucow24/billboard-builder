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

vi.mock('konva', () => ({
  default: {
    Filters: {
      Brighten: Symbol('Brighten'),
      Contrast: Symbol('Contrast'),
      RGBA: Symbol('RGBA'),
    },
  },
}));

import { CanvasStage as ActualCanvasStage } from './CanvasStage';
import {
  createDefaultProjectDocument,
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import type Konva from 'konva';
import { getLineHandleRects, getShapeHandlePoints } from './interactionGeometry';
import { getGroupResizeFrame, getSelectionFrameForRotation } from './transformGeometry';

vi.mock('react-konva', () => {
  type MockKonvaProps = React.PropsWithChildren<Record<string, unknown>>;
  const noop = () => {};
  function buildKonvaEvent(
    event: MouseEvent | WheelEvent,
    nodeRef: HTMLDivElement | null,
  ) {
    const stage = {
      getPointerPosition: () => ({
        x: event.clientX || 640,
        y: event.clientY || 360,
      }),
    };

    return {
      cancelBubble: false,
      evt: event,
      target: Object.assign(nodeRef ?? event.target ?? {}, {
        getStage: () => stage,
      }),
    };
  }

  const make = (name: string) =>
    React.forwardRef<HTMLDivElement, MockKonvaProps>(({ children, ...props }, ref) => {
      let nodeRef: HTMLDivElement | null = null;
      const entries = Object.entries(props).flatMap<[string, unknown]>(([key, value]) => {
          if (value === undefined) {
            return [];
          }
          if (typeof value === 'function') {
            if (/^on(MouseDown|MouseUp|MouseMove|MouseLeave|Wheel|DblClick)$/.test(key)) {
              const domEventName = key === 'onDblClick' ? 'onDoubleClick' : key;
              return [[
                domEventName,
                (event: MouseEvent | WheelEvent) => {
                  value(buildKonvaEvent(event, nodeRef));
                },
              ]];
            }
            return /^(onClick|onWheel)/.test(key) ? [[key, value]] : [];
          }
          return [[`data-prop-${key.toLowerCase()}`, typeof value === 'object' ? JSON.stringify(value) : String(value)]];
        });
      const domProps = Object.fromEntries(entries);
      const setRef = (node: HTMLDivElement | null) => {
        nodeRef = node;
        if (node) {
          Object.assign(node, {
            alpha: noop,
            blue: noop,
            brightness: noop,
            cache: noop,
            clearCache: noop,
            contrast: noop,
            filters: noop,
            getStage: () => ({
              getPointerPosition: () => ({ x: 640, y: 360 }),
            }),
            getLayer: () => ({
              batchDraw: noop,
            }),
            green: noop,
            hasName: (value: string) => String(props.name ?? '').split(' ').includes(value),
            name: () => String(props.name ?? ''),
            red: noop,
          });
        }
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      };
      return React.createElement(
        'div',
        { ref: setRef, 'data-konva-node': name, ...domProps },
        children as React.ReactNode,
      );
    });

  return {
    Stage: make('Stage'),
    Layer: make('Layer'),
    Group: make('Group'),
    Rect: make('Rect'),
    Line: make('Line'),
    Text: make('Text'),
    Circle: make('Circle'),
    Ellipse: make('Ellipse'),
    Image: make('Image'),
  };
});

vi.mock('./useCanvasInteractionSession', () => ({
  useCanvasInteractionSession: () => mockInteractionSession,
}));

vi.mock('./useImageElement', () => ({
  useImageElement: () => null,
}));

function CanvasStage(props: React.ComponentProps<typeof ActualCanvasStage>) {
  return <ActualCanvasStage debugMode showCanvasTestHooks {...props} />;
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
    render(
      <ActualCanvasStage
        activeTool="select"
        debugMode={false}
        showCanvasTestHooks={false}
        document={createDefaultProjectDocument()}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    expect(screen.queryByTestId('stage-debug')).toBeNull();
    expect(screen.queryByTestId('selected-item-debug')).toBeNull();
    expect(screen.queryByTestId('canvas-test-hooks')).toBeNull();
    expect(window.__BB_TEST__?.captureRenderSnapshot).toBeUndefined();
  });



  it('renders an exact canvas edge treatment and clips the checkerboard to canvas bounds', () => {
    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={createDefaultProjectDocument()}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const glowRect = container.querySelector('[data-konva-node="Rect"][data-prop-name="export-exclude"]');
    expect(glowRect).not.toBeNull();
    expect(glowRect).toHaveAttribute('data-prop-x', '0');
    expect(glowRect).toHaveAttribute('data-prop-y', '0');
    expect(glowRect).toHaveAttribute('data-prop-width', '1024');
    expect(glowRect).toHaveAttribute('data-prop-height', '1024');
    expect(glowRect).toHaveAttribute('data-prop-cornerradius', '0');
    expect(glowRect).toHaveAttribute('data-prop-stroke', 'rgba(128, 176, 255, 0.18)');
    expect(glowRect).toHaveAttribute('data-prop-shadowcolor', 'rgba(110, 160, 255, 0.14)');

    const checkerboardGroup = container.querySelector(
      '[data-konva-node="Group"][data-prop-name="checkerboard export-exclude"]',
    );
    expect(checkerboardGroup).not.toBeNull();
    expect(checkerboardGroup).toHaveAttribute('data-prop-clipx', '0');
    expect(checkerboardGroup).toHaveAttribute('data-prop-clipy', '0');
    expect(checkerboardGroup).toHaveAttribute('data-prop-clipwidth', '1024');
    expect(checkerboardGroup).toHaveAttribute('data-prop-clipheight', '1024');

    const canvasRect = container.querySelector(
      '[data-konva-node="Rect"][data-prop-name="canvas-background canvas-surface export-exclude"]',
    );
    expect(canvasRect).not.toBeNull();
    expect(canvasRect).toHaveAttribute('data-prop-cornerradius', '0');
    expect(canvasRect).toHaveAttribute('data-prop-fill', '#0b1220');
    expect(canvasRect).toHaveAttribute('data-prop-stroke', 'rgba(0, 0, 0, 0.14)');
  });

  it('renders the main scene unclipped without the overflow preview layer and frames the canvas with the export cue', () => {
    const document = createDefaultProjectDocument();
    document.background = '#11223344';
    const overflowRectangle = createRectangleItem({
      id: 'overflow-rectangle',
      x: -48,
      y: 180,
      width: 220,
      height: 140,
      fill: '#f97316',
    });
    Object.assign(mockInteractionSession, {
      renderedItems: [overflowRectangle],
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        showExportBoundsCue
        document={document}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const overflowLayer = container.querySelector(
      '[data-konva-node="Group"][data-prop-name="overflow-preview-layer export-exclude"]',
    );
    const canvasRect = container.querySelector(
      '[data-konva-node="Rect"][data-prop-name="canvas-background canvas-surface export-exclude"]',
    );
    const contentLayer = container.querySelector(
      '[data-konva-node="Group"][data-prop-name="export-content"]',
    );
    const exportCue = screen.getByTestId('export-bounds-cue');
    const topPanel = screen.getByTestId('export-bounds-cue-top');
    const rightPanel = screen.getByTestId('export-bounds-cue-right');
    const bottomPanel = screen.getByTestId('export-bounds-cue-bottom');
    const leftPanel = screen.getByTestId('export-bounds-cue-left');

    expect(overflowLayer).toBeNull();
    expect(contentLayer).not.toBeNull();
    expect(contentLayer).not.toHaveAttribute('data-prop-clipx');
    expect(contentLayer).not.toHaveAttribute('data-prop-clipy');
    expect(contentLayer).not.toHaveAttribute('data-prop-clipwidth');
    expect(contentLayer).not.toHaveAttribute('data-prop-clipheight');
    expect(canvasRect).not.toBeNull();
    expect(exportCue).toHaveClass('canvas-export-bounds-cue', 'active');
    expect(topPanel).toHaveStyle({ left: '0px', top: '0px', width: '1280px', height: '36px' });
    expect(rightPanel).toHaveStyle({ left: '964px', top: '36px', width: '316px', height: '648px' });
    expect(bottomPanel).toHaveStyle({ left: '0px', top: '684px', width: '1280px', height: '36px' });
    expect(leftPanel).toHaveStyle({ left: '0px', top: '36px', width: '316px', height: '648px' });
  });


  it('renders subtle outlines for each item in a multi-selection and rotates the shared overlay during group rotation', () => {
    const document = createDefaultProjectDocument();
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40, rotation: 0 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50, rotation: 0 });
    document.items = [first, second];

    Object.assign(mockInteractionSession, {
      renderedItems: [first, second],
      renderedSelectedItems: [first, second],
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      session: {
        kind: 'group-rotate',
        itemIds: ['first', 'second'],
        originalItems: [first, second],
        previewItems: [first, second],
        bounds: { x: 20, y: 30, width: 180, height: 80 },
        pointerStart: { x: 110, y: -20 },
        currentPointer: { x: 150, y: 20 },
        handle: 'rotater',
        guides: [],
      },
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={['first', 'second']}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItems={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const dashedLines = container.querySelectorAll('[data-konva-node="Line"][data-prop-dash]');
    expect(dashedLines.length).toBeGreaterThanOrEqual(2);

    const rotatedGroups = Array.from(container.querySelectorAll('[data-konva-node="Group"][data-prop-rotation]'));
    expect(rotatedGroups.some((node) => node.getAttribute('data-prop-rotation') !== '0')).toBe(true);
  });

  it('renders chonky crop outlines and handle hit targets while crop mode is active', () => {
    const previewItem = createImageItem({
      src: 'data:image/svg+xml;base64,AAA',
      mimeType: 'image/svg+xml',
      originalWidth: 160,
      originalHeight: 100,
      x: 140,
      y: 110,
      width: 120,
      height: 80,
    });
    previewItem.id = 'crop-image';
    previewItem.crop = {
      x: 20,
      y: 10,
      width: 120,
      height: 80,
    };
    const fullImageItem = {
      ...previewItem,
      x: 120,
      y: 100,
      width: 160,
      height: 100,
      crop: {
        x: 0,
        y: 0,
        width: previewItem.originalWidth,
        height: previewItem.originalHeight,
      },
    };

    Object.assign(mockInteractionSession, {
      cropSession: {
        itemId: previewItem.id,
        previewItem,
        fullImageItem,
      },
      renderedItems: [previewItem],
      renderedSelectedItems: [previewItem],
      selectedDocumentItem: previewItem,
      selectedRenderedItem: previewItem,
      selectedItemId: previewItem.id,
    });
    const document = createDefaultProjectDocument();
    document.items = [previewItem];

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[previewItem.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const outlineUnderlay = container.querySelector(
      '[data-konva-node="Line"][data-prop-name="crop-selection-outline-underlay"][data-prop-stroke="#ffffff"]',
    );
    const outline = container.querySelector(
      '[data-konva-node="Line"][data-prop-name="crop-selection-outline"][data-prop-stroke="#111111"]',
    );
    const handleUnderlay = container.querySelector(
      '[data-konva-node="Line"][data-prop-name="crop-handle-visual-underlay top-center"][data-prop-stroke="#ffffff"]',
    );
    const handleVisual = container.querySelector(
      '[data-konva-node="Line"][data-prop-name="crop-handle-visual top-left"][data-prop-stroke="#111111"]',
    );
    const hitTarget = container.querySelector(
      '[data-konva-node="Rect"][data-prop-name="crop-handle-hit middle-right"]',
    );

    expect(outlineUnderlay).not.toBeNull();
    expect(outline).not.toBeNull();
    expect(handleUnderlay).not.toBeNull();
    expect(handleVisual).not.toBeNull();
    expect(hitTarget).not.toBeNull();
    expect(Number(outlineUnderlay?.getAttribute('data-prop-strokewidth'))).toBeGreaterThan(10);
    expect(Number(outline?.getAttribute('data-prop-strokewidth'))).toBeGreaterThan(6);
    expect(Number(handleUnderlay?.getAttribute('data-prop-strokewidth'))).toBeGreaterThan(13);
    expect(Number(handleVisual?.getAttribute('data-prop-strokewidth'))).toBeGreaterThan(8);
    expect(Number(hitTarget?.getAttribute('data-prop-width'))).toBeGreaterThan(24);
    expect(Number(hitTarget?.getAttribute('data-prop-height'))).toBeGreaterThan(24);
  });

  it('renders zoom controls and updates the readout', async () => {
    const user = userEvent.setup();
    render(
      <CanvasStage
        activeTool="select"
        document={createDefaultProjectDocument()}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Fit canvas to viewport' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set zoom to 100%' })).toBeInTheDocument();
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 63%');

    await user.click(screen.getByRole('button', { name: 'Set zoom to 100%' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 100%');

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 110%');

    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 100%');

    await user.click(screen.getByRole('button', { name: 'Fit canvas to viewport' }));
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 63%');
  });

  it('keeps the group frame visual-only while still forwarding group resize handles', () => {
    const document = createDefaultProjectDocument();
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });
    document.items = [first, second];

    Object.assign(mockInteractionSession, {
      renderedItems: [first, second],
      renderedSelectedItems: [first, second],
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      selectedItemId: first.id,
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[first.id, second.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItems={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const groupOutline = container.querySelector(
      '[data-konva-node="Rect"][data-prop-stroke="#7dd3fc"]'
    ) as HTMLElement | null;
    const rightHandle = container.querySelector(
      '[data-konva-node="Circle"][data-prop-x="90"][data-prop-y="0"]'
    ) as HTMLElement | null;

    expect(groupOutline).not.toBeNull();
    expect(rightHandle).not.toBeNull();

    fireEvent.mouseDown(groupOutline!, { button: 0 });
    fireEvent.mouseDown(rightHandle!, { button: 0 });

    expect(mockInteractionSession.beginGroupDrag).not.toHaveBeenCalled();
    expect(mockInteractionSession.beginGroupResize).toHaveBeenCalledWith(
      'middle-right',
      expect.any(Object),
      'overlay',
    );
  });

  it('starts a pan drag instead of group drag when middle-clicking the group overlay hook', () => {
    const document = createDefaultProjectDocument();
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });
    document.items = [first, second];

    Object.assign(mockInteractionSession, {
      renderedItems: [first, second],
      renderedSelectedItems: [first, second],
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 0 },
      selectedItemId: first.id,
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[first.id, second.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItems={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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
    document.items = [first, second];

    Object.assign(mockInteractionSession, {
      renderedItems: [first, second],
      renderedSelectedItems: [first, second],
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 0 },
      selectedItemId: first.id,
    });

    render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[first.id, second.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItems={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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
    document.items = [rectangle];

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
        activeTool="select"
        document={document}
        selectedItemIds={[rectangle.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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

  it('forwards shift-modified selected-item overlay drags to the interaction session', () => {
    const document = createDefaultProjectDocument();
    const rectangle = createRectangleItem({ id: 'shape', x: 120, y: 80, width: 160, height: 100 });
    document.items = [rectangle];

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
        activeTool="select"
        document={document}
        selectedItemIds={[rectangle.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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
    document.items = [rectangle];

    Object.assign(mockInteractionSession, {
      renderedItems: [rectangle],
      renderedSelectedItems: [rectangle],
      selectedItemId: rectangle.id,
      selectedRenderedItem: rectangle,
    });

    render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[rectangle.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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
    document.items = [first, second];

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
        activeTool="select"
        document={document}
        selectedItemIds={['first', 'second']}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItems={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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
        activeTool="select"
        document={document}
        selectedItemIds={['first', 'second']}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItems={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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
    document.items = [first, second];

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
        activeTool="select"
        document={document}
        selectedItemIds={['first', 'second']}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onUpdateItems={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
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
          activeTool="select"
          document={document}
          selectedItemIds={['first', 'second']}
          guides={[]}
          onGuidesChange={vi.fn()}
          onSelectItem={vi.fn()}
          onUpdateItem={vi.fn()}
          onUpdateItems={vi.fn()}
          onAddItem={vi.fn()}
          onSetActiveTool={vi.fn()}
          stageRef={createRef<Konva.Stage>()}
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

  it('forwards selected line handle drags to the interaction session', () => {
    const document = createDefaultProjectDocument();
    const line = createLineItem({
      id: 'line',
      startX: 160,
      startY: 160,
      endX: 360,
      endY: 220,
    });
    document.items = [line];
    const startHandle = getLineHandleRects(line).start;

    Object.assign(mockInteractionSession, {
      renderedItems: [line],
      renderedSelectedItems: [line],
      selectedDocumentItem: line,
      selectedRenderedItem: line,
      selectedItemId: line.id,
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[line.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const startHandleNode = container.querySelector(
      `[data-konva-node="Circle"][data-prop-x="${startHandle.x + startHandle.width / 2}"][data-prop-y="${startHandle.y + startHandle.height / 2}"]`
    ) as HTMLElement | null;

    expect(startHandleNode).not.toBeNull();

    fireEvent.mouseDown(startHandleNode!, { button: 0 });

    expect(mockInteractionSession.beginLineHandle).toHaveBeenCalledWith(
      line,
      'start',
      expect.any(Object),
      'overlay',
    );
  });

  it('forwards single-shape drag, resize, and rotate handles to the interaction session', () => {
    const document = createDefaultProjectDocument();
    const rectangle = createRectangleItem({
      id: 'shape',
      x: 120,
      y: 80,
      width: 160,
      height: 100,
    });
    document.items = [rectangle];
    const handlePoints = getShapeHandlePoints(rectangle);

    Object.assign(mockInteractionSession, {
      renderedItems: [rectangle],
      renderedSelectedItems: [rectangle],
      selectedDocumentItem: rectangle,
      selectedRenderedItem: rectangle,
      selectedItemId: rectangle.id,
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[rectangle.id]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const shapeGroups = container.querySelectorAll(
      `[data-konva-node="Group"][data-prop-x="${rectangle.x}"][data-prop-y="${rectangle.y}"]`
    );
    const rotaterHandle = Array.from(container.querySelectorAll('[data-konva-node="Circle"]')).find(
      (node) =>
        node.getAttribute('data-prop-x') === String(handlePoints.rotater.x) &&
        Number(node.getAttribute('data-prop-y')) < rectangle.y,
    ) as HTMLElement | undefined;
    const rightResizeHandle = container.querySelector(
      `[data-konva-node="Circle"][data-prop-x="${handlePoints['middle-right'].x}"][data-prop-y="${handlePoints['middle-right'].y}"]`
    ) as HTMLElement | null;

    expect(shapeGroups.length).toBeGreaterThan(0);
    expect(rotaterHandle).toBeDefined();
    expect(rightResizeHandle).not.toBeNull();

    fireEvent.mouseDown(shapeGroups[0]!, { button: 0, shiftKey: true, clientX: 300, clientY: 240 });
    fireEvent.mouseDown(rightResizeHandle!, { button: 0, clientX: 300, clientY: 240 });
    fireEvent.mouseDown(rotaterHandle!, { button: 0, clientX: 300, clientY: 240 });

    expect(mockInteractionSession.handleItemPointerDown).toHaveBeenCalledWith(
      rectangle,
      rectangle.id,
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      true,
      expect.anything(),
    );
    expect(mockInteractionSession.beginResize).toHaveBeenCalledWith(
      rectangle,
      'middle-right',
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      'overlay',
    );
    expect(mockInteractionSession.beginRotate).toHaveBeenCalledWith(
      rectangle,
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      'overlay',
    );
  });

  it('forwards item double-clicks to the interaction session', () => {
    const document = createDefaultProjectDocument();
    const rectangle = createRectangleItem({
      id: 'shape',
      x: 120,
      y: 80,
      width: 160,
      height: 100,
    });
    document.items = [rectangle];
    document.nodes = [rectangle];

    Object.assign(mockInteractionSession, {
      renderedItems: [rectangle],
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const shapeGroup = container.querySelector(
      `[data-konva-node="Group"][data-prop-x="${rectangle.x}"][data-prop-y="${rectangle.y}"]`,
    );

    expect(shapeGroup).not.toBeNull();

    fireEvent.dblClick(shapeGroup!, { button: 0, clientX: 240, clientY: 160 });

    expect(mockInteractionSession.handleItemDoubleClick).toHaveBeenCalledWith(rectangle);
  });

  it('renders unobtrusive subgroup outlines for grouped selections', () => {
    const document = createDefaultProjectDocument();
    Object.assign(mockInteractionSession, {
      subgroupOutlineFrames: [
        {
          nodeId: 'group-a',
          bounds: { x: 100, y: 90, width: 120, height: 80 },
        },
        {
          nodeId: 'group-b',
          bounds: { x: 280, y: 120, width: 140, height: 90 },
        },
      ],
    });

    const { container } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const subgroupOutlines = container.querySelectorAll(
      '[data-konva-node="Rect"][data-prop-name="subgroup-selection-outline"]',
    );

    expect(subgroupOutlines).toHaveLength(2);
  });

  it('renders marquee and text-create previews plus active guide lines', () => {
    const document = createDefaultProjectDocument();
    const previewItem = createTextItem({
      x: 80,
      y: 70,
      width: 180,
      height: 60,
      text: 'Preview',
      fontFamily: 'Arial',
      fontSize: 32,
      lineHeight: 1.2,
      letterSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      fill: '#ffffff',
    });

    Object.assign(mockInteractionSession, {
      renderedItems: [],
      renderedSelectedItems: [],
      session: {
        kind: 'marquee',
        pointerStart: { x: 50, y: 40 },
        currentPointer: { x: 180, y: 140 },
        toggleMode: false,
        guides: [],
      },
    });

    const { container, rerender } = render(
      <CanvasStage
        activeTool="select"
        document={document}
        selectedItemIds={[]}
        guides={[
          { orientation: 'vertical', position: 120 },
          { orientation: 'horizontal', position: 90 },
        ]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    expect(
      container.querySelector('[data-konva-node="Rect"][data-prop-stroke="#7dd3fc"][data-prop-dash="[6,4]"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-konva-node="Line"][data-prop-points="[120,0,120,${document.canvas.height}]"]`
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-konva-node="Line"][data-prop-points="[0,90,${document.canvas.width},90]"]`
      )
    ).not.toBeNull();

    Object.assign(mockInteractionSession, {
      session: {
        kind: 'create',
        tool: 'text',
        pointerStart: { x: 80, y: 70 },
        previewItem,
        guides: [],
        snapDisabled: false,
      },
    });

    rerender(
      <CanvasStage
        activeTool="text"
        document={document}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    expect(
      container.querySelector('[data-konva-node="Rect"][data-prop-x="80"][data-prop-y="70"][data-prop-width="180"][data-prop-height="60"][data-prop-dash="[6,4]"]')
    ).not.toBeNull();
  });

  it('wires stage wheel, zoom-tool clicks, pan gestures, and mouse-up forwarding', () => {
    const handleStageMouseDown = vi.fn();
    const handleStagePointerMove = vi.fn();
    const handleStageMouseUp = vi.fn();
    Object.assign(mockInteractionSession, {
      handleStageMouseDown,
      handleStagePointerMove,
      handleStageMouseUp,
    });

    const { container, rerender } = render(
      <CanvasStage
        activeTool="select"
        document={createDefaultProjectDocument()}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    const stage = container.querySelector('[data-konva-node="Stage"]') as HTMLElement | null;
    const readCursor = () => JSON.parse(stage?.getAttribute('data-prop-style') ?? '{}').cursor;
    expect(stage).not.toBeNull();
    expect(readCursor()).toBe('default');

    fireEvent.wheel(stage!, { deltaY: -100, clientX: 640, clientY: 360 });
    expect(screen.getByTestId('viewport-zoom')).not.toHaveTextContent('Zoom: 63%');

    fireEvent.mouseDown(stage!, { button: 0, clientX: 640, clientY: 360 });
    fireEvent.mouseUp(stage!, { button: 0, clientX: 640, clientY: 360 });

    expect(handleStageMouseDown).toHaveBeenCalledOnce();
    expect(handleStageMouseUp).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: 'Shift' });
    expect(readCursor()).toBe('grab');

    fireEvent.mouseDown(stage!, { button: 0, shiftKey: true, clientX: 640, clientY: 360 });
    expect(document.body.style.cursor).toBe('grabbing');

    fireEvent.mouseMove(stage!, { clientX: 700, clientY: 420 });
    expect(readCursor()).toBe('grabbing');
    fireEvent.mouseUp(stage!, { button: 0, clientX: 700, clientY: 420 });
    expect(document.body.style.cursor).toBe('');
    expect(handleStageMouseUp).toHaveBeenCalledOnce();

    fireEvent.keyUp(window, { key: 'Shift' });

    rerender(
      <CanvasStage
        activeTool="zoom"
        document={createDefaultProjectDocument()}
        selectedItemIds={[]}
        guides={[]}
        onGuidesChange={vi.fn()}
        onSelectItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onAddItem={vi.fn()}
        onSetActiveTool={vi.fn()}
        stageRef={createRef<Konva.Stage>()}
      />,
    );

    expect(readCursor()).toBe('zoom-in');
    fireEvent.keyDown(window, { key: 'Alt' });
    expect(readCursor()).toBe('zoom-out');
    fireEvent.mouseDown(stage!, { button: 0, altKey: true, clientX: 640, clientY: 360 });
    expect(handleStageMouseDown).toHaveBeenCalledOnce();
    fireEvent.keyUp(window, { key: 'Alt' });
  });
});
