import { describe, expect, it } from 'vitest';

import { createGroupNode, createRectangleItem, createTextItem } from '../../document/documentDefaults';
import { flattenLayerRows } from '../../document/sceneGraph';

import { computeTreeGuides } from './layerTreeGuides';

describe('computeTreeGuides', () => {
  it('returns empty guides for root-level rows', () => {
    const rect = createRectangleItem({ id: 'rect' });
    const text = createTextItem({ id: 'text' });
    const rows = flattenLayerRows([rect, text]);
    const guides = computeTreeGuides(rows);

    expect(guides.get('rect')).toEqual([]);
    expect(guides.get('text')).toEqual([]);
  });

  it('assigns branch to children and branch-last to the final child', () => {
    const child1 = createRectangleItem({ id: 'child1' });
    const child2 = createTextItem({ id: 'child2' });
    const child3 = createRectangleItem({ id: 'child3' });
    const group = createGroupNode([child1, child2, child3], 'Group');
    group.id = 'group';

    const rows = flattenLayerRows([group]);
    const guides = computeTreeGuides(rows);

    // flattenLayerRows reverses children (top-most first in layers UI)
    // So display order is: child3, child2, child1
    expect(guides.get('group')).toEqual([]);
    expect(guides.get('child3')).toEqual(['branch']);
    expect(guides.get('child2')).toEqual(['branch']);
    expect(guides.get('child1')).toEqual(['branch-last']);
  });

  it('computes pipe and empty for nested groups', () => {
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Inner');
    nestedGroup.id = 'nested-group';
    const siblingLeaf = createTextItem({ id: 'sibling-leaf' });
    // Document order: [nestedGroup, siblingLeaf]
    // Display order (reversed): siblingLeaf, nestedGroup
    const rootGroup = createGroupNode([nestedGroup, siblingLeaf], 'Outer');
    rootGroup.id = 'root-group';

    const rows = flattenLayerRows([rootGroup]);
    const guides = computeTreeGuides(rows);

    // root-group: depth 0
    expect(guides.get('root-group')).toEqual([]);
    // Display order: siblingLeaf (depth 1), nestedGroup (depth 1), nestedLeaf (depth 2)
    // siblingLeaf: depth 1, has a sibling below (nestedGroup)
    expect(guides.get('sibling-leaf')).toEqual(['branch']);
    // nested-group: depth 1, last child of root-group in display order
    expect(guides.get('nested-group')).toEqual(['branch-last']);
    // nested-leaf: depth 2, under nested-group which IS the last child of root-group
    // slot 0 (root-group ancestor): empty (no more depth-1 children after nested-group)
    // slot 1 (nested-group parent): branch-last (only child)
    expect(guides.get('nested-leaf')).toEqual(['empty', 'branch-last']);
  });

  it('uses empty when ancestor has no more children below', () => {
    const deepLeaf = createRectangleItem({ id: 'deep-leaf' });
    const innerGroup = createGroupNode([deepLeaf], 'Inner');
    innerGroup.id = 'inner-group';
    // inner-group is the only child — no siblings after it
    const outerGroup = createGroupNode([innerGroup], 'Outer');
    outerGroup.id = 'outer-group';

    const rows = flattenLayerRows([outerGroup]);
    const guides = computeTreeGuides(rows);

    expect(guides.get('outer-group')).toEqual([]);
    expect(guides.get('inner-group')).toEqual(['branch-last']);
    // deep-leaf: depth 2
    // slot 0 (outer-group): empty (no more depth-1 children after inner-group)
    // slot 1 (inner-group): branch-last (only child)
    expect(guides.get('deep-leaf')).toEqual(['empty', 'branch-last']);
  });

  it('handles multiple root groups independently', () => {
    const child1 = createRectangleItem({ id: 'child1' });
    const group1 = createGroupNode([child1], 'Group 1');
    group1.id = 'group1';

    const child2 = createRectangleItem({ id: 'child2' });
    const group2 = createGroupNode([child2], 'Group 2');
    group2.id = 'group2';

    const rows = flattenLayerRows([group1, group2]);
    const guides = computeTreeGuides(rows);

    expect(guides.get('group1')).toEqual([]);
    expect(guides.get('child1')).toEqual(['branch-last']);
    expect(guides.get('group2')).toEqual([]);
    expect(guides.get('child2')).toEqual(['branch-last']);
  });

  it('handles a group row as a child of another group', () => {
    const leaf = createRectangleItem({ id: 'leaf' });
    const childGroup = createGroupNode([leaf], 'Child Group');
    childGroup.id = 'child-group';
    const otherChild = createTextItem({ id: 'other' });
    // Document order: [childGroup, otherChild]
    // Display order (reversed): otherChild, childGroup
    const parentGroup = createGroupNode([childGroup, otherChild], 'Parent');
    parentGroup.id = 'parent-group';

    const rows = flattenLayerRows([parentGroup]);
    const guides = computeTreeGuides(rows);

    // otherChild at depth 1, has a sibling below (childGroup)
    expect(guides.get('other')).toEqual(['branch']);
    // child-group at depth 1, last child in display order
    expect(guides.get('child-group')).toEqual(['branch-last']);
    // leaf at depth 2
    // slot 0: empty (parent-group has no more depth-1 children after child-group)
    // slot 1: branch-last (only child of child-group)
    expect(guides.get('leaf')).toEqual(['empty', 'branch-last']);
  });
});
