import type { RenderableCanvasItem } from '../renderAdapter';
import { getSelectionRenderBounds } from '../selectionGeometry';
import type { RenderBox } from '../transformGeometry';

/**
 * What the hover outline is drawn around: what a click at the pointer would
 * select.
 *
 * - `item`: one item, outlined along its own (rotated) box or vertex chain.
 * - `bounds`: an upright box, around a group's items or a generator's canvas.
 */
export type HoverOutline =
  | { nodeId: string; kind: 'item'; item: RenderableCanvasItem }
  | { nodeId: string; kind: 'bounds'; bounds: RenderBox };

interface ResolveHoverOutlineParams {
  /** The item under the pointer, as the item layer reports it. */
  hoveredItemId: string | null;
  renderedItems: RenderableCanvasItem[];
  selectedNodeIds: readonly string[];
  /** Every item of the selection, whether selected itself or through a group. */
  selectedItemIds: readonly string[];
  canvasBounds: RenderBox;
}

/**
 * The outline for the item under the pointer, or null where there is nothing
 * to add: no such item (any more), one that clicks pass through, or one the
 * selection overlay outlines already.
 */
export function resolveHoverOutline({
  hoveredItemId,
  renderedItems,
  selectedNodeIds,
  selectedItemIds,
  canvasBounds,
}: ResolveHoverOutlineParams): HoverOutline | null {
  if (!hoveredItemId) return null;
  const item = renderedItems.find((entry) => entry.id === hoveredItemId);
  if (!item || item.hidden || item.locked) return null;

  const nodeId = item.selectableNodeId;
  if (selectedNodeIds.includes(nodeId) || selectedItemIds.includes(item.id)) return null;

  if (nodeId !== item.id) {
    // A click selects the group the item is in: outline all of it.
    const bounds = getSelectionRenderBounds(
      renderedItems.filter((entry) => !entry.hidden && entry.groupPath.includes(nodeId)),
    );
    return bounds ? { nodeId, kind: 'bounds', bounds } : null;
  }

  // A generator fills the canvas, whatever its own box says.
  if (item.kind === 'generator') return { nodeId, kind: 'bounds', bounds: canvasBounds };

  return { nodeId, kind: 'item', item };
}
