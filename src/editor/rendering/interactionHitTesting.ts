import { stageToLocal, type Point } from './interactionGeometry';
import {
  distanceToPolygonEdges,
  pointInPolygonVertices,
} from './geometry/polygonGeometry';
import { isLineItem, isStraightLine } from '../document/polygonVertices';
import { getRenderBox } from './transformGeometry';
import type { RenderableCanvasItem } from './renderAdapter';

/** The padded corridor along an open chain's stroke: the Pixi hit area of a line. */
function pointHitsOpenChainCorridor(
  item: Extract<RenderableCanvasItem, { kind: 'polygon' }>,
  point: Point,
) {
  const pad = Math.max(item.strokeWidth / 2 + 8, 12);
  return distanceToPolygonEdges(point, item.vertices, false) <= pad;
}

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
    if (isStraightLine(item)) {
      // A straight line answers for its whole padded box here, as lines always
      // have: this is what lets a double-click near a thin line inside a group
      // drill into it. Real clicks use the corridor (pointHitsItemHitRegion).
      const pad = Math.max(item.strokeWidth / 2, 8);
      const box = getRenderBox(item);
      return (
        point.x >= box.x - pad &&
        point.x <= box.x + box.width + pad &&
        point.y >= box.y - pad &&
        point.y <= box.y + box.height + pad
      );
    }
    return pointHitsOpenChainCorridor(item, point);
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
 * hit area (not their bounding box) and generators cover the whole canvas, so
 * the answer matches what a real click on the item would hit.
 */
function pointHitsItemHitRegion(item: RenderableCanvasItem, point: Point) {
  if (isLineItem(item)) {
    return pointHitsOpenChainCorridor(item, point);
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

/** The selected node `item` belongs to: a selected group around it, or itself. */
function getSelectedNodeIdOfItem(item: RenderableCanvasItem, selectedIds: ReadonlySet<string>) {
  const selectedGroupId = item.groupPath.find((groupId) => selectedIds.has(groupId));
  if (selectedGroupId) {
    return selectedGroupId;
  }
  if (selectedIds.has(item.id)) {
    return item.id;
  }
  return selectedIds.has(item.selectableNodeId) ? item.selectableNodeId : null;
}

/**
 * The top-most item under `point` that is part of the current selection, with
 * the selected node it belongs to, or `null` when the selection is not under
 * the point. A plain press there keeps the selection (and drags it) even when
 * an unselected item lies on top: otherwise an item reached with alt-click
 * could never be pressed again without losing it to whatever covers it.
 *
 * Locked items are skipped because they take no pointer events, and
 * generators because they cover the whole canvas and cannot be dragged: a
 * selected generator would swallow every click.
 */
export function getSelectedHitAtPoint(
  renderedItems: RenderableCanvasItem[],
  selectedNodeIds: readonly string[],
  point: Point,
): { item: RenderableCanvasItem; nodeId: string } | null {
  if (selectedNodeIds.length === 0) {
    return null;
  }
  const selectedIds = new Set(selectedNodeIds);
  for (const item of getItemsAtPoint(renderedItems, point)) {
    if (item.locked || item.kind === 'generator') {
      continue;
    }
    const nodeId = getSelectedNodeIdOfItem(item, selectedIds);
    if (nodeId) {
      return { item, nodeId };
    }
  }
  return null;
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
