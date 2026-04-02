import type { CanvasItem } from '../document/documentTypes';

export interface RenderBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function getRenderBox(item: CanvasItem): RenderBox {
  if (item.kind === 'line') {
    return {
      x: Math.min(item.startX, item.endX),
      y: Math.min(item.startY, item.endY),
      width: Math.max(1, Math.abs(item.endX - item.startX)),
      height: Math.max(1, Math.abs(item.endY - item.startY)),
    };
  }

  return {
    x: item.x,
    y: item.y,
    width: item.width * item.scaleX,
    height: item.height * item.scaleY,
  };
}

export function translateRenderBox(bounds: RenderBox, deltaX: number, deltaY: number): RenderBox {
  return {
    ...bounds,
    x: bounds.x + deltaX,
    y: bounds.y + deltaY,
  };
}

// Re-export from split modules for backward compatibility
export {
  getItemSelectionPoints,
  getSelectionRenderBounds,
  getSelectionFrameForRotation,
  itemIntersectsSelectionRect,
} from './selectionGeometry';

export {
  buildGroupDragPreviews,
  buildGroupResizePreviews,
  buildGroupRotatePreviews,
  getGroupResizeBounds,
  getGroupResizeFrame,
  getResizedBoundsFromHandle,
} from './groupTransforms';
