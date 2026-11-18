import { describe, expect, it } from 'vitest';

import {
  createGeneratorItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import type { CanvasItem } from '../../document/documentTypes';
import type { RenderableCanvasItem } from '../renderAdapter';

import { resolveHoverOutline } from './hoverOutline';

const CANVAS_BOUNDS = { x: 0, y: 0, width: 1024, height: 512 };

function renderable(
  item: CanvasItem,
  overrides: Partial<Pick<RenderableCanvasItem, 'groupPath' | 'selectableNodeId'>> = {},
): RenderableCanvasItem {
  return { ...item, groupPath: [], selectableNodeId: item.id, ...overrides };
}

function resolve(
  hoveredItemId: string | null,
  renderedItems: RenderableCanvasItem[],
  selection: { nodeIds?: string[]; itemIds?: string[] } = {},
) {
  return resolveHoverOutline({
    hoveredItemId,
    renderedItems,
    selectedNodeIds: selection.nodeIds ?? [],
    selectedItemIds: selection.itemIds ?? [],
    canvasBounds: CANVAS_BOUNDS,
  });
}

describe('resolveHoverOutline', () => {
  const text = renderable(createTextItem({ id: 'text', x: 10, y: 20, width: 200, height: 50 }));
  const rect = renderable(createRectangleItem({ id: 'rect', x: 300, y: 40, width: 80, height: 60 }));

  it('outlines the unselected item under the pointer', () => {
    expect(resolve('text', [text, rect])).toEqual({ nodeId: 'text', kind: 'item', item: text });
  });

  it('has nothing to outline without a hovered item, or once it is gone', () => {
    expect(resolve(null, [text, rect])).toBeNull();
    expect(resolve('deleted', [text, rect])).toBeNull();
  });

  it('leaves a selected item to the selection overlay', () => {
    expect(resolve('text', [text, rect], { nodeIds: ['text'], itemIds: ['text'] })).toBeNull();
    // The other item is still pointed out.
    expect(resolve('rect', [text, rect], { nodeIds: ['text'], itemIds: ['text'] })).toMatchObject({
      nodeId: 'rect',
      kind: 'item',
    });
  });

  it('skips an item that clicks pass through', () => {
    expect(resolve('text', [{ ...text, locked: true }, rect])).toBeNull();
    expect(resolve('text', [{ ...text, hidden: true }, rect])).toBeNull();
  });

  it('outlines the whole group a click on its item would select', () => {
    const first = renderable(createRectangleItem({ id: 'a', x: 100, y: 100, width: 50, height: 40 }), {
      groupPath: ['group'],
      selectableNodeId: 'group',
    });
    const second = renderable(createRectangleItem({ id: 'b', x: 300, y: 200, width: 100, height: 60 }), {
      groupPath: ['group'],
      selectableNodeId: 'group',
    });

    expect(resolve('a', [first, second, rect])).toEqual({
      nodeId: 'group',
      kind: 'bounds',
      bounds: { x: 100, y: 100, width: 300, height: 160 },
    });
  });

  it('outlines one item of a group that has been drilled into', () => {
    // With the group's other item selected, a click selects this one alone.
    const first = renderable(createRectangleItem({ id: 'a' }), { groupPath: ['group'] });
    const second = renderable(createRectangleItem({ id: 'b' }), { groupPath: ['group'] });

    expect(resolve('b', [first, second], { nodeIds: ['a'], itemIds: ['a'] })).toEqual({
      nodeId: 'b',
      kind: 'item',
      item: second,
    });
  });

  it('adds nothing to the items of a selected group', () => {
    // A selected group's items are selectable one by one, and outlined already.
    const first = renderable(createRectangleItem({ id: 'a' }), { groupPath: ['group'] });
    const second = renderable(createRectangleItem({ id: 'b' }), { groupPath: ['group'] });

    expect(resolve('b', [first, second], { nodeIds: ['group'], itemIds: ['a', 'b'] })).toBeNull();
  });

  it('outlines the canvas for a generator', () => {
    const generator = renderable({ ...createGeneratorItem('bands', 64, 64), id: 'generator' });

    expect(resolve('generator', [generator, rect])).toEqual({
      nodeId: 'generator',
      kind: 'bounds',
      bounds: CANVAS_BOUNDS,
    });
  });
});
