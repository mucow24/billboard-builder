import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CanvasTool } from '../../document/documentTypes';
import type { Point } from '../interactionGeometry';
import { useModifierKeys } from '../useModifierKeys';

import { clampZoom, toCanvasPointer, toViewportPoint, toViewportRect } from './viewportMath';

const ZOOM_STEP = 1.2;
const HUD_ZOOM_STEP = 0.1;

interface UseCanvasViewportParams {
  activeTool: CanvasTool;
  canvasHeight: number;
  canvasWidth: number;
}

interface ViewportPoint {
  x: number;
  y: number;
}

export function useCanvasViewport({
  activeTool,
  canvasHeight,
  canvasWidth,
}: UseCanvasViewportParams) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanDragging, setIsPanDragging] = useState(false);
  const panDragRef = useRef<{ startPointer: Point; startPan: Point } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const { modifierKeys } = useModifierKeys({
    onBlur: () => {
      panDragRef.current = null;
    },
  });

  const centerPoint = useMemo(
    () => ({ x: viewportSize.width / 2, y: viewportSize.height / 2 }),
    [viewportSize.height, viewportSize.width],
  );

  const fitCanvasToViewport = useCallback(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const nextZoom = clampZoom(
      Math.min(
        viewportSize.width / Math.max(canvasWidth, 1),
        viewportSize.height / Math.max(canvasHeight, 1),
      ) * 0.9,
    );

    setZoom(nextZoom);
    setPan({
      x: (viewportSize.width - canvasWidth * nextZoom) / 2,
      y: (viewportSize.height - canvasHeight * nextZoom) / 2,
    });
  }, [canvasHeight, canvasWidth, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setViewportSize({
        width: Math.max(320, Math.round(width)),
        height: Math.max(320, Math.round(height)),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fitCanvasToViewport();
  }, [fitCanvasToViewport]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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
    setIsPanDragging(false);
    window.document.body.style.cursor = '';
  }, []);

  const startPanDrag = useCallback((startPointer: Point) => {
    panDragRef.current = {
      startPointer,
      startPan: { ...panRef.current },
    };
    setIsPanDragging(true);
    window.document.body.style.cursor = 'grabbing';
  }, []);

  const isClientPointInsideViewport = useCallback((clientX: number, clientY: number) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) {
      return false;
    }
    return (
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    );
  }, []);

  useEffect(() => {
    if (!isPanDragging) {
      return;
    }

    function handleWindowMouseMove(event: MouseEvent) {
      const current = panDragRef.current;
      if (!current) {
        return;
      }
      if (isClientPointInsideViewport(event.clientX, event.clientY)) {
        return;
      }
      const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
      if (!pointer) {
        stopPanDrag();
        return;
      }
      event.preventDefault();
      window.document.body.style.cursor = 'grabbing';
      setPan({
        x: current.startPan.x + (pointer.x - current.startPointer.x),
        y: current.startPan.y + (pointer.y - current.startPointer.y),
      });
    }

    function handleWindowMouseUp(event: MouseEvent) {
      void event;
      stopPanDrag();
    }

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.document.body.style.cursor = '';
    };
  }, [getViewportPointerFromClient, isClientPointInsideViewport, isPanDragging, stopPanDrag]);

  const viewport = useMemo(
    () => ({ zoom, panX: pan.x, panY: pan.y }),
    [pan.x, pan.y, zoom],
  );

  const zoomAround = useCallback((point: Point, nextZoom: number) => {
    const clampedZoom = clampZoom(nextZoom);
    setPan((currentPan) => ({
      x: point.x - ((point.x - currentPan.x) / zoomRef.current) * clampedZoom,
      y: point.y - ((point.y - currentPan.y) / zoomRef.current) * clampedZoom,
    }));
    setZoom(clampedZoom);
  }, []);

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
      activeTool === 'pan' || event.button === 1 || (event.shiftKey && !hasActiveSession),
    [activeTool],
  );

  const getStageCursor = useCallback(
    (hasActiveSession: boolean) =>
      panDragRef.current
        ? 'grabbing'
        : activeTool === 'pan' || (modifierKeys.shiftKey && !hasActiveSession)
          ? 'grab'
          : activeTool === 'zoom'
            ? modifierKeys.altKey
              ? 'zoom-out'
              : 'zoom-in'
            : activeTool === 'select'
              ? 'default'
              : 'crosshair',
    [activeTool, modifierKeys.altKey, modifierKeys.shiftKey],
  );

  const handleStagePointerMove = useCallback((pointer: ViewportPoint | null) => {
    const current = panDragRef.current;
    if (!current || !pointer) {
      return;
    }
    setPan({
      x: current.startPan.x + (pointer.x - current.startPointer.x),
      y: current.startPan.y + (pointer.y - current.startPointer.y),
    });
  }, []);

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

  return {
    centerPoint,
    applyZoomToolClick,
    fitCanvasToViewport,
    getViewportPointerFromClient,
    handleStagePointerLeave,
    handleStagePointerMove,
    handleStagePointerUp,
    isPanGesture,
    pan,
    setZoomFromHud,
    getStageCursor,
    startPanDrag,
    toCanvasPointer: (pointer: Point) => toCanvasPointer(pointer, zoom, pan),
    toViewportPoint: (point: Point) => toViewportPoint(point, zoom, pan),
    toViewportRect: (rect: { x: number; y: number; width: number; height: number }) =>
      toViewportRect(rect, zoom, pan),
    viewport,
    viewportRef,
    viewportSize,
    zoom,
    zoomAround,
    zoomInFromWheel: (point: Point, deltaY: number) => {
      const direction = deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      zoomAround(point, zoomRef.current * direction);
    },
    zoomOutFromHudStep: HUD_ZOOM_STEP,
  };
}
