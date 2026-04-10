import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';

import type { CanvasPointerEvent } from './canvasRendererTypes';

const CANVAS_SURFACE_LABELS = new Set([
  'canvas-surface',
  'canvas-background',
  'canvas-backdrop',
  'event-root',
]);

/** Normalize a PixiJS federated event at the rendering boundary. */
export function normalizePixiEvent(
  event: FederatedPointerEvent | FederatedWheelEvent,
): CanvasPointerEvent {
  const isCanvasSurface =
    !event.target ||
    CANVAS_SURFACE_LABELS.has(event.target.label);

  return {
    viewportPointer: { x: event.global.x, y: event.global.y },
    nativeEvent: event.nativeEvent as MouseEvent | WheelEvent,
    stopPropagation() {
      event.stopPropagation();
    },
    isCanvasSurface,
  };
}
