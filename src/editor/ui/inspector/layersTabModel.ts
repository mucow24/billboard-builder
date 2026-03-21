import { isCanvasItemNode, type LayerRow } from '../../document/sceneGraph';

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
