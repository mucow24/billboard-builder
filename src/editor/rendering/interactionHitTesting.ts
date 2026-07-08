import { stageToLocal, type Point } from './interactionGeometry';
import {
  distanceToPolygonEdges,
  pointInPolygonVertices,
} from './geometry/polygonGeometry';
import { getRenderBox } from './transformGeometry';
import type { RenderableCanvasItem } from './renderAdapter';

export function pointHitsRenderableItem(item: RenderableCanvasItem, point: Point) {
  if (item.kind === 'polygon') {
    // Match the Pixi hit area: closed hits on fill + stroke band, open hits on
    // a padded corridor along the stroke chain.
    if (item.closed) {
      const rim = item.strokeWidth / 2;
      return (
        pointInPolygonVertices(point, item.vertices) ||
        (rim > 0 && distanceToPolygonEdges(point, item.vertices, true) <= rim)
      );
    }
    const pad = Math.max(item.strokeWidth / 2 + 8, 12);
    return distanceToPolygonEdges(point, item.vertices, false) <= pad;
  }

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
