import { stageToLocal, type Point } from './interactionGeometry';
import { getRenderBox } from './transformGeometry';
import type { RenderableCanvasItem } from './renderAdapter';

export function pointHitsRenderableItem(item: RenderableCanvasItem, point: Point) {
  if (item.kind === 'line') {
    const left = Math.min(item.startX, item.endX) - Math.max(item.strokeWidth / 2, 8);
    const right = Math.max(item.startX, item.endX) + Math.max(item.strokeWidth / 2, 8);
    const top = Math.min(item.startY, item.endY) - Math.max(item.strokeWidth / 2, 8);
    const bottom = Math.max(item.startY, item.endY) + Math.max(item.strokeWidth / 2, 8);
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  const renderBox = getRenderBox(item);
  const local = stageToLocal(point, { x: renderBox.x, y: renderBox.y }, item.rotation);
  return (
    local.x >= 0 &&
    local.x <= renderBox.width &&
    local.y >= 0 &&
    local.y <= renderBox.height
  );
}

export function getGroupDescendantAtPoint(
  renderedItems: RenderableCanvasItem[],
  groupId: string,
  point: Point,
) {
  return renderedItems
    .filter((item) => item.groupPath.includes(groupId))
    .slice()
    .reverse()
    .find((item) => pointHitsRenderableItem(item, point)) ?? null;
}
