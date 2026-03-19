import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from './documentDefaults';
import {
  canGroupNodes,
  canUngroupNode,
  cloneCanvasNode,
  collectLeafItems,
  flattenLayerRows,
  flattenVisibleLeafNodes,
  getNodeEntry,
  groupNodes,
  normalizeLeafZIndices,
  ungroupNode,
} from './sceneGraph';

describe('scene graph helpers', () => {
  it('flattens visible leaves with accumulated opacity and selectable group ids', () => {
    const first = createRectangleItem({ opacity: 0.5 });
    const second = createTextItem({ opacity: 0.6 });
    const group = createGroupNode([first, second]);
    group.id = 'group-1';
    group.opacity = 0.4;

    const flattened = flattenVisibleLeafNodes([group]);

    expect(flattened).toHaveLength(2);
    expect(flattened[0]).toMatchObject({
      selectableNodeId: 'group-1',
      effectiveOpacity: 0.2,
    });
    expect(flattened[1]).toMatchObject({
      selectableNodeId: 'group-1',
      effectiveOpacity: 0.24,
    });
  });

  it('builds minimal layer rows with child rows marked non-selectable under groups', () => {
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child]);
    group.id = 'group-1';

    expect(flattenLayerRows([group])).toEqual([
      expect.objectContaining({ depth: 0, isSelectable: true, selectableNodeId: 'group-1' }),
      expect.objectContaining({ depth: 1, isSelectable: false, selectableNodeId: 'group-1' }),
    ]);
  });

  it('groups sibling nodes under a new group and ungroups them in place', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const nodes = [first, second];

    expect(canGroupNodes(nodes, [first.id, second.id])).toBe(true);
    const grouped = groupNodes(nodes, [first.id, second.id]);
    expect(grouped).not.toBeNull();
    if (!grouped) {
      throw new Error('Expected grouped nodes.');
    }
    expect(grouped.nextNodes).toHaveLength(1);
    expect(grouped.nextNodes[0]).toMatchObject({ kind: 'group' });
    expect(canUngroupNode(grouped.nextNodes, grouped.groupId)).toBe(true);

    const ungrouped = ungroupNode(grouped.nextNodes, grouped.groupId);
    expect(ungrouped).not.toBeNull();
    expect(ungrouped?.nextNodes.map((node) => node.id)).toEqual([first.id, second.id]);
    expect(ungrouped?.childIds).toEqual([first.id, second.id]);
  });

  it('rejects grouping mixed-parent selections', () => {
    const nested = createGroupNode([createRectangleItem({ id: 'nested-child' })]);
    nested.id = 'nested-group';
    const sibling = createRectangleItem({ id: 'sibling' });
    const root = createGroupNode([nested, sibling]);

    expect(canGroupNodes([root], ['nested-child', 'sibling'])).toBe(false);
  });

  it('clones recursive subtrees with fresh ids', () => {
    const child = createRectangleItem({ id: 'child' });
    const group = createGroupNode([child]);
    group.id = 'group';

    const clone = cloneCanvasNode(group);

    expect(clone.id).not.toBe(group.id);
    if (clone.kind !== 'group') {
      throw new Error('Expected cloned group.');
    }
    expect(clone.children[0]?.id).not.toBe(child.id);
  });

  it('normalizes derived leaf z-indices in traversal order', () => {
    const first = createRectangleItem({ id: 'first', zIndex: 10 });
    const second = createTextItem({ id: 'second', zIndex: 20 });
    const nodes = normalizeLeafZIndices([createGroupNode([first]), second]);

    const flattened = collectLeafItems(nodes[0]!).concat(nodes[1]!.kind === 'group' ? [] : [nodes[1]!]);
    expect(flattened.map((item) => item.zIndex)).toEqual([0, 1]);
  });

  it('returns ancestry information for recursive nodes', () => {
    const child = createRectangleItem({ id: 'child' });
    const group = createGroupNode([child]);
    group.id = 'group';

    const entry = getNodeEntry([group], child.id);

    expect(entry).toMatchObject({
      index: 0,
      parent: expect.objectContaining({ id: 'group' }),
    });
    expect(entry?.ancestors.map((ancestor) => ancestor.id)).toEqual(['group']);
  });
});
