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
