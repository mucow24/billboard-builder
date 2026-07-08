import { DUPLICATE_ITEM_OFFSET } from './documentDefaults';

import type {
  CanvasItem,
  CanvasNode,
  GroupNode,
  ReorderMode,
} from './documentTypes';

export interface FlattenedLeafNode {
  item: CanvasItem;
  effectiveOpacity: number;
  selectableNodeId: string;
  groupPath: string[];
}

export interface LayerRow {
  ancestorGroupIds: string[];
  immediateChildCount: number;
  depth: number;
  hasChildren: boolean;
  isSelectable: boolean;
  node: CanvasNode;
  selectableNodeId: string;
}

export interface NodeEntry {
  ancestors: GroupNode[];
  index: number;
  node: CanvasNode;
  parent: GroupNode | null;
}

export function isGroupNode(node: CanvasNode): node is GroupNode {
  return node.kind === 'group';
}

export function isCanvasItemNode(node: CanvasNode): node is CanvasItem {
  return node.kind !== 'group';
}

export const DEFAULT_GROUP_NAME = 'Group';

export function createGroupNode(children: CanvasNode[] = [], name = DEFAULT_GROUP_NAME): GroupNode {
  return {
    id: crypto.randomUUID(),
    kind: 'group',
    name,
    locked: false,
    hidden: false,
    opacity: 1,
    children,
  };
}

export function visitNodes(
  nodes: CanvasNode[],
  visitor: (node: CanvasNode, parent: GroupNode | null, depth: number) => void,
  parent: GroupNode | null = null,
  depth = 0
) {
  for (const node of nodes) {
    visitor(node, parent, depth);
    if (isGroupNode(node)) {
      visitNodes(node.children, visitor, node, depth + 1);
    }
  }
}

export function getNodeEntry(nodes: CanvasNode[], nodeId: string): NodeEntry | null {
  function visit(
    currentNodes: CanvasNode[],
    parent: GroupNode | null,
    ancestors: GroupNode[]
  ): NodeEntry | null {
    for (const [index, node] of currentNodes.entries()) {
      if (node.id === nodeId) {
        return { node, parent, ancestors, index };
      }
      if (isGroupNode(node)) {
        const result = visit(node.children, node, [...ancestors, node]);
        if (result) {
          return result;
        }
      }
    }
    return null;
  }

  return visit(nodes, null, []);
}

export function getNodeById(nodes: CanvasNode[], nodeId: string): CanvasNode | undefined {
  return getNodeEntry(nodes, nodeId)?.node;
}

export function getParentNodeId(nodes: CanvasNode[], nodeId: string): string | null {
  return getNodeEntry(nodes, nodeId)?.parent?.id ?? null;
}

export function getNodeIds(nodes: CanvasNode[]): string[] {
  const ids: string[] = [];
  visitNodes(nodes, (node) => {
    ids.push(node.id);
  });
  return ids;
}

export function flattenVisibleLeafNodes(
  nodes: CanvasNode[],
  parentOpacity = 1,
  selectableGroupId?: string,
  groupPath: string[] = []
): FlattenedLeafNode[] {
  const flattened: FlattenedLeafNode[] = [];

  for (const node of nodes) {
    if (isGroupNode(node)) {
      if (node.hidden) continue;
      flattened.push(
        ...flattenVisibleLeafNodes(
          node.children,
          parentOpacity * node.opacity,
          selectableGroupId ?? node.id,
          [...groupPath, node.id]
        )
      );
      continue;
    }
    if (node.hidden) {
      continue;
    }
    flattened.push({
      item: node,
      effectiveOpacity: parentOpacity * node.opacity,
      selectableNodeId: selectableGroupId ?? node.id,
      groupPath,
    });
  }

  return flattened;
}

export function flattenLayerRows(
  nodes: CanvasNode[],
  depth = 0,
  ancestorGroupIds: string[] = []
): LayerRow[] {
  const rows: LayerRow[] = [];

  // Layers UI shows the top-most sibling first, even though document order is back-to-front.
  for (const node of nodes.slice().reverse()) {
    rows.push({
      ancestorGroupIds,
      immediateChildCount: isGroupNode(node) ? node.children.length : 0,
      depth,
      hasChildren: isGroupNode(node) && node.children.length > 0,
      isSelectable: true,
      node,
      selectableNodeId: node.id,
    });
    if (isGroupNode(node)) {
      rows.push(...flattenLayerRows(node.children, depth + 1, [...ancestorGroupIds, node.id]));
    }
  }

  return rows;
}

export function collectLeafItems(node: CanvasNode): CanvasItem[] {
  if (isCanvasItemNode(node)) {
    return [node];
  }
  return node.children.flatMap(collectLeafItems);
}

export function cloneCanvasNode(node: CanvasNode, offset = DUPLICATE_ITEM_OFFSET): CanvasNode {
  if (isGroupNode(node)) {
    return {
      ...node,
      id: crypto.randomUUID(),
      children: node.children.map((child) => cloneCanvasNode(child, offset)),
    };
  }

  const nextId = crypto.randomUUID();
  if (node.kind === 'polygon') {
    return {
      ...node,
      id: nextId,
      x: node.x + offset,
      y: node.y + offset,
      vertices: node.vertices.map((v) => ({ x: v.x + offset, y: v.y + offset })),
    };
  }
  if (node.kind === 'line') {
    return {
      ...node,
      id: nextId,
      x: node.x + offset,
      y: node.y + offset,
      startX: node.startX + offset,
      startY: node.startY + offset,
      endX: node.endX + offset,
      endY: node.endY + offset,
    };
  }

  return {
    ...node,
    id: nextId,
    x: node.x + offset,
    y: node.y + offset,
  };
}

export function normalizeLeafZIndices(nodes: CanvasNode[]): CanvasNode[] {
  let nextZIndex = 0;

  function assign(node: CanvasNode): CanvasNode {
    if (isGroupNode(node)) {
      return {
        ...node,
        children: node.children.map(assign),
      };
    }
    return {
      ...node,
      zIndex: nextZIndex++,
    };
  }

  return nodes.map(assign);
}

export function updateGeneratorItemSizes(
  nodes: CanvasNode[],
  width: number,
  height: number,
): CanvasNode[] {
  function update(node: CanvasNode): CanvasNode {
    if (isGroupNode(node)) {
      return { ...node, children: node.children.map(update) };
    }
    if (node.kind === 'generator') {
      return { ...node, width, height };
    }
    return node;
  }
  return nodes.map(update);
}

export function updateItemNode(
  nodes: CanvasNode[],
  itemId: string,
  changes: Partial<CanvasItem>
): CanvasNode[] {
  return nodes.map((node) => {
    if (isGroupNode(node)) {
      return {
        ...node,
        children: updateItemNode(node.children, itemId, changes),
      };
    }
    return node.id === itemId ? ({ ...node, ...changes } as CanvasItem) : node;
  });
}

export function updateGroupNode(
  nodes: CanvasNode[],
  groupId: string,
  changes: Partial<Pick<GroupNode, 'name' | 'opacity' | 'locked' | 'hidden'>>
): CanvasNode[] {
  return nodes.map((node) => {
    if (!isGroupNode(node)) {
      return node;
    }
    if (node.id === groupId) {
      return {
        ...node,
        ...changes,
      };
    }
    return {
      ...node,
      children: updateGroupNode(node.children, groupId, changes),
    };
  });
}

export function insertNodesAt(
  nodes: CanvasNode[],
  insertedNodes: CanvasNode[],
  parentId: string | null,
  index?: number
): CanvasNode[] {
  return updateChildren(nodes, parentId, (children) => {
    const nextChildren = children.slice();
    const insertionIndex = index === undefined ? nextChildren.length : Math.max(0, Math.min(index, nextChildren.length));
    nextChildren.splice(insertionIndex, 0, ...insertedNodes);
    return nextChildren;
  });
}

export function removeNodesByIds(nodes: CanvasNode[], nodeIds: Set<string>): CanvasNode[] {
  const nextNodes: CanvasNode[] = [];

  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      continue;
    }

    if (!isGroupNode(node)) {
      nextNodes.push(node);
      continue;
    }

    const nextChildren = removeNodesByIds(node.children, nodeIds);
    if (nextChildren.length === 0) {
      continue;
    }
    if (nextChildren.length === 1) {
      nextNodes.push(nextChildren[0]);
      continue;
    }

    nextNodes.push({
      ...node,
      children: nextChildren,
    });
  }

  return nextNodes;
}

/**
 * Find a specific group by ID and dissolve it if it has fewer than 2 children.
 * 0 children → remove the group. 1 child → promote the child in place.
 * Cascades upward: if dissolving the group leaves its own parent deficient,
 * that parent is dissolved too.
 */
function dissolveGroupIfDeficient(nodes: CanvasNode[], groupId: string): CanvasNode[] {
  const result: CanvasNode[] = [];
  for (const node of nodes) {
    if (!isGroupNode(node)) {
      result.push(node);
      continue;
    }
    if (node.id === groupId) {
      if (node.children.length === 0) continue; // remove empty group
      if (node.children.length === 1) {
        result.push(node.children[0]); // promote sole child
        continue;
      }
      result.push(node); // group is fine
      continue;
    }
    // Recurse into other groups to find the target
    const nextChildren = dissolveGroupIfDeficient(node.children, groupId);
    // After dissolving the target inside this group, check if THIS group is now deficient
    if (nextChildren.length === 0) continue;
    if (nextChildren.length === 1) {
      result.push(nextChildren[0]);
      continue;
    }
    result.push({ ...node, children: nextChildren });
  }
  return result;
}

export function getSelectionParentInfo(nodes: CanvasNode[], nodeIds: string[]) {
  const entries = nodeIds.map((nodeId) => getNodeEntry(nodes, nodeId));
  if (entries.some((entry) => !entry)) {
    return null;
  }
  const resolvedEntries = entries as NodeEntry[];
  const parentId = resolvedEntries[0].parent?.id ?? null;
  if (resolvedEntries.some((entry) => (entry.parent?.id ?? null) !== parentId)) {
    return null;
  }
  return {
    parentId,
    entries: resolvedEntries,
  };
}

function updateChildren(
  nodes: CanvasNode[],
  parentId: string | null,
  updater: (children: CanvasNode[]) => CanvasNode[]
): CanvasNode[] {
  if (parentId === null) {
    return updater(nodes);
  }
  return nodes.map((node) => {
    if (!isGroupNode(node)) {
      return node;
    }
    if (node.id === parentId) {
      return {
        ...node,
        children: updater(node.children),
      };
    }
    return {
      ...node,
      children: updateChildren(node.children, parentId, updater),
    };
  });
}

export function canGroupNodes(nodes: CanvasNode[], nodeIds: string[]): boolean {
  if (nodeIds.length < 2) {
    return false;
  }
  return Boolean(getSelectionParentInfo(nodes, nodeIds));
}

export function groupNodes(
  nodes: CanvasNode[],
  nodeIds: string[],
  groupName = DEFAULT_GROUP_NAME
): { nextNodes: CanvasNode[]; groupId: string } | null {
  const groupingParentInfo = getSelectionParentInfo(nodes, nodeIds);
  if (!groupingParentInfo) {
    return null;
  }

  const selectedIds = new Set(nodeIds);
  const group = createGroupNode([], groupName);
  const firstIndex = Math.min(...groupingParentInfo.entries.map((entry) => entry.index));

  const nextNodes = updateChildren(nodes, groupingParentInfo.parentId, (children) => {
    const selectedChildren = children.filter((child) => selectedIds.has(child.id));
    const retainedChildren = children.filter((child) => !selectedIds.has(child.id));
    const nextChildren = retainedChildren.slice();
    nextChildren.splice(firstIndex, 0, {
      ...group,
      children: selectedChildren,
    });
    return nextChildren;
  });

  return {
    nextNodes,
    groupId: group.id,
  };
}

export function canUngroupNode(nodes: CanvasNode[], groupId: string): boolean {
  const node = getNodeById(nodes, groupId);
  return Boolean(node && isGroupNode(node));
}

export function ungroupNode(
  nodes: CanvasNode[],
  groupId: string
): { nextNodes: CanvasNode[]; childIds: string[] } | null {
  const entry = getNodeEntry(nodes, groupId);
  if (!entry || !isGroupNode(entry.node)) {
    return null;
  }
  const groupNode = entry.node;
  const childIds = groupNode.children.map((child) => child.id);
  const nextNodes = updateChildren(nodes, entry.parent?.id ?? null, (children) => {
    const nextChildren = children.slice();
    nextChildren.splice(entry.index, 1, ...groupNode.children);
    return nextChildren;
  });
  return { nextNodes, childIds };
}

function reorderChildren(children: CanvasNode[], nodeIds: Set<string>, mode: ReorderMode): CanvasNode[] {
  const selectedChildren = children.filter((child) => nodeIds.has(child.id));
  const unselectedChildren = children.filter((child) => !nodeIds.has(child.id));
  if (selectedChildren.length === 0) {
    return children;
  }
  if (mode === 'front') {
    return [...unselectedChildren, ...selectedChildren];
  }
  if (mode === 'back') {
    return [...selectedChildren, ...unselectedChildren];
  }

  const currentIndices = children
    .map((child, index) => (nodeIds.has(child.id) ? index : -1))
    .filter((index) => index >= 0);
  const boundaryIndex = mode === 'forward' ? Math.max(...currentIndices) : Math.min(...currentIndices);
  const nextChildren = children.slice();
  const movingChild = mode === 'forward'
    ? nextChildren.splice(boundaryIndex, 1)[0]
    : nextChildren.splice(boundaryIndex, 1)[0];
  if (!movingChild) {
    return children;
  }
  const insertIndex = mode === 'forward' ? Math.min(nextChildren.length, boundaryIndex + 1) : Math.max(0, boundaryIndex - 1);
  nextChildren.splice(insertIndex, 0, movingChild);
  return nextChildren;
}

export function canReorderNodes(nodes: CanvasNode[], nodeIds: string[]): boolean {
  if (nodeIds.length === 0) {
    return false;
  }
  return Boolean(getSelectionParentInfo(nodes, nodeIds));
}

export function reorderNodes(
  nodes: CanvasNode[],
  nodeIds: string[],
  mode: ReorderMode
): CanvasNode[] {
  const groupingParentInfo = getSelectionParentInfo(nodes, nodeIds);
  if (!groupingParentInfo) {
    return nodes;
  }
  return updateChildren(nodes, groupingParentInfo.parentId, (children) =>
    reorderChildren(children, new Set(nodeIds), mode)
  );
}

export function moveNode(
  nodes: CanvasNode[],
  nodeId: string,
  targetParentId: string | null,
  targetIndex: number,
): CanvasNode[] {
  const entry = getNodeEntry(nodes, nodeId);
  if (!entry) {
    return nodes;
  }

  // Prevent moving a group into itself or its own descendant
  if (targetParentId !== null) {
    if (targetParentId === nodeId) {
      return nodes;
    }
    const targetEntry = getNodeEntry(nodes, targetParentId);
    if (targetEntry && targetEntry.ancestors.some((a) => a.id === nodeId)) {
      return nodes;
    }
  }

  const sourceParentId = entry.parent?.id ?? null;

  if (sourceParentId === targetParentId) {
    // Same-parent move: splice within the children array
    return updateChildren(nodes, sourceParentId, (children) => {
      const fromIndex = children.findIndex((c) => c.id === nodeId);
      if (fromIndex === -1) return children;
      const clampedTarget = Math.max(0, Math.min(targetIndex, children.length - 1));
      if (fromIndex === clampedTarget) return children;
      const next = children.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(clampedTarget, 0, moved);
      return next;
    });
  }

  // Cross-parent move: remove from source, insert at target
  let result = updateChildren(nodes, sourceParentId, (children) =>
    children.filter((c) => c.id !== nodeId),
  );

  // Dissolve source group if it now has fewer than 2 children
  if (sourceParentId !== null) {
    result = dissolveGroupIfDeficient(result, sourceParentId);
  }

  // Insert at target parent
  result = insertNodesAt(result, [entry.node], targetParentId, targetIndex);

  return result;
}

export function collectSelectableNodeIds(nodes: CanvasNode[]): string[] {
  return nodes.filter((node) => isGroupNode(node) || !node.hidden).map((node) => node.id);
}

export function getNextDrilldownNodeId(
  nodes: CanvasNode[],
  currentNodeId: string,
  leafNodeId: string
): string | null {
  const currentEntry = getNodeEntry(nodes, currentNodeId);
  const leafEntry = getNodeEntry(nodes, leafNodeId);
  if (!currentEntry || !leafEntry || !isCanvasItemNode(leafEntry.node)) {
    return null;
  }
  if (currentNodeId === leafNodeId) {
    return leafNodeId;
  }
  const ancestorIds = leafEntry.ancestors.map((ancestor) => ancestor.id);
  const currentAncestorIndex = ancestorIds.indexOf(currentNodeId);
  if (currentAncestorIndex === -1) {
    return null;
  }
  return ancestorIds[currentAncestorIndex + 1] ?? leafNodeId;
}
