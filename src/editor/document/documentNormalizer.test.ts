import { describe, expect, it } from 'vitest';

import { createImageItem, createLineItem, createRectangleItem, createTextItem } from './documentDefaults';
import {
  normalizeExistingProjectDocument,
  normalizeProjectDocument,
} from './documentNormalizer';

describe('document normalizer', () => {
  it('normalizes item ordering, shadows, image adjustments, and font entries', () => {
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

    const textItem = createTextItem({ zIndex: 1 });
    textItem.padding = { top: -4, right: Number.POSITIVE_INFINITY, bottom: 12, left: -2 };

    const normalized = normalizeProjectDocument({
      version: 1,
      items: [
        {
          ...createRectangleItem({ zIndex: 4 }),
          shadow: { color: '#000000ff' },
        } as ReturnType<typeof createRectangleItem>,
        textItem,
        createLineItem({ zIndex: 2 }),
        imageItem,
      ],
      fonts: [
        { family: 'System Sans', sourceName: 'system', kind: 'system' },
        { family: 123 as unknown as string, sourceName: 'broken', kind: 'uploaded' },
      ],
    });

    expect(normalized.items.map((item) => item.zIndex)).toEqual([0, 1, 2, 3]);
    expect(normalized.items[0]).toMatchObject({
      kind: 'text',
      padding: { top: -4, right: 0, bottom: 12, left: -2 },
    });
    expect(normalized.items[1]).toMatchObject({ kind: 'line' });
    expect(normalized.items[2]).toMatchObject({
      kind: 'image',
      adjustments: {
        brightness: 200,
        contrast: 0,
        tintColor: '#ffffff',
        tintStrength: 100,
      },
    });
    expect(normalized.items[3]).toMatchObject({
      kind: 'rectangle',
      shadow: {
        color: '#000000ff',
        blur: 0,
        offsetX: 0,
        offsetY: 0,
        opacity: 0,
      },
    });
    expect(normalized.fonts).toEqual([
      { family: 'System Sans', sourceName: 'system', kind: 'system' },
    ]);
  });

  it('uses the same canonical normalization for loaded and live documents', () => {
    const liveDocument = {
      version: 1 as const,
      canvas: {
        width: Number.NaN,
        height: 0,
        presetId: 123 as unknown as string,
      },
      background: '#abcdef',
      items: [
        createRectangleItem({
          id: 'rectangle',
          zIndex: 9,
          width: 0,
          opacity: 3,
        }),
      ],
      fonts: [
        { family: 'Poster Sans', sourceName: 'PosterSans.ttf', kind: 'uploaded' as const },
      ],
    };

    expect(normalizeExistingProjectDocument(liveDocument)).toEqual(
      normalizeProjectDocument(liveDocument)
    );
  });
});
