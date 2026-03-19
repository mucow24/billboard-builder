import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
} from '../document/documentDefaults';
import { collectLeafItems } from '../document/sceneGraph';
import type { ProjectDocument } from '../document/documentTypes';

import { buildRenderableCanvasItems } from './renderAdapter';

function createGroupedDocument(nodes: ProjectDocument['nodes']): ProjectDocument {
  return {
    version: 2,
    canvas: {
      width: 1024,
      height: 1024,
      presetId: 'square-lg',
    },
    background: '#ffffff00',
    nodes,
    items: nodes.flatMap(collectLeafItems),
    fonts: [],
  };
}

describe('buildRenderableCanvasItems', () => {
  it('makes direct children selectable when a group node is selected', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createRectangleItem({ id: 'second' });
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Nested');
    nestedGroup.id = 'nested-group';
    const outerGroup = createGroupNode([first, second, nestedGroup], 'Outer');
    outerGroup.id = 'outer-group';

    const renderables = buildRenderableCanvasItems(
      createGroupedDocument([outerGroup]),
      [outerGroup.id],
    );
    const selectableById = new Map(renderables.map((item) => [item.id, item.selectableNodeId]));

    expect(selectableById.get(first.id)).toBe(first.id);
    expect(selectableById.get(second.id)).toBe(second.id);
    expect(selectableById.get(nestedLeaf.id)).toBe(nestedGroup.id);
  });
});
