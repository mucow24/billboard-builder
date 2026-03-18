import { getRenderBox, type RenderBox } from './transformGeometry';
import type { CanvasItem } from '../document/documentTypes';

export interface OverflowClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function doesRenderBoxOverflowCanvas(renderBox: RenderBox, canvasBox: RenderBox) {
  return (
    renderBox.x < canvasBox.x ||
    renderBox.y < canvasBox.y ||
    renderBox.x + renderBox.width > canvasBox.x + canvasBox.width ||
    renderBox.y + renderBox.height > canvasBox.y + canvasBox.height
  );
}

export function getOverflowRenderableItems<T extends CanvasItem>(items: T[], canvasBox: RenderBox): T[] {
  return items.filter((item) => !item.hidden && doesRenderBoxOverflowCanvas(getRenderBox(item), canvasBox));
}

export function getOverflowClipRects(
  canvasBox: RenderBox,
  workspaceBox: RenderBox,
): OverflowClipRect[] {
  const rects: OverflowClipRect[] = [];

  const topHeight = canvasBox.y - workspaceBox.y;
  if (topHeight > 0) {
    rects.push({
      x: workspaceBox.x,
      y: workspaceBox.y,
      width: workspaceBox.width,
      height: topHeight,
    });
  }

  const bottomY = canvasBox.y + canvasBox.height;
  const bottomHeight = workspaceBox.y + workspaceBox.height - bottomY;
  if (bottomHeight > 0) {
    rects.push({
      x: workspaceBox.x,
      y: bottomY,
      width: workspaceBox.width,
      height: bottomHeight,
    });
  }

  const leftWidth = canvasBox.x - workspaceBox.x;
  if (leftWidth > 0) {
    rects.push({
      x: workspaceBox.x,
      y: canvasBox.y,
      width: leftWidth,
      height: canvasBox.height,
    });
  }

  const rightX = canvasBox.x + canvasBox.width;
  const rightWidth = workspaceBox.x + workspaceBox.width - rightX;
  if (rightWidth > 0) {
    rects.push({
      x: rightX,
      y: canvasBox.y,
      width: rightWidth,
      height: canvasBox.height,
    });
  }

  return rects;
}
