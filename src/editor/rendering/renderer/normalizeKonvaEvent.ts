import type { KonvaEventObject } from 'konva/lib/Node';

import type { CanvasPointerEvent } from './canvasRendererTypes';

/** Normalize a Konva event at the rendering boundary before forwarding to handlers. */
export function normalizeKonvaEvent(
  event: KonvaEventObject<MouseEvent> | KonvaEventObject<WheelEvent>,
): CanvasPointerEvent {
  const stage = event.target.getStage?.();
  const target = event.target;
  const isCanvasSurface =
    target === stage ||
    target.hasName?.('canvas-surface') ||
    target.hasName?.('canvas-background') ||
    target.hasName?.('canvas-backdrop') ||
    target.name?.() === 'canvas-surface' ||
    target.name?.() === 'canvas-background' ||
    target.name?.() === 'canvas-backdrop';

  return {
    viewportPointer: stage?.getPointerPosition() ?? null,
    nativeEvent: event.evt,
    stopPropagation() {
      event.cancelBubble = true;
    },
    isCanvasSurface,
  };
}

/**
 * Wrap a CanvasPointerEvent handler for use as a Konva onMouseDown prop.
 * Bridges the abstraction boundary: Konva fires KonvaEventObject, business
 * logic expects CanvasPointerEvent.
 */
export function asKonvaMouseDown(
  handler: (event: CanvasPointerEvent) => void,
): (event: KonvaEventObject<MouseEvent>) => void {
  return (event) => handler(normalizeKonvaEvent(event));
}
