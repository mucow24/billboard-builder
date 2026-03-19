import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from './documentDefaults';
import { buildTemplateSelectionPayload, getTemplateSelectionRoots } from './templateLibrary';

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
});
