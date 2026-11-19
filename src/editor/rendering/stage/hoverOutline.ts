import type { CanvasTool } from '../../document/documentTypes';
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
  /** The visible items (hidden ones are never rendered). */
  renderedItems: RenderableCanvasItem[];
  selectedNodeIds: readonly string[];
  /** Every item of the selection, whether selected itself or through a group. */
  selectedItemIds: readonly string[];
  canvasBounds: RenderBox;
  activeTool: CanvasTool;
  /** A drag, resize, rotate or other pointer gesture is under way. */
  gestureInProgress: boolean;
  /** An image is being cropped. */
  cropping: boolean;
  /** A marquee is being dragged out (from its press on). */
  marqueeInProgress: boolean;
  /** The spacebar is held: a press would pan, not select. */
  panKeyHeld: boolean;
}

/**
 * The outline for the item under the pointer, or null where there is nothing
 * to point out: a click would not select (another tool, or a gesture, crop,
 * marquee or pan under way), there is no such item (any more), clicks pass
 * through it, or the selection overlay outlines it already.
 */
export function resolveHoverOutline({
  hoveredItemId,
  renderedItems,
  selectedNodeIds,
  selectedItemIds,
  canvasBounds,
  activeTool,
  gestureInProgress,
  cropping,
  marqueeInProgress,
  panKeyHeld,
}: ResolveHoverOutlineParams): HoverOutline | null {
  if (activeTool !== 'select' || gestureInProgress || cropping || marqueeInProgress || panKeyHeld) {
    return null;
  }
  if (!hoveredItemId) return null;
  const item = renderedItems.find((entry) => entry.id === hoveredItemId);
  // A locked item takes no pointer events, so it is not reported as hovered;
  // the check covers the render in which an item under the pointer is locked.
  if (!item || item.locked) return null;

  const nodeId = item.selectableNodeId;
  if (selectedNodeIds.includes(nodeId) || selectedItemIds.includes(item.id)) return null;

  if (nodeId !== item.id) {
    // A click selects the group the item is in: outline all of it.
    const bounds = getSelectionRenderBounds(
      renderedItems.filter((entry) => entry.groupPath.includes(nodeId)),
    );
    return bounds ? { nodeId, kind: 'bounds', bounds } : null;
  }

  // A generator fills the canvas, whatever its own box says.
  if (item.kind === 'generator') return { nodeId, kind: 'bounds', bounds: canvasBounds };

  return { nodeId, kind: 'item', item };
}
