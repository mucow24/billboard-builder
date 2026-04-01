import { describe, expect, it } from 'vitest';

import {
  normalizeSelectionForNodes,
  selectAllNodes,
  toggleSelectionNode,
  toggleSelectionNodes,
} from './selectionOps';
import {
  createEllipseItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';

describe('selectionOps', () => {
  it('toggles a single node in and out of the selection', () => {
    expect(toggleSelectionNode(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelectionNode(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('toggles batches by removing selected ids and appending new ids', () => {
    expect(toggleSelectionNodes(['a', 'b', 'c'], ['b', 'd'])).toEqual(['a', 'c', 'd']);
  });

  it('normalizes selection ids against available nodes and preserves first-seen order', () => {
    const nodeA = createRectangleItem({ id: 'node-a', zIndex: 2 });
    const nodeB = createEllipseItem({ id: 'node-b', zIndex: 1 });
    const nodeC = createTextItem({ id: 'node-c', zIndex: 0 });

    const result = normalizeSelectionForNodes(
      ['node-a', 'missing', 'node-a', 'node-b', 'node-c'],
      [nodeA, nodeB, nodeC]
    );

    expect(result).toEqual(['node-a', 'node-b', 'node-c']);
  });

  it('selects all nodes in document order', () => {
    const nodeA = createRectangleItem({ id: 'node-a', zIndex: 2 });
    const nodeB = createEllipseItem({ id: 'node-b', zIndex: 1 });
    const nodeC = createTextItem({ id: 'node-c', zIndex: 0 });

    expect(selectAllNodes([nodeA, nodeB, nodeC])).toEqual(['node-a', 'node-b', 'node-c']);
  });
});
