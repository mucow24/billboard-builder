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

  it('fits the canvas clear of the toolbar, the tool palette and the panel while it is shown', () => {
    const element = (rect: () => DOMRect) => {
      const node = document.createElement('div');
      node.getBoundingClientRect = rect;
      return { current: node };
    };
    const viewportElement = document.createElement('div');
    viewportElement.getBoundingClientRect = () => domRect(0, 0, 1280, 720);
    let panelShown = true;
    const fitObstructionRefs = {
      top: element(() => domRect(0, 0, 1280, 50)),
      left: element(() => domRect(7, 50, 40, 400)),
      // A display: none panel measures as an empty rect at the origin.
      right: element(() => (panelShown ? domRect(956, 50, 317, 662) : domRect(0, 0, 0, 0))),
    };

    const { result } = renderHook(() =>
      useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
        fitObstructionRefs,
      }),
    );

    act(() => {
      result.current.viewportRef.current = viewportElement;
    });
    act(() => {
      result.current.fitCanvasToViewport();
    });

    // Fitted into x 47..956, y 50..720: 0.9 * 670 / 1024 floors to 0.578125,
    // so the canvas is 592px square.
    expect(result.current.zoom).toBeCloseTo(0.578125, 6);
    expect(result.current.pan).toEqual({ x: Math.round(47 + (909 - 592) / 2), y: 50 + (670 - 592) / 2 });

    panelShown = false;
    act(() => {
      result.current.fitCanvasToViewport();
    });

    expect(result.current.zoom).toBeCloseTo(0.578125, 6);
    expect(result.current.pan).toEqual({ x: Math.round(47 + (1233 - 592) / 2), y: 50 + (670 - 592) / 2 });
  });

  it('fits on startup into the measured viewport, clear of the toolbar, tool palette and panel', () => {
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
      switch (this.dataset.testid) {
        case 'toolbar':
          return domRect(0, 0, 1000, 60);
        case 'palette':
          return domRect(8, 60, 40, 400);
        case 'panel':
          return domRect(680, 60, 317, 732);
        default:
          return domRect(0, 0, 1000, 800);
      }
    });

    let latest: ReturnType<typeof useCanvasViewport> | null = null;
    function Harness() {
      const toolbarRef = useRef<HTMLDivElement | null>(null);
      const paletteRef = useRef<HTMLDivElement | null>(null);
      const panelRef = useRef<HTMLDivElement | null>(null);
      const viewport = useCanvasViewport({
        activeTool: 'select',
        canvasHeight: 1024,
        canvasWidth: 1024,
        fitObstructionRefs: { top: toolbarRef, left: paletteRef, right: panelRef },
      });
      latest = viewport;
      // These come after the stage, as in the app, so their refs are attached
      // only after the stage's first layout effects.
      return (
        <>
          <div ref={viewport.viewportRef} />
          <div ref={toolbarRef} data-testid="toolbar" />
          <div ref={paletteRef} data-testid="palette" />
          <div ref={panelRef} data-testid="panel" />
        </>
      );
    }

    render(<Harness />);

    // 1000x800, not the 1280x720 default, and only x 48..680, y 60..800:
    // 0.9 * 632 / 1024 floors to 0.546875, so the canvas is 560px square.
    expect(latest!.viewportSize).toEqual({ width: 1000, height: 800 });
    expect(latest!.zoom).toBeCloseTo(0.546875, 6);
    expect(latest!.pan).toEqual({ x: 48 + (632 - 560) / 2, y: 60 + (740 - 560) / 2 });
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
