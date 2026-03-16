import type { CanvasItem } from '../document/documentTypes';

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

interface NormalizedAxisTransform {
  position: number;
  size: number;
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

function normalizeAxisTransform(
  position: number,
  baseSize: number,
  scale: number,
  zeroSize = 1
): NormalizedAxisTransform {
  const scaledSize = baseSize * scale;
  if (scaledSize === 0) {
    return {
      position,
      size: zeroSize,
    };
  }

  const nextEdge = position + scaledSize;
  return {
    position: Math.min(position, nextEdge),
    size: Math.abs(scaledSize),
  };
}

export function buildTransformCommit(
  baseBox: RenderBox,
  snapshot: TransformSnapshot,
  zeroSize = 1
) {
  const normalizedX = normalizeAxisTransform(
    snapshot.x,
    baseBox.width,
    snapshot.scaleX,
    zeroSize
  );
  const normalizedY = normalizeAxisTransform(
    snapshot.y,
    baseBox.height,
    snapshot.scaleY,
    zeroSize
  );

  return {
    x: normalizedX.position,
    y: normalizedY.position,
    width: normalizedX.size,
    height: normalizedY.size,
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
