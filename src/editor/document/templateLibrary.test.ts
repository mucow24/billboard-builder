import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from './documentDefaults';
import {
  buildTemplateSelectionPayload,
  getTemplateSelectionRoots,
  summarizeTemplateNodes,
} from './templateLibrary';

describe('template library document helpers', () => {
  it('keeps only the highest selected ancestor while preserving traversal order', () => {
    const nestedChild = createRectangleItem({ id: 'nested-child' });
    const nestedGroup = createGroupNode([nestedChild], 'Nested Group');
    nestedGroup.id = 'nested-group';
    const topLevelText = createTextItem({ id: 'top-level-text' });
    const outerGroup = createGroupNode([nestedGroup, topLevelText], 'Outer Group');
    outerGroup.id = 'outer-group';
    const sibling = createRectangleItem({ id: 'sibling' });

    expect(
      getTemplateSelectionRoots([outerGroup, sibling], [
        nestedChild.id,
        outerGroup.id,
        sibling.id,
      ]),
    ).toEqual([outerGroup, sibling]);
  });

  it('collects referenced document fonts for text nodes inside the saved payload', () => {
    const brandedText = createTextItem({
      id: 'headline',
      fontFamily: 'Poster Sans',
    });
    const systemText = createTextItem({
      id: 'body',
      fontFamily: 'Arial',
    });
    const group = createGroupNode([brandedText, systemText], 'Headline Group');
    group.id = 'headline-group';

    const payload = buildTemplateSelectionPayload(
      {
        nodes: [group],
        fonts: [
          {
            family: 'Poster Sans',
            sourceName: 'PosterSans-Regular.ttf',
            kind: 'uploaded',
          },
          {
            family: 'Accent Sans',
            sourceName: 'AccentSans-Regular.ttf',
            kind: 'uploaded',
          },
        ],
      },
      [group.id],
    );

    expect(payload.nodes).toEqual([group]);
    expect(payload.fonts).toEqual([
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        kind: 'uploaded',
      },
    ]);
  });

  it('summarizes saved template colors and kinds for lightweight cards', () => {
    const first = createRectangleItem({
      id: 'first',
      fill: '#123456',
      stroke: '#abcdef',
      strokeWidth: 2,
    });
    const second = createTextItem({
      id: 'second',
      fill: '#fedcba',
    });
    const third = createRectangleItem({
      id: 'third',
      fill: '#654321',
      stroke: '#123456',
    });
    const group = createGroupNode([first, second, third], 'Template Group');

    expect(summarizeTemplateNodes([group])).toEqual({
      itemCount: 3,
      kindCounts: new Map([
        ['rectangle', 2],
        ['text', 1],
      ]),
      previewColors: ['#123456', '#abcdef', '#fedcba', '#654321'],
    });
  });

  it('ignores invisible zero-width shape strokes when building preview colors', () => {
    const orangeRect = createRectangleItem({
      id: 'orange-rect',
      fill: '#f97316',
      stroke: '#c2410c',
      strokeWidth: 0,
    });
    const secondOrangeRect = createRectangleItem({
      id: 'second-orange-rect',
      fill: '#f97316',
      stroke: '#7c2d12',
      strokeWidth: 0,
      x: 320,
    });

    expect(summarizeTemplateNodes([orangeRect, secondOrangeRect]).previewColors).toEqual([
      '#f97316',
    ]);
  });
});
