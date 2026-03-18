// This file intentionally mocks Konva and the interaction session; it only covers viewport chrome wiring.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInteractionSession } = vi.hoisted(() => ({
  mockInteractionSession: {
    beginDrag: vi.fn(),
    beginGroupDrag: vi.fn(),
    beginGroupResize: vi.fn(),
    beginGroupRotate: vi.fn(),
    beginLineHandle: vi.fn(),
    beginResize: vi.fn(),
    beginRotate: vi.fn(),
    handleItemPointerDown: vi.fn(),
    handleStageMouseDown: vi.fn(),
    handleStageMouseUp: vi.fn(),
    nodeClientRect: null,
    registerShapeRef: vi.fn(),
    renderedGroupBounds: null,
    renderedItems: [],
    renderedSelectedItems: [],
    selectedDocumentItem: null,
    selectedNode: null,
    selectedRenderedItem: null,
    selectedItemId: undefined,
    session: null,
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

import { CanvasStage } from './CanvasStage';
import { createDefaultProjectDocument, createRectangleItem } from '../document/documentDefaults';
import type Konva from 'konva';

vi.mock('react-konva', () => {
  type MockKonvaProps = React.PropsWithChildren<Record<string, unknown>>;
  const make = (name: string) =>
    React.forwardRef<HTMLDivElement, MockKonvaProps>(({ children, ...props }, ref) => {
      const dataProps = Object.fromEntries(
        Object.entries(props).flatMap(([key, value]) => {
          if (value === undefined || typeof value === 'function') {
            return [];
          }
          return [[`data-prop-${key.toLowerCase()}`, typeof value === 'object' ? JSON.stringify(value) : String(value)]];
        }),
      );
      return React.createElement(
        'div',
        { ref, 'data-konva-node': name, ...dataProps },
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

describe('CanvasStage viewport controls', () => {
  beforeEach(() => {
    Object.assign(mockInteractionSession, {
      beginDrag: vi.fn(),
      beginGroupDrag: vi.fn(),
      beginGroupResize: vi.fn(),
      beginGroupRotate: vi.fn(),
      beginLineHandle: vi.fn(),
      beginResize: vi.fn(),
      beginRotate: vi.fn(),
      handleItemPointerDown: vi.fn(),
      handleStageMouseDown: vi.fn(),
      handleStageMouseUp: vi.fn(),
      nodeClientRect: null,
      registerShapeRef: vi.fn(),
      renderedGroupBounds: null,
      renderedItems: [],
      renderedSelectedItems: [],
      selectedDocumentItem: null,
      selectedNode: null,
      selectedRenderedItem: null,
      selectedItemId: undefined,
      session: null,
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



  it('renders a square canvas edge with a subtle glow treatment', () => {
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
    expect(glowRect).toHaveAttribute('data-prop-cornerradius', '0');
    expect(glowRect).toHaveAttribute('data-prop-stroke', 'rgba(128, 176, 255, 0.18)');
    expect(glowRect).toHaveAttribute('data-prop-shadowcolor', 'rgba(110, 160, 255, 0.14)');

    const canvasRect = container.querySelector(
      '[data-konva-node="Rect"][data-prop-name="canvas-background canvas-surface export-exclude"]',
    );
    expect(canvasRect).not.toBeNull();
    expect(canvasRect).toHaveAttribute('data-prop-cornerradius', '0');
    expect(canvasRect).toHaveAttribute('data-prop-fill', '#0b1220');
    expect(canvasRect).toHaveAttribute('data-prop-stroke', 'rgba(0, 0, 0, 0.14)');
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

    const dashedLines = container.querySelectorAll('[data-konva-node="Line"][data-prop-dash="[8,4]"]');
    expect(dashedLines.length).toBeGreaterThanOrEqual(2);

    const rotatedGroups = Array.from(container.querySelectorAll('[data-konva-node="Group"][data-prop-rotation]'));
    expect(rotatedGroups.some((node) => node.getAttribute('data-prop-rotation') !== '0')).toBe(true);
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
});
