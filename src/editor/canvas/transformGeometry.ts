import type { CanvasItem } from '../model/types';

export interface RenderBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransformPreview extends RenderBox {
  itemId: string;
  rotation: number;
}

export interface TransformSnapshot extends RenderBox {
  scaleX: number;
  scaleY: number;
  rotation: number;
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

export function buildTransformCommit(
  baseBox: RenderBox,
  snapshot: TransformSnapshot,
  minSize = 20
) {
  return {
    x: snapshot.x,
    y: snapshot.y,
    width: Math.max(minSize, baseBox.width * snapshot.scaleX),
    height: Math.max(minSize, baseBox.height * snapshot.scaleY),
    rotation: snapshot.rotation,
    scaleX: 1,
    scaleY: 1,
  };
}

export function applyPreviewToItem<T extends CanvasItem>(
  item: T,
  preview: TransformPreview | null
): T {
  if (!preview || preview.itemId !== item.id || item.kind === 'line') {
    return item;
  }

  return {
    ...item,
    x: preview.x,
    y: preview.y,
    width: preview.width,
    height: preview.height,
    rotation: preview.rotation,
    scaleX: 1,
    scaleY: 1,
  };
}
