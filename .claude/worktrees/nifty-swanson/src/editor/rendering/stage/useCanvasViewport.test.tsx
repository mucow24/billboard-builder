import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasViewport } from './useCanvasViewport';

describe('useCanvasViewport', () => {
  beforeEach(() => {
    class TestResizeObserver {
      private readonly callback: ResizeObserverCallback;

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
      takeRecords() {
        return [];
      }
      unobserve() {}
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);
  });

  it('fits the canvas to the viewport and zooms around the viewport center from the HUD', () => {
    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
      }),
    );

    const viewportElement = document.createElement('div');
    viewportElement.getBoundingClientRect = () =>
      ({
        width: 1280,
        height: 720,
        left: 0,
        top: 0,
        right: 1280,
        bottom: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      result.current.viewportRef.current = viewportElement;
    });

    act(() => {
      result.current.fitCanvasToViewport();
    });

    expect(result.current.zoom).toBeCloseTo(0.6328125, 6);
    expect(result.current.pan.x).toBeCloseTo(316, 6);
    expect(result.current.pan.y).toBeCloseTo(36, 6);

    act(() => {
      result.current.setZoomFromHud(1);
    });

    expect(result.current.zoom).toBeCloseTo(1, 6);
  });

  it('derives cursor mode and zooms around a given point', () => {
    const initialProps: {
      activeTool: 'zoom' | 'pan';
      canvasHeight: number;
      canvasWidth: number;
    } = {
      activeTool: 'zoom',
      canvasHeight: 1024,
      canvasWidth: 1024,
    };
    const { result, rerender } = renderHook(
      (props: { activeTool: 'zoom' | 'pan'; canvasHeight: number; canvasWidth: number }) =>
        useCanvasViewport(props),
      {
        initialProps,
      },
    );

    expect(result.current.getStageCursor(false)).toBe('zoom-in');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    });
    expect(result.current.getStageCursor(false)).toBe('zoom-out');

    act(() => {
      result.current.zoomAround({ x: 400, y: 300 }, 2);
    });
    expect(result.current.zoom).toBe(2);

    rerender({
      activeTool: 'pan',
      canvasHeight: 1024,
      canvasWidth: 1024,
    });
    expect(result.current.getStageCursor(false)).toBe('grab');
  });

  it('starts and stops pan dragging through stage pointer handlers', () => {
    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
      }),
    );

    act(() => {
      result.current.startPanDrag({ x: 100, y: 100 });
      result.current.handleStagePointerMove({ x: 140, y: 160 });
    });

    expect(result.current.pan).toEqual({ x: 356, y: 96 });
    let handledPointerUp = false;
    act(() => {
      handledPointerUp = result.current.handleStagePointerUp();
    });
    expect(handledPointerUp).toBe(true);
    expect(result.current.handleStagePointerUp()).toBe(false);
  });

  it('ignores window mousemove while the pointer remains inside the viewport bounds', () => {
    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
      }),
    );

    const viewportElement = document.createElement('div');
    viewportElement.getBoundingClientRect = () =>
      ({
        width: 1280,
        height: 720,
        left: 0,
        top: 0,
        right: 1280,
        bottom: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      result.current.viewportRef.current = viewportElement;
    });

    act(() => {
      result.current.startPanDrag({ x: 100, y: 100 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 140,
          clientY: 160,
        }),
      );
    });

    expect(result.current.pan).toEqual({ x: 316, y: 36 });
  });

  it('continues pan dragging through window events only after the pointer leaves the viewport', () => {
    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
      }),
    );

    const viewportElement = document.createElement('div');
    viewportElement.getBoundingClientRect = () =>
      ({
        width: 1280,
        height: 720,
        left: 0,
        top: 0,
        right: 1280,
        bottom: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      result.current.viewportRef.current = viewportElement;
    });

    act(() => {
      result.current.startPanDrag({ x: 100, y: 100 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 1400,
          clientY: 860,
        }),
      );
    });

    expect(result.current.pan).toEqual({ x: 1616, y: 796 });
  });

  it('stops pan dragging on window mouseup even when the release stays inside the viewport', () => {
    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
      }),
    );

    const viewportElement = document.createElement('div');
    viewportElement.getBoundingClientRect = () =>
      ({
        width: 1280,
        height: 720,
        left: 0,
        top: 0,
        right: 1280,
        bottom: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      result.current.viewportRef.current = viewportElement;
    });

    act(() => {
      result.current.startPanDrag({ x: 100, y: 100 });
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: 140,
          clientY: 160,
        }),
      );
    });

    expect(result.current.handleStagePointerUp()).toBe(false);
  });
});
