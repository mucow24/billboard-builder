import { isCanvasItemNode, isGroupNode, type LayerRow } from '../../document/sceneGraph';

export type LayerRowVisualState =
  | 'default'
  | 'active'
  | 'contains-selection'
  | 'in-selected-group';

export function getVisibleLayerRows(
  rows: LayerRow[],
  collapsedGroupIds: ReadonlySet<string>,
) {
  return rows.filter((row) =>
    row.ancestorGroupIds.every((groupId) => !collapsedGroupIds.has(groupId)),
  );
}

export function getLayerRowVisualState(
  row: LayerRow,
  rows: LayerRow[],
  selectedNodeIds: ReadonlySet<string>,
): LayerRowVisualState {
  if (selectedNodeIds.has(row.selectableNodeId)) {
    return 'active';
  }

  if (
    row.hasChildren &&
    rows.some(
      (candidate) =>
        selectedNodeIds.has(candidate.node.id) &&
        candidate.ancestorGroupIds.includes(row.node.id),
    )
  ) {
    return 'contains-selection';
  }

  if (row.ancestorGroupIds.some((groupId) => selectedNodeIds.has(groupId))) {
    return 'in-selected-group';
  }

  return 'default';
}

export function formatImmediateChildCount(count: number) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

export function getLayersMetaItemCount(rows: LayerRow[]) {
  const itemCount = rows.filter((row) => isCanvasItemNode(row.node)).length;
  return `${itemCount} item${itemCount === 1 ? '' : 's'}`;
}

export type LayerRowConnector = {
  columnHasLine: boolean[];
  isLastChild: boolean;
};

export function computeRowConnectors(visibleRows: LayerRow[]): Map<string, LayerRowConnector> {
  const lastIndexForGroup = new Map<string, number>();
  for (let i = 0; i < visibleRows.length; i++) {
    for (const gId of visibleRows[i].ancestorGroupIds) {
      lastIndexForGroup.set(gId, i);
    }
  }
  const result = new Map<string, LayerRowConnector>();
  for (let i = 0; i < visibleRows.length; i++) {
    const row = visibleRows[i];
    const depth = row.depth;
    const columnHasLine: boolean[] = [];
    for (let k = 0; k < depth - 1; k++) {
      const gk = row.ancestorGroupIds[k];
      const gk1 = row.ancestorGroupIds[k + 1];
      const lastInGk = lastIndexForGroup.get(gk) ?? -1;
      const lastInGk1 = lastIndexForGroup.get(gk1) ?? -1;
      columnHasLine.push(lastInGk > lastInGk1);
    }
    let isLastChild = true;
    if (depth > 0) {
      const parentId = row.ancestorGroupIds[depth - 1];
      const lastInParent = lastIndexForGroup.get(parentId) ?? -1;
      const lastInRow = lastIndexForGroup.get(row.node.id) ?? i;
      isLastChild = lastInParent === lastInRow;
    }
    result.set(row.node.id, { columnHasLine, isLastChild });
  }
  return result;
}

// ── Drag-and-drop helpers ──────────────────────────────────────────────────

const GRIP_WIDTH_PX = 12;
const DEPTH_INDENT_PX = 24;

/**
 * At a gap between two visible rows, determine which tree depth the drop
 * should target. Non-ambiguous gaps have a single valid answer. Ambiguous
 * gaps (where depth decreases from rowAbove to rowBelow) use the cursor's
 * horizontal position to choose between valid depths.
 */
export function resolveDropDepth(
  rowAboveDepth: number,
  rowBelowDepth: number | null,
  relativeX: number,
): number {
  const minDepth = rowBelowDepth ?? 0;
  const maxDepth = rowAboveDepth;

  if (minDepth >= maxDepth) {
    // Non-ambiguous: same depth or depth increases downward
    return rowBelowDepth ?? rowAboveDepth;
  }

  // Ambiguous: depth decreases. Use horizontal position to pick.
  const depthRange = maxDepth - minDepth;
  const indentStart = GRIP_WIDTH_PX + minDepth * DEPTH_INDENT_PX;
  const normalizedX = Math.max(0, relativeX - indentStart);
  const depthOffset = Math.min(depthRange, Math.floor(normalizedX / DEPTH_INDENT_PX));
  return minDepth + depthOffset;
}

export interface LayerMoveTarget {
  nodeId: string;
  targetParentId: string | null;
  targetChildrenIndex: number;
}

/**
 * Given the visible rows, a drag source visual index, a drop gap index, and the
 * resolved depth, compute the move target (node ID, target parent, children-array
 * index). Returns null for no-ops or invalid moves (e.g., self-nesting).
 *
 * The drop gap index `g` means "between visual row g-1 and visual row g"
 * (or before row 0 if g=0, or after the last row if g=rows.length).
 *
 * The dragged row is logically excluded from gap computation by skipping it.
 */
/**
 * Given the visible rows, a drag source visual index, a drop gap index, and the
 * resolved depth, compute the move target (node ID, target parent, children-array
 * index). Returns null for no-ops or invalid moves (e.g., self-nesting).
 *
 * The drop gap index `g` means "before visual row g" (g=0 means before first row,
 * g=rows.length means after the last row).
 *
 * The target children index is relative to the parent's children array AFTER the
 * dragged node has been removed (matching moveNode's same-parent splice semantics
 * and cross-parent insert semantics).
 */
export function computeLayerMoveTarget(
  visibleRows: LayerRow[],
  dragVisualIndex: number,
  dropGapIndex: number,
  resolvedDepth: number,
): LayerMoveTarget | null {
  const draggedRow = visibleRows[dragVisualIndex];
  if (!draggedRow) return null;
  const nodeId = draggedRow.node.id;

  // Build the "effective" row list without the dragged row
  const effectiveRows = visibleRows.filter((_, i) => i !== dragVisualIndex);
  const effectiveGap = dropGapIndex > dragVisualIndex ? dropGapIndex - 1 : dropGapIndex;

  // Determine the target parent based on the resolved depth and surrounding rows
  const rowAbove = effectiveGap > 0 ? effectiveRows[effectiveGap - 1] : null;
  const rowBelow = effectiveGap < effectiveRows.length ? effectiveRows[effectiveGap] : null;
  // Pick a reference row — prefer rowAbove, fall back to rowBelow
  const refRow = rowAbove ?? rowBelow;

  let targetParentId: string | null = null;

  if (resolvedDepth === 0) {
    targetParentId = null;
  } else if (refRow) {
    if (refRow.depth >= resolvedDepth) {
      // Reference row is at or deeper — parent is in its ancestor chain
      targetParentId = refRow.ancestorGroupIds[resolvedDepth - 1] ?? null;
    } else if (refRow === rowAbove && refRow.depth === resolvedDepth - 1 && isGroupNode(refRow.node)) {
      // rowAbove is the group header we're dropping into
      targetParentId = refRow.node.id;
    }
  }

  // Validate: prevent self-nesting
  if (targetParentId !== null && isGroupNode(draggedRow.node)) {
    if (targetParentId === nodeId) return null;
    const targetParentRow = visibleRows.find((r) => r.node.id === targetParentId);
    if (targetParentRow && targetParentRow.ancestorGroupIds.includes(nodeId)) {
      return null;
    }
  }

  const currentParentId = draggedRow.ancestorGroupIds.length > 0
    ? draggedRow.ancestorGroupIds[draggedRow.ancestorGroupIds.length - 1]
    : null;

  // Helper: get the immediate parent ID for a row
  const getRowParentId = (r: LayerRow) =>
    r.ancestorGroupIds.length > 0
      ? r.ancestorGroupIds[r.ancestorGroupIds.length - 1]
      : null;

  // Count visual siblings of the target parent that appear before the effective gap.
  // This tells us the insertion position in visual order.
  let visualSiblingsBefore = 0;
  for (let i = 0; i < effectiveGap; i++) {
    const r = effectiveRows[i];
    if (getRowParentId(r) === targetParentId && r.depth === resolvedDepth) {
      visualSiblingsBefore++;
    }
  }

  // Count total visual siblings in the target parent (excluding dragged node)
  let totalVisualSiblings = 0;
  for (const r of effectiveRows) {
    if (getRowParentId(r) === targetParentId && r.depth === resolvedDepth) {
      totalVisualSiblings++;
    }
  }

  // Convert visual position to data children index.
  // Visual is front-to-back (reversed from data order).
  // After removing dragged node, totalVisualSiblings = existing children count.
  // Visual gap g among N visual siblings → data index = N - g.
  const targetChildrenIndex = totalVisualSiblings - visualSiblingsBefore;

  // No-op detection for same-parent moves
  if (currentParentId === targetParentId) {
    let currentVisualSiblingsBefore = 0;
    for (let i = 0; i < dragVisualIndex; i++) {
      const r = visibleRows[i];
      if (getRowParentId(r) === currentParentId && r.depth === draggedRow.depth) {
        currentVisualSiblingsBefore++;
      }
    }
    if (visualSiblingsBefore === currentVisualSiblingsBefore) return null;
  }

  return { nodeId, targetParentId, targetChildrenIndex };
}
