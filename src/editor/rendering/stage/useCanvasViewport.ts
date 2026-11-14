import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { useKeyHeld } from '../../../app/useKeyHeld';
import type { CanvasTool } from '../../document/documentTypes';
import type { Point } from '../interactionGeometry';
import { useModifierKeys } from '../useModifierKeys';

import {
  alignViewportPanToDevicePixels,
  clampZoom,
  fitCanvasToArea,
  getDevicePixelRatio,
  getFitArea,
  snapZoomToSeamFriendlyStep,
  toCanvasPointer,
  toViewportPoint,
  toViewportRect,
  type ViewportArea,
} from './viewportMath';

const ZOOM_STEP = 1.2;
const HUD_ZOOM_STEP = 0.1;

interface UseCanvasViewportParams {
  activeTool: CanvasTool;
  canvasHeight: number;
  canvasWidth: number;
  // A panel floating over the viewport's right side (the inspector), which
  // Fit keeps the canvas clear of while it is shown.
  overlayPanelRef?: RefObject<HTMLElement | null>;
}

type PanUpdate = Point | ((currentPan: Point) => Point);

export function useCanvasViewport({
  activeTool,
  canvasHeight,
  canvasWidth,
  overlayPanelRef,
}: UseCanvasViewportParams) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const panDragRef = useRef<{ startPointer: Point; startPan: Point } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const spacebarHeld = useKeyHeld(' ');
  const { modifierKeys } = useModifierKeys({
    onBlur: () => {
      panDragRef.current = null;
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

  // The panel that floats over the viewport's right side, measured when Fit
  // runs, so the canvas is fitted into the part of the viewport left of it.
  const getOverlayPanelRect = useCallback((): ViewportArea | null => {
    const panel = overlayPanelRef?.current;
    const viewportBounds = viewportRef.current?.getBoundingClientRect();
    if (!panel || !viewportBounds) {
      return null;
    }
    const panelBounds = panel.getBoundingClientRect();
    return {
      left: panelBounds.left - viewportBounds.left,
      top: panelBounds.top - viewportBounds.top,
      width: panelBounds.width,
      height: panelBounds.height,
    };
  }, [overlayPanelRef]);

  const fitCanvasToViewport = useCallback(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const fit = fitCanvasToArea(
      { width: canvasWidth, height: canvasHeight },
      getFitArea(viewportSize, getOverlayPanelRect()),
      getDevicePixelRatio(),
    );

    setZoom(fit.zoom);
    setAlignedPan(fit.pan);
  }, [canvasHeight, canvasWidth, getOverlayPanelRect, setAlignedPan, viewportSize]);

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
  // default viewport size. The second fit also sees the overlay panel, whose
  // ref is attached only after this component's first layout effects.
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
      zoomAround(point, zoomRef.current * (zoomOut ? 1 / ZOOM_STEP : ZOOM_STEP));
    },
    [zoomAround],
  );

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
      const direction = deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      zoomAround(point, zoomRef.current * direction);
    },
    [zoomAround],
  );

  return {
    centerPoint,
    applyZoomToolClick,
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
    toCanvasPointer: stableToCanvasPointer,
    toViewportPoint: stableToViewportPoint,
    toViewportRect: stableToViewportRect,
    viewport,
    viewportRef,
    viewportSize,
    zoom,
    zoomAround,
    zoomInFromWheel: stableZoomInFromWheel,
    zoomOutFromHudStep: HUD_ZOOM_STEP,
  };
}
