import type { CanvasPointerEvent } from '../renderer/canvasRendererTypes';
import type { CanvasTool } from '../../document/documentTypes';

interface BuildStageSceneHandlersParams {
  activeTool: CanvasTool;
  handleScenePointerUp: () => boolean;
  handleStageMouseDown: (event: CanvasPointerEvent) => void;
  handleStagePointerMove: (event: CanvasPointerEvent) => void;
  handleStageMouseUp: (event: CanvasPointerEvent) => void;
  hasActiveSession: boolean;
  isPanGesture: (event: MouseEvent, hasActiveSession: boolean) => boolean;
  startPanDrag: (pointer: { x: number; y: number }) => void;
  startZoomToolGesture: (pointer: { x: number; y: number }, zoomOut: boolean) => void;
  zoomInFromWheel: (point: { x: number; y: number }, deltaY: number) => void;
}

export function buildStageSceneHandlers({
  activeTool,
  handleScenePointerUp,
  handleStageMouseDown,
  handleStagePointerMove,
  handleStageMouseUp,
  hasActiveSession,
  isPanGesture,
  startPanDrag,
  startZoomToolGesture,
  zoomInFromWheel,
}: BuildStageSceneHandlersParams) {
  return {
    onStageMouseDown(event: CanvasPointerEvent) {
      const pointer = event.viewportPointer;
      const nativeEvent = event.nativeEvent as MouseEvent;
      if (pointer && isPanGesture(nativeEvent, hasActiveSession)) {
        nativeEvent.preventDefault();
        startPanDrag(pointer);
        return;
      }
      if (activeTool === 'zoom' && pointer) {
        if (nativeEvent.button === 0) {
          startZoomToolGesture(pointer, Boolean(nativeEvent.altKey));
        }
        return;
      }
      handleStageMouseDown(event);
    },
    onStageMouseMove(event: CanvasPointerEvent) {
      handleStagePointerMove(event);
    },
    onStageMouseUp(event: CanvasPointerEvent) {
      if (handleScenePointerUp()) {
        return;
      }
      handleStageMouseUp(event);
    },
    onStageWheel(event: CanvasPointerEvent) {
      const nativeEvent = event.nativeEvent as WheelEvent;
      nativeEvent.preventDefault();
      const pointer = event.viewportPointer;
      if (!pointer) {
        return;
      }
      zoomInFromWheel(pointer, nativeEvent.deltaY);
    },
  };
}
