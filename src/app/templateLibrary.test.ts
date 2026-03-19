import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../editor/document/documentDefaults';

import {
  buildDefaultTemplateName,
  instantiateTemplateNodes,
  summarizeTemplateNodes,
  uniquifyTemplateName,
} from './templateLibrary';

describe('template library helpers', () => {
  it('builds default names for single-node and multi-node templates', () => {
    const rectangle = createRectangleItem();
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });

    expect(buildDefaultTemplateName([rectangle])).toBe('Rectangle template');
    expect(buildDefaultTemplateName([first, second])).toBe('2 items template');
  });

  it('adds numeric suffixes for duplicate template names', () => {
    expect(
      uniquifyTemplateName('Rectangle template', [
        { name: 'Rectangle template' },
        { name: 'Rectangle template (2)' },
      ]),
    ).toBe('Rectangle template (3)');
  });

  it('clones inserted template nodes with fresh ids while preserving order and structure', () => {
    const child = createRectangleItem({ id: 'child-node' });
    const group = createGroupNode([child], 'Template Group');
    group.id = 'group-node';
    const sibling = createTextItem({ id: 'sibling-node' });

    const clones = instantiateTemplateNodes([group, sibling], 2);

    expect(clones).toHaveLength(2);
    expect(clones[0]?.id).not.toBe(group.id);
    expect(clones[1]?.id).not.toBe(sibling.id);
    if (clones[0]?.kind !== 'group') {
      throw new Error('Expected cloned group node.');
    }
    expect(clones[0].children[0]?.id).not.toBe(child.id);
    expect(clones[1]?.kind === 'group' ? null : clones[1]?.x).toBe(sibling.x + 48);
  });

  it('summarizes saved template contents for lightweight cards', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const group = createGroupNode([first, second], 'Template Group');

    expect(summarizeTemplateNodes([group])).toEqual({
      itemCount: 2,
      kindCounts: new Map([
        ['rectangle', 1],
        ['text', 1],
      ]),
    });
  });
});
