import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { useKeyHeld } from '../../../app/useKeyHeld';
import type { CanvasTool } from '../../document/documentTypes';
import type { Point } from '../interactionGeometry';
import { useModifierKeys } from '../useModifierKeys';

import {
  alignViewportPanToDevicePixels,
  clampZoom,
  fitCanvasToArea,
  fitRectToArea,
  getDevicePixelRatio,
  getFitArea,
  rectFromCorners,
  snapZoomToSeamFriendlyStep,
  toCanvasPointer,
  toViewportPoint,
  toViewportRect,
  type FitObstructions,
  type ViewportArea,
} from './viewportMath';

const WHEEL_ZOOM_STEP = 1.2;
// A click with the zoom tool goes two wheel steps.
const ZOOM_TOOL_CLICK_STEP = WHEEL_ZOOM_STEP ** 2;
const HUD_ZOOM_STEP = 0.1;
// A zoom tool press that moves less than this, in viewport pixels along both
// axes, is a click; one that moves further drags out a box to zoom to.
export const ZOOM_BOX_MIN_DRAG = 4;

interface UseCanvasViewportParams {
  activeTool: CanvasTool;
  canvasHeight: number;
  canvasWidth: number;
  // What floats over the viewport's edges, which Fit and the zoom tool's box
  // keep the canvas clear of.
  fitObstructionRefs?: FitObstructionRefs;
  // Called when a zoom tool click or box has zoomed, not when it is cancelled.
  onZoomToolGestureEnd?: () => void;
}

interface ZoomDrag {
  start: Point;
  current: Point;
  zoomOut: boolean;
}

function isZoomBoxDrag({ start, current }: ZoomDrag) {
  return (
    Math.abs(current.x - start.x) >= ZOOM_BOX_MIN_DRAG ||
    Math.abs(current.y - start.y) >= ZOOM_BOX_MIN_DRAG
  );
}

// The elements floating over the viewport's top edge (the toolbar), left edge
// (the tool palette) and right edge (the inspector panel).
export interface FitObstructionRefs {
  top?: RefObject<HTMLElement | null>;
  left?: RefObject<HTMLElement | null>;
  right?: RefObject<HTMLElement | null>;
}

type PanUpdate = Point | ((currentPan: Point) => Point);

export function useCanvasViewport({
  activeTool,
  canvasHeight,
  canvasWidth,
  fitObstructionRefs,
  onZoomToolGestureEnd,
}: UseCanvasViewportParams) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const panDragRef = useRef<{ startPointer: Point; startPan: Point } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  // A zoom tool press from pointerdown to pointerup, and the box it has
  // dragged out so far, in viewport coordinates (null while it is a click).
  const zoomDragRef = useRef<ZoomDrag | null>(null);
  const [zoomBox, setZoomBox] = useState<ViewportArea | null>(null);
  const onZoomToolGestureEndRef = useRef(onZoomToolGestureEnd);
  onZoomToolGestureEndRef.current = onZoomToolGestureEnd;
  const cancelZoomDrag = useCallback(() => {
    zoomDragRef.current = null;
    setZoomBox(null);
  }, []);
  const spacebarHeld = useKeyHeld(' ');
  const { modifierKeys } = useModifierKeys({
    onBlur: () => {
      panDragRef.current = null;
      cancelZoomDrag();
    },
  });

  const centerPoint = useMemo(
    () => ({ x: viewportSize.width / 2, y: viewportSize.height / 2 }),
    [viewportSize.height, viewportSize.width],
  );

  const setAlignedPan = useCallback((nextPan: PanUpdate) => {
    setPan((currentPan) => {
      const resolvedPan = typeof nextPan === 'function' ? nextPan(currentPan) : nextPan;

      return alignViewportPanToDevicePixels(resolvedPan, getDevicePixelRatio());
    });
  }, []);

  // Read when Fit runs, so a caller may pass a fresh object every render.
  const fitObstructionRefsRef = useRef(fitObstructionRefs);
  fitObstructionRefsRef.current = fitObstructionRefs;

  // Measures what floats over the viewport's edges, in viewport coordinates.
  const measureFitObstructions = useCallback((): FitObstructions => {
    const viewportBounds = viewportRef.current?.getBoundingClientRect();
    const refs = fitObstructionRefsRef.current;
    if (!viewportBounds || !refs) {
      return {};
    }
    const measure = (ref: RefObject<HTMLElement | null> | undefined): ViewportArea | null => {
      const bounds = ref?.current?.getBoundingClientRect();
      return bounds
        ? {
            left: bounds.left - viewportBounds.left,
            top: bounds.top - viewportBounds.top,
            width: bounds.width,
            height: bounds.height,
          }
        : null;
    };
    return { top: measure(refs.top), left: measure(refs.left), right: measure(refs.right) };
  }, []);

  const fitCanvasToViewport = useCallback(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const fit = fitCanvasToArea(
      { width: canvasWidth, height: canvasHeight },
      getFitArea(viewportSize, measureFitObstructions()),
      getDevicePixelRatio(),
    );

    setZoom(fit.zoom);
    setAlignedPan(fit.pan);
  }, [canvasHeight, canvasWidth, measureFitObstructions, setAlignedPan, viewportSize]);

  const [viewportMeasured, setViewportMeasured] = useState(false);
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    const applySize = (width: number, height: number) => {
      setViewportSize({
        width: Math.max(320, Math.round(width)),
        height: Math.max(320, Math.round(height)),
      });
      setViewportMeasured(true);
    };

    // Measure before the first paint: the ResizeObserver reports only after
    // it, and the first fit would otherwise use the default size.
    const bounds = node.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0) {
      applySize(bounds.width, bounds.height);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      applySize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Fit once on mount, and once more when the first measurement replaces the
  // default viewport size. The second fit also sees the toolbar, tool palette
  // and inspector panel, which come later in the app and so get their refs
  // attached only after this component's first layout effects.
  const initialFitRef = useRef<'none' | 'default-size' | 'measured'>('none');
  useLayoutEffect(() => {
    const target = viewportMeasured ? 'measured' : 'default-size';
    if (initialFitRef.current === 'measured' || initialFitRef.current === target) {
      return;
    }
    fitCanvasToViewport();
    initialFitRef.current = target;
  }, [fitCanvasToViewport, viewportMeasured]);

  // Sync refs during render (not in useEffect) so stable callbacks
  // read current values in the same render pass that changes zoom/pan.
  panRef.current = pan;
  zoomRef.current = zoom;

  const getViewportPointerFromClient = useCallback((clientX: number, clientY: number) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }
    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
  }, []);

  const stopPanDrag = useCallback(() => {
    if (!panDragRef.current) {
      return;
    }
    panDragRef.current = null;
    window.document.body.style.cursor = '';
  }, []);

  const startPanDrag = useCallback((startPointer: Point) => {
    panDragRef.current = {
      startPointer,
      startPan: { ...panRef.current },
    };
    window.document.body.style.cursor = 'grabbing';
  }, []);

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent) {
      const current = panDragRef.current;
      if (!current) {
        return;
      }
      if (event.buttons === 0) {
        stopPanDrag();
        return;
      }
      const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
      if (!pointer) {
        stopPanDrag();
        return;
      }
      event.preventDefault();
      window.document.body.style.cursor = 'grabbing';
      setAlignedPan({
        x: current.startPan.x + (pointer.x - current.startPointer.x),
        y: current.startPan.y + (pointer.y - current.startPointer.y),
      });
    }

    function handleWindowPointerUp() {
      if (panDragRef.current) {
        stopPanDrag();
      }
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
      window.document.body.style.cursor = '';
    };
  }, [getViewportPointerFromClient, setAlignedPan, stopPanDrag]);

  const viewport = useMemo(
    () => ({ zoom, panX: pan.x, panY: pan.y }),
    [pan.x, pan.y, zoom],
  );

  const zoomAround = useCallback((point: Point, nextZoom: number) => {
    const clampedZoom = clampZoom(nextZoom);
    const snappedZoom = snapZoomToSeamFriendlyStep(clampedZoom, getDevicePixelRatio());
    setAlignedPan((currentPan) => ({
      x: point.x - ((point.x - currentPan.x) / zoomRef.current) * snappedZoom,
      y: point.y - ((point.y - currentPan.y) / zoomRef.current) * snappedZoom,
    }));
    setZoom(snappedZoom);
  }, [setAlignedPan]);

  const setZoomFromHud = useCallback(
    (nextZoom: number) => {
      zoomAround(centerPoint, nextZoom);
    },
    [centerPoint, zoomAround],
  );

  const applyZoomToolClick = useCallback(
    (point: Point, zoomOut: boolean) => {
      zoomAround(
        point,
        zoomRef.current * (zoomOut ? 1 / ZOOM_TOOL_CLICK_STEP : ZOOM_TOOL_CLICK_STEP),
      );
    },
    [zoomAround],
  );

  // Shows what is under `box`, a rect in viewport coordinates, as large as it
  // fits clear of the toolbar, the tool palette and the inspector panel.
  const zoomToViewportBox = useCallback(
    (box: ViewportArea) => {
      const corner = toCanvasPointer({ x: box.left, y: box.top }, zoomRef.current, panRef.current);
      const fit = fitRectToArea(
        {
          ...corner,
          width: box.width / zoomRef.current,
          height: box.height / zoomRef.current,
        },
        getFitArea(viewportSize, measureFitObstructions()),
        getDevicePixelRatio(),
      );
      setZoom(fit.zoom);
      setAlignedPan(fit.pan);
    },
    [measureFitObstructions, setAlignedPan, viewportSize],
  );

  // A zoom tool press. Released where it started it zooms one step around
  // that point (out with Alt); dragged, it zooms to the box it drags out.
  const startZoomToolGesture = useCallback((pointer: Point, zoomOut: boolean) => {
    zoomDragRef.current = { start: pointer, current: pointer, zoomOut };
    setZoomBox(null);
  }, []);

  useEffect(() => {
    // The pointer in viewport coordinates, kept inside the viewport so the box
    // never reaches past what is on screen.
    function readPointer(event: PointerEvent): Point | null {
      const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
      return (
        pointer && {
          x: Math.min(Math.max(pointer.x, 0), viewportSize.width),
          y: Math.min(Math.max(pointer.y, 0), viewportSize.height),
        }
      );
    }

    function handleWindowPointerMove(event: PointerEvent) {
      const drag = zoomDragRef.current;
      if (!drag) {
        return;
      }
      if (event.buttons === 0) {
        // The release happened where this window could not see it.
        cancelZoomDrag();
        return;
      }
      const pointer = readPointer(event);
      if (!pointer) {
        return;
      }
      drag.current = pointer;
      if (isZoomBoxDrag(drag)) {
        setZoomBox(rectFromCorners(drag.start, pointer));
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const drag = zoomDragRef.current;
      if (!drag) {
        return;
      }
      drag.current = readPointer(event) ?? drag.current;
      cancelZoomDrag();
      if (isZoomBoxDrag(drag)) {
        zoomToViewportBox(rectFromCorners(drag.start, drag.current));
      } else {
        applyZoomToolClick(drag.start, drag.zoomOut);
      }
      onZoomToolGestureEndRef.current?.();
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', cancelZoomDrag);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', cancelZoomDrag);
    };
  }, [
    applyZoomToolClick,
    cancelZoomDrag,
    getViewportPointerFromClient,
    viewportSize,
    zoomToViewportBox,
  ]);

  // Switching tools mid-drag (a hotkey, or Escape) drops the box.
  useEffect(() => {
    if (activeTool !== 'zoom') {
      cancelZoomDrag();
    }
  }, [activeTool, cancelZoomDrag]);

  const isPanGesture = useCallback(
    (event: MouseEvent, hasActiveSession: boolean) =>
      activeTool === 'pan' || event.button === 1 || (spacebarHeld && !hasActiveSession),
    [activeTool, spacebarHeld],
  );

  const getStageCursor = useCallback(
    (hasActiveSession: boolean) =>
      panDragRef.current
        ? 'grabbing'
        : activeTool === 'pan' || (spacebarHeld && !hasActiveSession)
          ? 'grab'
          : activeTool === 'zoom'
            ? modifierKeys.altKey
              ? 'zoom-out'
              : 'zoom-in'
            : activeTool === 'select'
              ? 'default'
              : 'crosshair',
    [activeTool, modifierKeys.altKey, spacebarHeld],
  );

  const handleStagePointerUp = useCallback(() => {
    if (zoomDragRef.current) {
      // The window pointerup listener finishes it.
      return true;
    }
    if (!panDragRef.current) {
      return false;
    }
    stopPanDrag();
    return true;
  }, [stopPanDrag]);

  const handleStagePointerLeave = useCallback(() => {
    if (panDragRef.current) {
      window.document.body.style.cursor = 'grabbing';
    }
  }, []);

  const stableToCanvasPointer = useCallback(
    (pointer: Point) => toCanvasPointer(pointer, zoomRef.current, panRef.current),
    [],
  );

  const stableToViewportPoint = useCallback(
    (point: Point) => toViewportPoint(point, zoomRef.current, panRef.current),
    [],
  );

  const stableToViewportRect = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) =>
      toViewportRect(rect, zoomRef.current, panRef.current),
    [],
  );

  const stableZoomInFromWheel = useCallback(
    (point: Point, deltaY: number) => {
      const direction = deltaY > 0 ? 1 / WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
      zoomAround(point, zoomRef.current * direction);
    },
    [zoomAround],
  );

  return {
    centerPoint,
    fitCanvasToViewport,
    getViewportPointerFromClient,
    handleStagePointerLeave,
    handleStagePointerUp,
    isPanGesture,
    pan,
    setZoomFromHud,
    getStageCursor,
    spacebarHeld,
    startPanDrag,
    startZoomToolGesture,
    toCanvasPointer: stableToCanvasPointer,
    toViewportPoint: stableToViewportPoint,
    toViewportRect: stableToViewportRect,
    viewport,
    viewportRef,
    viewportSize,
    zoom,
    zoomAround,
    zoomBox,
    zoomInFromWheel: stableZoomInFromWheel,
    zoomOutFromHudStep: HUD_ZOOM_STEP,
  };
}
