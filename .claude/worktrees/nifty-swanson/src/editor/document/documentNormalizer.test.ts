import { describe, expect, it } from 'vitest';

import {
  createGroupNode,
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from './documentDefaults';
import {
  normalizeExistingProjectDocument,
  normalizeProjectDocument,
} from './documentNormalizer';

describe('document normalizer', () => {
  it('normalizes recursive node ordering, shadows, image adjustments, and font entries', () => {
    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    imageItem.zIndex = 3;
    imageItem.adjustments = {
      brightness: 250,
      contrast: -10,
      tintColor: '',
      tintStrength: 999,
    };

    const textItem = createTextItem({
      zIndex: 1,
      fontFamily: 'System Sans',
    });
    textItem.padding = { top: -4, right: Number.POSITIVE_INFINITY, bottom: 12, left: -2 };

    const group = createGroupNode([
      textItem,
      createLineItem({ zIndex: 2 }),
    ]);
    group.opacity = 3;

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [
        {
          ...createRectangleItem({ zIndex: 4 }),
          shadow: { color: '#000000ff' } as never,
        },
        imageItem,
        group,
      ],
      fonts: [
        { family: 'System Sans', sourceName: 'system', kind: 'system' },
        { family: 123 as unknown as string, sourceName: 'broken', kind: 'uploaded' },
      ],
    });

    expect(normalized.nodes[0]).toMatchObject({
      kind: 'rectangle',
      shadow: {
        color: '#000000ff',
        blur: 0,
        offsetX: 0,
        offsetY: 0,
        opacity: 0,
      },
    });
    expect(normalized.nodes[1]).toMatchObject({
      kind: 'image',
      adjustments: {
        brightness: 200,
        contrast: 0,
        tintColor: '#ffffff',
        tintStrength: 100,
      },
      zIndex: 1,
    });
    expect(normalized.nodes[2]).toMatchObject({
      kind: 'group',
      opacity: 1,
    });
    if (normalized.nodes[2]?.kind !== 'group') {
      throw new Error('Expected normalized group node.');
    }
    expect(normalized.nodes[2].children[0]).toMatchObject({
      kind: 'text',
      padding: { top: -4, right: 0, bottom: 12, left: -2 },
      zIndex: 2,
    });
    expect(normalized.nodes[2].children[1]).toMatchObject({
      kind: 'line',
      zIndex: 3,
    });
    expect(normalized.fonts).toEqual([
      { family: 'System Sans', sourceName: 'system', kind: 'system' },
    ]);
  });

  it('keeps only font references that are still used by text nodes', () => {
    const posterText = createTextItem({
      id: 'poster-text',
      fontFamily: 'Poster Sans',
    });
    const systemText = createTextItem({
      id: 'system-text',
      fontFamily: 'Arial',
      x: 360,
    });

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [posterText, systemText],
      fonts: [
        { family: 'Poster Sans', sourceName: 'PosterSans-Regular.ttf', kind: 'uploaded' },
        { family: 'Ghost Font', sourceName: 'GhostFont-Regular.ttf', kind: 'bundled' },
        { family: 'Arial', sourceName: 'Arial', kind: 'system' },
      ],
    });

    expect(normalized.fonts).toEqual([
      { family: 'Poster Sans', sourceName: 'PosterSans-Regular.ttf', kind: 'uploaded' },
      { family: 'Arial', sourceName: 'Arial', kind: 'system' },
    ]);
  });

  it('uses the same canonical normalization for loaded and live documents', () => {
    const liveDocument = {
      version: 2 as const,
      canvas: {
        width: Number.NaN,
        height: 0,
        presetId: 123 as unknown as string,
      },
      background: '#abcdef',
      nodes: [
        createGroupNode([
          createRectangleItem({
            id: 'rectangle',
            zIndex: 9,
            width: 0,
            opacity: 3,
          }),
        ]),
      ],
      fonts: [
        { family: 'Poster Sans', sourceName: 'PosterSans.ttf', kind: 'uploaded' as const },
      ],
      items: [],
    };

    expect(normalizeExistingProjectDocument(liveDocument)).toEqual(
      normalizeProjectDocument(liveDocument)
    );
  });
});
