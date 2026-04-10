import type { CanvasPointerEvent } from '../renderer/canvasRendererTypes';
import type { Point } from '../interactionGeometry';

/**
 * Creates an onPointerDown handler for canvas items that handles:
 * - Early return when the item is not interactive
 * - Pan-gesture detection (middle-mouse-button or spacebar-held)
 * - Bubble cancellation
 * - Delegating to an action callback with the resolved canvas pointer
 */
export function createItemPointerDownHandler({
  isInteractive,
  panModifierHeld,
  startPanDrag,
  toCanvasPointer,
  onAction,
}: {
  isInteractive: () => boolean;
  panModifierHeld?: boolean;
  startPanDrag: ((pointer: Point) => void) | undefined;
  toCanvasPointer: (pointer: Point) => Point;
  onAction: (pointer: Point, shiftKey: boolean, nativeEvent: MouseEvent) => void;
}) {
  return (event: CanvasPointerEvent) => {
    if (!isInteractive()) {
      return;
    }
    const pointer = event.viewportPointer;
    if (!pointer) {
      return;
    }
    const nativeEvent = event.nativeEvent as MouseEvent;
    if (nativeEvent.button === 1 || panModifierHeld) {
      if (!startPanDrag) {
        return;
      }
      event.stopPropagation();
      startPanDrag(pointer);
      return;
    }
    event.stopPropagation();
    onAction(toCanvasPointer(pointer), nativeEvent.shiftKey, nativeEvent);
  };
}
