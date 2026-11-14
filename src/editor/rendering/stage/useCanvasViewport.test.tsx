import { act, render, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasViewport } from './useCanvasViewport';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('useCanvasViewport', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1,
    });

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

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(result.current.zoom).toBeCloseTo(0.625, 6);
    expect(result.current.pan.x).toBeCloseTo(320, 6);
    expect(result.current.pan.y).toBeCloseTo(40, 6);

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

  it('fits the canvas beside the overlay panel while the panel is shown', () => {
    const viewportElement = document.createElement('div');
    viewportElement.getBoundingClientRect = () => domRect(0, 0, 1280, 720);
    const panelElement = document.createElement('div');
    let panelShown = true;
    // A display: none panel measures as an empty rect at the origin.
    panelElement.getBoundingClientRect = () =>
      panelShown ? domRect(956, 50, 317, 662) : domRect(0, 0, 0, 0);
    const overlayPanelRef = { current: panelElement };

    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
        overlayPanelRef,
      }),
    );

    act(() => {
      result.current.viewportRef.current = viewportElement;
    });
    act(() => {
      result.current.fitCanvasToViewport();
    });

    // Fitted into the 956px left of the panel: 0.9 * 720 / 1024 floors to 0.625.
    expect(result.current.zoom).toBeCloseTo(0.625, 6);
    expect(result.current.pan).toEqual({ x: 158, y: 40 });

    panelShown = false;
    act(() => {
      result.current.fitCanvasToViewport();
    });

    expect(result.current.zoom).toBeCloseTo(0.625, 6);
    expect(result.current.pan).toEqual({ x: 320, y: 40 });
  });

  it('fits on startup into the measured viewport, beside the overlay panel', () => {
    // A ResizeObserver that reports nothing, as before the first paint.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.testid === 'panel' ? domRect(680, 50, 317, 742) : domRect(0, 0, 1000, 800);
    });

    let latest: ReturnType<typeof useCanvasViewport> | null = null;
    function Harness() {
      const overlayPanelRef = useRef<HTMLDivElement | null>(null);
      const viewport = useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
        overlayPanelRef,
      });
      latest = viewport;
      // The panel comes after the stage, as in the app, so its ref is attached
      // only after the stage's first layout effects.
      return (
        <>
          <div ref={viewport.viewportRef} />
          <div ref={overlayPanelRef} data-testid="panel" />
        </>
      );
    }

    render(<Harness />);

    // 1000x800, not the 1280x720 default, and only the 680px left of the
    // panel: 0.9 * 680 / 1024 floors to 0.59375.
    expect(latest!.viewportSize).toEqual({ width: 1000, height: 800 });
    expect(latest!.zoom).toBeCloseTo(0.59375, 6);
    expect(latest!.pan).toEqual({ x: 36, y: 96 });
  });

  it('aligns fitted and zoomed pan values to device pixels', () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });

    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1000,
        canvasWidth: 999,
      }),
    );

    expect(result.current.zoom).toBeCloseTo(0.640625, 6);
    expect(result.current.pan).toEqual({ x: 320, y: 39.5 });

    act(() => {
      result.current.zoomAround({ x: 400, y: 300 }, 1.333);
    });

    expect(result.current.zoom).toBeCloseTo(1.3359375, 6);
    expect(result.current.pan.x * 2).toBeCloseTo(Math.round(result.current.pan.x * 2), 6);
    expect(result.current.pan.y * 2).toBeCloseTo(Math.round(result.current.pan.y * 2), 6);
  });

  it('updates pan from window pointermove while a button is held', () => {
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
        new PointerEvent('pointermove', {
          clientX: 140,
          clientY: 160,
          buttons: 4,
        }),
      );
    });

    expect(result.current.pan).toEqual({ x: 360, y: 100 });
  });

  it('stops pan dragging on window pointerup even when the release stays inside the viewport', () => {
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
        new PointerEvent('pointerup', {
          clientX: 140,
          clientY: 160,
        }),
      );
    });

    expect(result.current.handleStagePointerUp()).toBe(false);
  });

  it('recovers a stuck pan when a window pointermove arrives with no buttons held', () => {
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
        new PointerEvent('pointermove', {
          clientX: 200,
          clientY: 200,
          buttons: 0,
        }),
      );
    });

    expect(result.current.handleStagePointerUp()).toBe(false);
  });
});
