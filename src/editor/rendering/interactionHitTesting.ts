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

/**
 * Whether `point` lands on the item's own hit region. Unlike
 * `pointHitsRenderableItem`, lines use the same narrow corridor as their Pixi
 * hit polygon (not their bounding box) and generators cover the whole canvas,
 * so the answer matches what a real click on the item would hit.
 */
function pointHitsItemHitRegion(item: RenderableCanvasItem, point: Point) {
  if (item.kind === 'line') {
    const start = { x: item.startX, y: item.startY };
    const end = { x: item.endX, y: item.endY };
    const pad = Math.max(item.strokeWidth / 2 + 8, 12);
    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const along = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
    const offset = { x: point.x - start.x, y: point.y - start.y };
    const alongDistance = offset.x * along.x + offset.y * along.y;
    const acrossDistance = Math.abs(offset.x * along.y - offset.y * along.x);
    return alongDistance >= 0 && alongDistance <= length && acrossDistance <= pad;
  }
  if (item.kind === 'generator') {
    return point.x >= 0 && point.x <= item.width && point.y >= 0 && point.y <= item.height;
  }
  return pointHitsRenderableItem(item, point);
}

/**
 * Every rendered item under `point`, top-most first. Includes locked items and
 * items completely covered by others; hidden items are never rendered, so they
 * never appear.
 */
export function getItemsAtPoint(renderedItems: RenderableCanvasItem[], point: Point) {
  return renderedItems
    .filter((item) => pointHitsItemHitRegion(item, point))
    .reverse();
}

/**
 * Resolve an alt-click at `point` to the node it should select, or `null`
 * when nothing is under the point.
 *
 * The items under the point form a stack, top-most first. Each one stands for
 * the node a click on it addresses: the selected node it belongs to, otherwise
 * its selectable node (so a group is one stop unless it has been drilled into).
 *
 * - Nothing in the stack selected: pick what a plain click would pick, the
 *   top-most unlocked item, falling back to the top-most item when every item
 *   under the point is locked.
 * - Something in the stack selected: step to the stop below the deepest
 *   selected one, wrapping back to the top.
 */
export function getSelectionCycleTargetAtPoint(
  renderedItems: RenderableCanvasItem[],
  selectedNodeIds: readonly string[],
  point: Point,
): string | null {
  const hits = getItemsAtPoint(renderedItems, point);
  if (hits.length === 0) {
    return null;
  }

  const selectedIds = new Set(selectedNodeIds);
  const resolveStop = (item: RenderableCanvasItem) => {
    const selectedGroupId = item.groupPath.find((groupId) => selectedIds.has(groupId));
    if (selectedGroupId) {
      return { nodeId: selectedGroupId, selected: true };
    }
    if (selectedIds.has(item.id)) {
      return { nodeId: item.id, selected: true };
    }
    return { nodeId: item.selectableNodeId, selected: selectedIds.has(item.selectableNodeId) };
  };

  const stops: Array<{ nodeId: string; selected: boolean }> = [];
  for (const hit of hits) {
    const stop = resolveStop(hit);
    if (!stops.some((entry) => entry.nodeId === stop.nodeId)) {
      stops.push(stop);
    }
  }

  const deepestSelectedIndex = stops.map((stop) => stop.selected).lastIndexOf(true);
  if (deepestSelectedIndex === -1) {
    return resolveStop(hits.find((item) => !item.locked) ?? hits[0]).nodeId;
  }
  return stops[(deepestSelectedIndex + 1) % stops.length].nodeId;
}
