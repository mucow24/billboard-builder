import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import { flattenLayerRows } from '../../document/sceneGraph';

import {
  formatImmediateChildCount,
  getLayerRowVisualState,
  getLayersMetaItemCount,
  getVisibleLayerRows,
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
