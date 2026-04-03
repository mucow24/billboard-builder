import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import { flattenLayerRows } from '../../document/sceneGraph';

import {
  computeLayerMoveTarget,
  formatImmediateChildCount,
  getLayerRowVisualState,
  getLayersMetaItemCount,
  getVisibleLayerRows,
  resolveDropDepth,
} from './layersTabModel';

describe('layersTabModel', () => {
  it('filters visible rows by collapsed ancestry', () => {
    const child = createRectangleItem({ id: 'child-1' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group-1';

    const rows = flattenLayerRows([group]);

    expect(getVisibleLayerRows(rows, new Set())).toHaveLength(2);
    expect(getVisibleLayerRows(rows, new Set(['group-1']))).toEqual([
      expect.objectContaining({ selectableNodeId: 'group-1' }),
    ]);
  });

  it('derives ancestor and descendant row states from the selection', () => {
    const selectedLeaf = createTextItem({ id: 'selected-leaf' });
    const siblingLeaf = createRectangleItem({ id: 'sibling-leaf' });
    const group = createGroupNode([siblingLeaf, selectedLeaf], 'Hero Group');
    group.id = 'group-1';

    const rows = flattenLayerRows([group]);
    const groupRow = rows.find((row) => row.selectableNodeId === group.id);
    const siblingRow = rows.find((row) => row.selectableNodeId === siblingLeaf.id);

    expect(groupRow).toBeDefined();
    expect(siblingRow).toBeDefined();

    expect(getLayerRowVisualState(groupRow!, rows, new Set([selectedLeaf.id]))).toBe(
      'contains-selection',
    );
    expect(getLayerRowVisualState(siblingRow!, rows, new Set([group.id]))).toBe(
      'in-selected-group',
    );
  });

  it('formats immediate child counts and footer meta counts', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const group = createGroupNode([first, second], 'Hero Group');
    group.id = 'group-1';

    const rows = flattenLayerRows([group]);

    expect(formatImmediateChildCount(1)).toBe('1 item');
    expect(formatImmediateChildCount(2)).toBe('2 items');
    expect(getLayersMetaItemCount(rows)).toBe('2 items');
  });
});

describe('resolveDropDepth', () => {
  it('returns the common depth for non-ambiguous gaps at same depth', () => {
    // Both rows at depth 1 — no ambiguity
    expect(resolveDropDepth(1, 1, 0)).toBe(1);
    expect(resolveDropDepth(1, 1, 999)).toBe(1);
  });

  it('returns rowBelow depth when depth increases downward', () => {
    // rowAbove depth 0, rowBelow depth 1 (entering a group)
    expect(resolveDropDepth(0, 1, 0)).toBe(1);
  });

  it('resolves to shallowest depth when cursor is far left at an ambiguous gap', () => {
    // rowAbove depth 2, rowBelow depth 0 — valid range [0, 2]
    // relativeX=0 should give shallowest (0)
    expect(resolveDropDepth(2, 0, 0)).toBe(0);
  });

  it('resolves to deepest depth when cursor is far right at an ambiguous gap', () => {
    // rowAbove depth 2, rowBelow depth 0 — valid range [0, 2]
    // relativeX=999 should give deepest (2)
    expect(resolveDropDepth(2, 0, 999)).toBe(2);
  });

  it('resolves end-of-list gap based on cursor position', () => {
    // rowAbove depth 2, rowBelow null (end of list) — valid range [0, 2]
    expect(resolveDropDepth(2, null, 0)).toBe(0);
    expect(resolveDropDepth(2, null, 999)).toBe(2);
  });
});

describe('computeLayerMoveTarget', () => {
  it('moves a sibling forward in a flat list', () => {
    // Data: [a, b, c] → Visual: [c, b, a]
    const a = createRectangleItem({ id: 'a' });
    const b = createRectangleItem({ id: 'b' });
    const c = createRectangleItem({ id: 'c' });
    const rows = flattenLayerRows([a, b, c]);
    // rows: [{c, depth 0}, {b, depth 0}, {a, depth 0}]

    // Drag c (visual index 0) to gap 2 (between b and a), depth 0
    const result = computeLayerMoveTarget(rows, 0, 2, 0);
    expect(result).toEqual({ nodeId: 'c', targetParentId: null, targetChildrenIndex: 1 });
  });

  it('moves a sibling backward in a flat list', () => {
    const a = createRectangleItem({ id: 'a' });
    const b = createRectangleItem({ id: 'b' });
    const c = createRectangleItem({ id: 'c' });
    const rows = flattenLayerRows([a, b, c]);

    // Drag a (visual index 2) to gap 0 (before c), depth 0
    const result = computeLayerMoveTarget(rows, 2, 0, 0);
    expect(result).toEqual({ nodeId: 'a', targetParentId: null, targetChildrenIndex: 2 });
  });

  it('returns null when drop is at original position', () => {
    const a = createRectangleItem({ id: 'a' });
    const b = createRectangleItem({ id: 'b' });
    const rows = flattenLayerRows([a, b]);

    // Drag b (visual index 0) to gap 0 or 1 — both are no-op
    expect(computeLayerMoveTarget(rows, 0, 0, 0)).toBeNull();
    expect(computeLayerMoveTarget(rows, 0, 1, 0)).toBeNull();
  });

  it('drops after a group header to insert as first visual child', () => {
    // Data: [group(child_a, child_b)]
    // Visual: [group, child_b, child_a]
    const child_a = createRectangleItem({ id: 'child_a' });
    const child_b = createRectangleItem({ id: 'child_b' });
    const group = createGroupNode([child_a, child_b], 'Group');
    group.id = 'group-1';
    const outsider = createRectangleItem({ id: 'outsider' });
    const rows = flattenLayerRows([group, outsider]);
    // Visual: [outsider, group, child_b, child_a]

    // Drag outsider (visual 0) to gap 2 (between group header and child_b), depth 1
    const result = computeLayerMoveTarget(rows, 0, 2, 1);
    // Should insert into group as last data child (= first visual child)
    expect(result).toEqual({ nodeId: 'outsider', targetParentId: 'group-1', targetChildrenIndex: 2 });
  });

  it('drops between children of a group', () => {
    const child_a = createRectangleItem({ id: 'child_a' });
    const child_b = createRectangleItem({ id: 'child_b' });
    const child_c = createRectangleItem({ id: 'child_c' });
    const group = createGroupNode([child_a, child_b, child_c], 'Group');
    group.id = 'group-1';
    const rows = flattenLayerRows([group]);
    // Visual: [group, child_c, child_b, child_a]

    // Drag child_c (visual 1) to gap 3 (between child_b and child_a), depth 1
    const result = computeLayerMoveTarget(rows, 1, 3, 1);
    // child_c moves from data index 2 to between child_a (0) and child_b (1) → data index 1
    expect(result).toEqual({ nodeId: 'child_c', targetParentId: 'group-1', targetChildrenIndex: 1 });
  });

  it('drops item out of group to root level', () => {
    const child = createRectangleItem({ id: 'child' });
    const sibling = createRectangleItem({ id: 'sibling' });
    const group = createGroupNode([child, sibling], 'Group');
    group.id = 'group-1';
    const outsider = createRectangleItem({ id: 'outsider' });
    const rows = flattenLayerRows([group, outsider]);
    // Visual: [outsider, group, sibling, child]

    // Drag child (visual 3) to gap 0 (before outsider), depth 0
    const result = computeLayerMoveTarget(rows, 3, 0, 0);
    expect(result).toEqual({ nodeId: 'child', targetParentId: null, targetChildrenIndex: 2 });
  });

  it('drops item into a different group', () => {
    const childA = createRectangleItem({ id: 'childA' });
    const groupA = createGroupNode([childA], 'Group A');
    groupA.id = 'groupA';
    const childB = createRectangleItem({ id: 'childB' });
    const groupB = createGroupNode([childB], 'Group B');
    groupB.id = 'groupB';
    const rows = flattenLayerRows([groupA, groupB]);
    // Visual: [groupB, childB, groupA, childA]

    // Drag childA (visual 3) to gap 2 (between groupB header and childB below it...
    // actually: between childB and groupA), depth 1
    // Wait, let me reconsider the visual layout:
    // Gap 0: before groupB
    // Gap 1: between groupB header and childB
    // Gap 2: between childB and groupA
    // Gap 3: between groupA header and childA
    // Gap 4: after childA

    // Drag childA (visual 3) to gap 1 (after groupB header), depth 1
    const result = computeLayerMoveTarget(rows, 3, 1, 1);
    expect(result).toEqual({ nodeId: 'childA', targetParentId: 'groupB', targetChildrenIndex: 1 });
  });

  it('rejects self-nesting (group into itself)', () => {
    const child = createRectangleItem({ id: 'child' });
    const group = createGroupNode([child], 'Group');
    group.id = 'group-1';
    const rows = flattenLayerRows([group]);
    // Visual: [group, child]

    // Drag group (visual 0) to gap 1 (between group header and child — depth 1 = into itself)
    const result = computeLayerMoveTarget(rows, 0, 1, 1);
    expect(result).toBeNull();
  });
});
