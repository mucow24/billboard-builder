export function toggleSelectionNode(selectedNodeIds: string[], nodeId: string): string[] {
  return selectedNodeIds.includes(nodeId)
    ? selectedNodeIds.filter((id) => id !== nodeId)
    : [...selectedNodeIds, nodeId];
}

export function toggleSelectionNodes(selectedNodeIds: string[], nodeIds: string[]): string[] {
  const toggled = new Set(nodeIds);
  const retained = selectedNodeIds.filter((id) => !toggled.has(id));
  const appended = nodeIds.filter((id) => !selectedNodeIds.includes(id));
  return [...retained, ...appended];
}

export function normalizeSelectionForNodes(selectedNodeIds: string[], nodes: ReadonlyArray<{ id: string }>): string[] {
  const selectableIds = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  return selectedNodeIds.filter((id) => {
    if (!selectableIds.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

export function selectAllNodes(nodes: ReadonlyArray<{ id: string; locked?: boolean }>): string[] {
  return nodes.filter((node) => !node.locked).map((node) => node.id);
}
