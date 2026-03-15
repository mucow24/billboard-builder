import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';

import { CanvasStage } from './CanvasStage';
import { createDefaultProjectDocument } from '../model/defaults';
import type Konva from 'konva';

vi.mock('react-konva', () => {
  const React = require('react');
  const make = (name: string) =>
    React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('div', { ref, 'data-konva-node': name, ...props }, children),
    );

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
  useCanvasInteractionSession: () => ({
    beginDrag: vi.fn(),
    beginLineHandle: vi.fn(),
    beginResize: vi.fn(),
    beginRotate: vi.fn(),
    handleStageMouseDown: vi.fn(),
    handleStageMouseUp: vi.fn(),
    nodeClientRect: null,
    registerShapeRef: vi.fn(),
    renderedItems: [],
    selectedDocumentItem: null,
    selectedNode: null,
    selectedRenderedItem: null,
    selectedItemId: undefined,
    session: null,
  }),
}));

vi.mock('./useImageElement', () => ({
  useImageElement: () => null,
}));

describe('CanvasStage viewport controls', () => {
  beforeEach(() => {
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

  it('renders zoom controls and updates the readout', async () => {
    const user = userEvent.setup();
    render(
      <CanvasStage
        activeTool="select"
        document={createDefaultProjectDocument()}
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
