import type Konva from 'konva';

import type { Point } from '../interactionGeometry';

/**
 * Creates an onMouseDown handler for canvas items that handles:
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
  return (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isInteractive()) {
      return;
    }
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) {
      return;
    }
    if (event.evt.button === 1 || panModifierHeld) {
      if (!startPanDrag) {
        return;
      }
      event.cancelBubble = true;
      startPanDrag(pointer);
      return;
    }
    event.cancelBubble = true;
    onAction(toCanvasPointer(pointer), event.evt.shiftKey, event.evt);
  };
}
