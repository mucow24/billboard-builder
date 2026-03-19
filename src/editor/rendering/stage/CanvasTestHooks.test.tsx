import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import { CanvasTestHooks } from './CanvasTestHooks';

describe('CanvasTestHooks', () => {
  it('renders preview hook elements for marquee and text-create sessions', () => {
    const textPreview = createTextItem({
      x: 40,
      y: 50,
      width: 180,
      height: 60,
    });

    const { rerender } = render(
      <CanvasTestHooks
        beginGroupDrag={vi.fn()}
        beginGroupResize={vi.fn()}
        beginGroupRotate={vi.fn()}
        beginLineHandle={vi.fn()}
        beginResize={vi.fn()}
        beginRotate={vi.fn()}
        getViewportPointerFromClient={vi.fn(() => ({ x: 100, y: 120 }))}
        groupHandleViewportPoints={null}
        groupOverlayFrame={null}
        groupOverlayViewportRect={null}
        groupRotaterViewportPoint={null}
        handleItemPointerDown={vi.fn()}
        marqueeViewportRect={{ left: 10, top: 20, width: 30, height: 40 }}
        onTestEvent={vi.fn()}
        selectedItemViewportRect={null}
        selectedLineHandleRects={null}
        selectedRenderedItem={null}
        selectedShapeHandleRects={null}
        session={null}
        showGroupInteractionHooks={false}
        startPanDrag={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
        toViewportRect={(rect) => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })}
      />,
    );

    expect(screen.getByTestId('canvas-marquee-preview')).toBeInTheDocument();

    rerender(
      <CanvasTestHooks
        beginGroupDrag={vi.fn()}
        beginGroupResize={vi.fn()}
        beginGroupRotate={vi.fn()}
        beginLineHandle={vi.fn()}
        beginResize={vi.fn()}
        beginRotate={vi.fn()}
        getViewportPointerFromClient={vi.fn(() => ({ x: 100, y: 120 }))}
        groupHandleViewportPoints={null}
        groupOverlayFrame={null}
        groupOverlayViewportRect={null}
        groupRotaterViewportPoint={null}
        handleItemPointerDown={vi.fn()}
        marqueeViewportRect={null}
        onTestEvent={vi.fn()}
        selectedItemViewportRect={null}
        selectedLineHandleRects={null}
        selectedRenderedItem={null}
        selectedShapeHandleRects={null}
        session={{
          kind: 'create',
          tool: 'text',
          previewItem: {
            kind: 'text',
            x: textPreview.x,
            y: textPreview.y,
            width: textPreview.width,
            height: textPreview.height,
          },
        }}
        showGroupInteractionHooks={false}
        startPanDrag={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
        toViewportRect={(rect) => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })}
      />,
    );

    expect(screen.getByTestId('canvas-text-create-preview')).toBeInTheDocument();
  });

  it('forwards selected item, shape handle, and group overlay events', () => {
    const rectangle = createRectangleItem();
    const handleItemPointerDown = vi.fn();
    const beginResize = vi.fn();
    const beginGroupDrag = vi.fn();
    const startPanDrag = vi.fn();
    const onTestEvent = vi.fn();

    render(
      <CanvasTestHooks
        beginGroupDrag={beginGroupDrag}
        beginGroupResize={vi.fn()}
        beginGroupRotate={vi.fn()}
        beginLineHandle={vi.fn()}
        beginResize={beginResize}
        beginRotate={vi.fn()}
        getViewportPointerFromClient={vi.fn((clientX, clientY) => ({ x: clientX, y: clientY }))}
        groupHandleViewportPoints={{ 'middle-right': { x: 220, y: 140 } }}
        groupOverlayFrame={{ rotation: 15 }}
        groupOverlayViewportRect={{ left: 100, top: 90, width: 120, height: 80 }}
        groupRotaterViewportPoint={{ x: 180, y: 40 }}
        handleItemPointerDown={handleItemPointerDown}
        marqueeViewportRect={null}
        onTestEvent={onTestEvent}
        selectedItemViewportRect={{ left: 120, top: 110, width: 80, height: 50 }}
        selectedLineHandleRects={null}
        selectedRenderedItem={rectangle}
        selectedShapeHandleRects={{ rotater: { left: 140, top: 70, width: 16, height: 16 } }}
        session={null}
        showGroupInteractionHooks
        startPanDrag={startPanDrag}
        toCanvasPointer={(pointer) => ({ x: pointer.x / 2, y: pointer.y / 2 })}
        toViewportRect={(rect) => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })}
      />,
    );

    fireEvent.mouseDown(screen.getByTestId('canvas-selected-item-overlay'), {
      button: 0,
      clientX: 240,
      clientY: 180,
    });
    fireEvent.mouseDown(screen.getByTestId('canvas-shape-handle-rotater'), {
      button: 0,
      clientX: 200,
      clientY: 120,
    });
    fireEvent.mouseDown(screen.getByTestId('canvas-group-overlay'), {
      button: 1,
      clientX: 300,
      clientY: 220,
    });

    expect(handleItemPointerDown).toHaveBeenCalledWith(
      rectangle,
      { x: 120, y: 90 },
      false,
    );
    expect(beginResize).not.toHaveBeenCalled();
    expect(onTestEvent).toHaveBeenCalledWith('selected-item-overlay');
    expect(onTestEvent).toHaveBeenCalledWith('shape-handle-rotater');
    expect(startPanDrag).toHaveBeenCalledWith({ x: 300, y: 220 });
    expect(beginGroupDrag).not.toHaveBeenCalled();
  });

  it('forwards line handles, group handles, and group rotater hooks', () => {
    const line = createLineItem();
    const beginLineHandle = vi.fn();
    const beginGroupResize = vi.fn();
    const beginGroupRotate = vi.fn();

    render(
      <CanvasTestHooks
        beginGroupDrag={vi.fn()}
        beginGroupResize={beginGroupResize}
        beginGroupRotate={beginGroupRotate}
        beginLineHandle={beginLineHandle}
        beginResize={vi.fn()}
        beginRotate={vi.fn()}
        getViewportPointerFromClient={vi.fn((clientX, clientY) => ({ x: clientX, y: clientY }))}
        groupHandleViewportPoints={{ 'middle-right': { x: 220, y: 140 } }}
        groupOverlayFrame={{ rotation: 0 }}
        groupOverlayViewportRect={{ left: 100, top: 90, width: 120, height: 80 }}
        groupRotaterViewportPoint={{ x: 180, y: 40 }}
        handleItemPointerDown={vi.fn()}
        marqueeViewportRect={null}
        onTestEvent={vi.fn()}
        selectedItemViewportRect={null}
        selectedLineHandleRects={{ start: { left: 10, top: 20, width: 16, height: 16 } }}
        selectedRenderedItem={line}
        selectedShapeHandleRects={null}
        session={null}
        showGroupInteractionHooks
        startPanDrag={vi.fn()}
        toCanvasPointer={(pointer) => ({ x: pointer.x / 2, y: pointer.y / 2 })}
        toViewportRect={(rect) => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })}
      />,
    );

    fireEvent.mouseDown(screen.getByTestId('canvas-line-handle-start'), {
      button: 0,
      clientX: 60,
      clientY: 80,
    });
    fireEvent.mouseDown(screen.getByTestId('canvas-group-handle-middle-right'), {
      button: 0,
      clientX: 220,
      clientY: 140,
    });
    fireEvent.mouseDown(screen.getByTestId('canvas-group-rotater'), {
      button: 0,
      clientX: 180,
      clientY: 40,
    });

    expect(beginLineHandle).toHaveBeenCalledWith(line, 'start', { x: 30, y: 40 });
    expect(beginGroupResize).toHaveBeenCalledWith('middle-right', { x: 110, y: 70 });
    expect(beginGroupRotate).toHaveBeenCalledWith({ x: 90, y: 20 });
  });
});
