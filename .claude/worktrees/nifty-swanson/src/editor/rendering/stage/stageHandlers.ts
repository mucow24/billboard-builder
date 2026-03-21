import type { KonvaEventObject } from 'konva/lib/Node';

import type { CanvasTool } from '../../document/documentTypes';

interface BuildStageSceneHandlersParams {
  activeTool: CanvasTool;
  applyZoomToolClick: (point: { x: number; y: number }, zoomOut: boolean) => void;
  handleScenePointerMove: (pointer: { x: number; y: number } | null) => void;
  handleScenePointerUp: () => boolean;
  handleStageMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  handleStagePointerMove: (event: KonvaEventObject<MouseEvent>) => void;
  handleStageMouseUp: (event: KonvaEventObject<MouseEvent>) => void;
  hasActiveSession: boolean;
  isPanGesture: (event: MouseEvent, hasActiveSession: boolean) => boolean;
  startPanDrag: (pointer: { x: number; y: number }) => void;
  zoomInFromWheel: (point: { x: number; y: number }, deltaY: number) => void;
}

export function buildStageSceneHandlers({
  activeTool,
  applyZoomToolClick,
  handleScenePointerMove,
  handleScenePointerUp,
  handleStageMouseDown,
  handleStagePointerMove,
  handleStageMouseUp,
  hasActiveSession,
  isPanGesture,
  startPanDrag,
  zoomInFromWheel,
}: BuildStageSceneHandlersParams) {
  return {
    onStageMouseDown(event: KonvaEventObject<MouseEvent>) {
      const pointer = event.target.getStage()?.getPointerPosition() ?? null;
      if (pointer && isPanGesture(event.evt, hasActiveSession)) {
        event.evt.preventDefault();
        startPanDrag(pointer);
        return;
      }
      if (activeTool === 'zoom' && pointer) {
        applyZoomToolClick(pointer, Boolean(event.evt.altKey));
        return;
      }
      handleStageMouseDown(event);
    },
    onStageMouseMove(event: KonvaEventObject<MouseEvent>) {
      const pointer = event.target.getStage()?.getPointerPosition() ?? null;
      handleScenePointerMove(pointer);
      handleStagePointerMove(event);
    },
    onStageMouseUp(event: KonvaEventObject<MouseEvent>) {
      if (handleScenePointerUp()) {
        return;
      }
      handleStageMouseUp(event);
    },
    onStageWheel(event: KonvaEventObject<WheelEvent>) {
      event.evt.preventDefault();
      const pointer = event.target.getStage()?.getPointerPosition();
      if (!pointer) {
        return;
      }
      zoomInFromWheel(pointer, event.evt.deltaY);
    },
  };
}
