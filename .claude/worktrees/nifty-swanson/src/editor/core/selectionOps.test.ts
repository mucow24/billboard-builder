import { describe, expect, it } from 'vitest';

import {
  clearSelection,
  normalizeSelectionForItems,
  replaceSelection,
  selectAllItems,
  toggleSelectionItem,
  toggleSelectionItems,
} from './selectionOps';
import {
  createEllipseItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';

describe('selectionOps', () => {
  it('deduplicates replacement selections and clears them explicitly', () => {
    expect(replaceSelection(['a', 'b', 'a'])).toEqual(['a', 'b']);
    expect(clearSelection()).toEqual([]);
  });

  it('toggles a single item in and out of the selection', () => {
    expect(toggleSelectionItem(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelectionItem(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('toggles batches by removing selected ids and appending new ids', () => {
    expect(toggleSelectionItems(['a', 'b', 'c'], ['b', 'd'])).toEqual(['a', 'c', 'd']);
  });

  it('normalizes selection ids against visible items and preserves first-seen order', () => {
    const hidden = createTextItem({ id: 'hidden', zIndex: 0, hidden: true });
    const visibleA = createRectangleItem({ id: 'visible-a', zIndex: 2 });
    const visibleB = createEllipseItem({ id: 'visible-b', zIndex: 1 });

    const result = normalizeSelectionForItems(
      ['visible-a', 'missing', 'visible-a', 'visible-b', 'hidden'],
      [hidden, visibleA, visibleB]
    );

    expect(result).toEqual(['visible-a', 'visible-b']);
  });

  it('selects all visible items in z-index order', () => {
    const hidden = createTextItem({ id: 'hidden', zIndex: 0, hidden: true });
    const visibleA = createRectangleItem({ id: 'visible-a', zIndex: 2 });
    const visibleB = createEllipseItem({ id: 'visible-b', zIndex: 1 });

    expect(selectAllItems([visibleA, hidden, visibleB])).toEqual(['visible-b', 'visible-a']);
  });
});
