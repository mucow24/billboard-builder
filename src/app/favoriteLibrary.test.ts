import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../editor/document/documentDefaults';

import {
  buildDefaultFavoriteName,
  instantiateFavoriteNodes,
  uniquifyFavoriteName,
} from './favoriteLibrary';

describe('favorite library helpers', () => {
  it('builds default names for single-node and multi-node favorites', () => {
    const rectangle = createRectangleItem();
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const text = createTextItem({
      id: 'text-single',
      text: 'Headline   with\nspacing',
    });

    expect(buildDefaultFavoriteName([rectangle])).toBe('Rectangle favorite');
    expect(buildDefaultFavoriteName([text])).toBe('Text:Headline with spacing');
    expect(buildDefaultFavoriteName([first, second])).toBe('2 items favorite');
  });

  it('adds numeric suffixes for duplicate favorite names', () => {
    expect(
      uniquifyFavoriteName('Rectangle favorite', [
        { name: 'Rectangle favorite' },
        { name: 'Rectangle favorite (2)' },
      ]),
    ).toBe('Rectangle favorite (3)');
  });

  it('clones inserted favorite nodes with fresh ids while preserving order and structure', () => {
    const child = createRectangleItem({ id: 'child-node' });
    const group = createGroupNode([child], 'Favorite Group');
    group.id = 'group-node';
    const sibling = createTextItem({ id: 'sibling-node' });

    const clones = instantiateFavoriteNodes([group, sibling], 2);

    expect(clones).toHaveLength(2);
    expect(clones[0]?.id).not.toBe(group.id);
    expect(clones[1]?.id).not.toBe(sibling.id);
    if (clones[0]?.kind !== 'group') {
      throw new Error('Expected cloned group node.');
    }
    expect(clones[0].children[0]?.id).not.toBe(child.id);
    expect(clones[1]?.kind === 'group' ? null : clones[1]?.x).toBe(sibling.x + 48);
  });
});
