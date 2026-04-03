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
  getNextDrilldownNodeId,
  getParentNodeId,
  groupNodes,
  moveNode,
  normalizeLeafZIndices,
  removeNodesByIds,
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

  it('builds layer rows in front-to-back display order with ancestor metadata', () => {
    const backChild = createRectangleItem({ id: 'child-back', zIndex: 0 });
    const frontChild = createTextItem({ id: 'child-front', zIndex: 1 });
    const group = createGroupNode([backChild, frontChild]);
    group.id = 'group-1';

    expect(flattenLayerRows([group])).toEqual([
      expect.objectContaining({
        depth: 0,
        isSelectable: true,
        selectableNodeId: 'group-1',
        ancestorGroupIds: [],
        immediateChildCount: 2,
        hasChildren: true,
      }),
      expect.objectContaining({
        depth: 1,
        isSelectable: true,
        selectableNodeId: 'child-front',
        ancestorGroupIds: ['group-1'],
        immediateChildCount: 0,
        hasChildren: false,
      }),
      expect.objectContaining({
        depth: 1,
        isSelectable: true,
        selectableNodeId: 'child-back',
        ancestorGroupIds: ['group-1'],
        immediateChildCount: 0,
        hasChildren: false,
      }),
    ]);
  });

  it('tracks immediate child counts for groups instead of descendant leaf counts', () => {
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf', zIndex: 0 });
    const nestedGroup = createGroupNode([nestedLeaf], 'Nested Group');
    nestedGroup.id = 'nested-group';
    const siblingLeaf = createTextItem({ id: 'sibling-leaf', zIndex: 1 });
    const group = createGroupNode([nestedGroup, siblingLeaf], 'Outer Group');
    group.id = 'outer-group';

    expect(flattenLayerRows([group])).toEqual([
      expect.objectContaining({
        selectableNodeId: 'outer-group',
        immediateChildCount: 2,
      }),
      expect.objectContaining({
        selectableNodeId: 'sibling-leaf',
        immediateChildCount: 0,
      }),
      expect.objectContaining({
        selectableNodeId: 'nested-group',
        immediateChildCount: 1,
      }),
      expect.objectContaining({
        selectableNodeId: 'nested-leaf',
        immediateChildCount: 0,
      }),
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

  it('creates groups with locked and hidden defaulting to false', () => {
    const group = createGroupNode([]);
    expect(group.locked).toBe(false);
    expect(group.hidden).toBe(false);
  });

  it('excludes all children of a hidden group from visible leaf nodes', () => {
    const child = createRectangleItem({ opacity: 1 });
    const group = createGroupNode([child]);
    group.hidden = true;

    expect(flattenVisibleLeafNodes([group])).toHaveLength(0);
  });

  it('resolves the parent group and next drilldown target for nested selections', () => {
    const leaf = createRectangleItem({ id: 'leaf' });
    const innerGroup = createGroupNode([leaf], 'Inner');
    innerGroup.id = 'inner-group';
    const outerGroup = createGroupNode([innerGroup], 'Outer');
    outerGroup.id = 'outer-group';

    expect(getParentNodeId([outerGroup], leaf.id)).toBe(innerGroup.id);
    expect(getParentNodeId([outerGroup], innerGroup.id)).toBe(outerGroup.id);
    expect(getNextDrilldownNodeId([outerGroup], outerGroup.id, leaf.id)).toBe(innerGroup.id);
    expect(getNextDrilldownNodeId([outerGroup], innerGroup.id, leaf.id)).toBe(leaf.id);
  });

  it('ungroups a surviving child in place when delete leaves a group with one child', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const sibling = createRectangleItem({ id: 'sibling' });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';

    const nextNodes = removeNodesByIds([group, sibling], new Set([first.id]));

    expect(nextNodes.map((node) => node.id)).toEqual([second.id, sibling.id]);
    expect(nextNodes[0]?.kind).toBe('text');
  });

  it('removes a group entirely when delete removes all of its children', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const sibling = createRectangleItem({ id: 'sibling' });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';

    const nextNodes = removeNodesByIds([group, sibling], new Set([first.id, second.id]));

    expect(nextNodes.map((node) => node.id)).toEqual([sibling.id]);
  });

  it('cascades group collapse upward after nested child deletion', () => {
    const leaf = createRectangleItem({ id: 'leaf' });
    const cousin = createTextItem({ id: 'cousin' });
    const nestedGroup = createGroupNode([leaf], 'Nested Group');
    nestedGroup.id = 'nested-group';
    const outerGroup = createGroupNode([nestedGroup, cousin], 'Outer Group');
    outerGroup.id = 'outer-group';

    const nextNodes = removeNodesByIds([outerGroup], new Set([cousin.id]));

    expect(nextNodes.map((node) => node.id)).toEqual([leaf.id]);
    expect(nextNodes[0]?.kind).toBe('rectangle');
  });

  it('leaves valid groups intact when delete touches an unrelated sibling', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const unrelated = createRectangleItem({ id: 'unrelated' });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';

    const nextNodes = removeNodesByIds([group, unrelated], new Set([unrelated.id]));

    expect(nextNodes).toHaveLength(1);
    expect(nextNodes[0]).toMatchObject({
      id: group.id,
      kind: 'group',
    });
    if (nextNodes[0]?.kind !== 'group') {
      throw new Error('Expected surviving group.');
    }
    expect(nextNodes[0].children.map((node) => node.id)).toEqual([first.id, second.id]);
  });

  it('moves a root node to a different position among root siblings', () => {
    const a = createRectangleItem({ id: 'a' });
    const b = createRectangleItem({ id: 'b' });
    const c = createRectangleItem({ id: 'c' });

    const result = moveNode([a, b, c], 'a', null, 2);
    expect(result.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns nodes unchanged when target matches current position', () => {
    const a = createRectangleItem({ id: 'a' });
    const b = createRectangleItem({ id: 'b' });
    const nodes = [a, b];

    const result = moveNode(nodes, 'a', null, 0);
    expect(result.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('moves a node from root into a group at a specific index', () => {
    const child = createRectangleItem({ id: 'child' });
    const group = createGroupNode([child], 'Group');
    group.id = 'group-1';
    const outsider = createRectangleItem({ id: 'outsider' });

    const result = moveNode([group, outsider], 'outsider', 'group-1', 0);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('group-1');
    if (result[0]!.kind !== 'group') throw new Error('Expected group');
    expect(result[0]!.children.map((n) => n.id)).toEqual(['outsider', 'child']);
  });

  it('moves a node out of a group to root level', () => {
    const child1 = createRectangleItem({ id: 'child1' });
    const child2 = createRectangleItem({ id: 'child2' });
    const group = createGroupNode([child1, child2], 'Group');
    group.id = 'group-1';
    const sibling = createRectangleItem({ id: 'sibling' });

    const result = moveNode([group, sibling], 'child1', null, 2);

    expect(result.map((n) => n.id)).toEqual(['group-1', 'sibling', 'child1']);
    if (result[0]!.kind !== 'group') throw new Error('Expected group');
    expect(result[0]!.children.map((n) => n.id)).toEqual(['child2']);
  });

  it('moves a node between two different groups', () => {
    const childA = createRectangleItem({ id: 'childA' });
    const childB = createRectangleItem({ id: 'childB' });
    const groupA = createGroupNode([childA], 'Group A');
    groupA.id = 'groupA';
    const groupB = createGroupNode([childB], 'Group B');
    groupB.id = 'groupB';

    const result = moveNode([groupA, groupB], 'childA', 'groupB', 0);

    if (result[0]!.kind !== 'group') throw new Error('Expected group');
    if (result[1]!.kind !== 'group') throw new Error('Expected group');
    expect(result[0]!.children).toHaveLength(0);
    expect(result[1]!.children.map((n) => n.id)).toEqual(['childA', 'childB']);
  });

  it('clamps out-of-range target index for moveNode', () => {
    const a = createRectangleItem({ id: 'a' });
    const b = createRectangleItem({ id: 'b' });

    const result = moveNode([a, b], 'a', null, 99);
    expect(result.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('rejects moving a group into itself or its own descendant', () => {
    const child = createRectangleItem({ id: 'child' });
    const inner = createGroupNode([child], 'Inner');
    inner.id = 'inner';
    const outer = createGroupNode([inner], 'Outer');
    outer.id = 'outer';

    // Move outer into itself
    const result1 = moveNode([outer], 'outer', 'outer', 0);
    expect(result1.map((n) => n.id)).toEqual(['outer']);

    // Move outer into its own descendant (inner)
    const result2 = moveNode([outer], 'outer', 'inner', 0);
    expect(result2.map((n) => n.id)).toEqual(['outer']);
  });
});
