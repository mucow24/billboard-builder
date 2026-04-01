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
import type { ImageCanvasItem } from './documentTypes';

describe('document normalizer', () => {
  it('derives a canonical image source transform from legacy crop data', () => {
    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    imageItem.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    const legacyImageItem = {
      ...imageItem,
      sourceTransform: undefined,
    } as unknown as ImageCanvasItem;

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [legacyImageItem],
      fonts: [],
    });

    expect(normalized.nodes[0]).toMatchObject({
      kind: 'image',
      crop: {
        x: 20,
        y: 10,
        width: 80,
        height: 45,
      },
      sourceTransform: {
        x: -20,
        y: -10,
        width: 160,
        height: 90,
        rotation: 0,
      },
    });
  });

  it('derives a mirrored canonical image source transform from legacy crop data', () => {
    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      width: 80,
      height: 45,
    });
    imageItem.crop = {
      x: 20,
      y: 10,
      width: 80,
      height: 45,
    };
    imageItem.mirrorHorizontal = true;
    const legacyImageItem = {
      ...imageItem,
      sourceTransform: undefined,
    } as unknown as ImageCanvasItem;

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [legacyImageItem],
      fonts: [],
    });

    expect(normalized.nodes[0]).toMatchObject({
      kind: 'image',
      mirrorHorizontal: true,
      sourceTransform: {
        x: -60,
        y: -10,
        width: 160,
        height: 90,
        rotation: 0,
      },
    });
  });

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
    imageItem.crop = {
      x: -5,
      y: 10,
      width: 100,
      height: 0,
    };
    imageItem.mirrorHorizontal = true;

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
      crop: {
        x: 0,
        y: 10,
        width: 40,
        height: 1,
      },
      adjustments: {
        brightness: 200,
        contrast: 0,
        tintColor: '#ffffff',
        tintStrength: 100,
      },
      mirrorHorizontal: true,
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

  it('defaults missing blurRadius to zero and preserves valid values', () => {
    const rectangle = createRectangleItem();
    const withBlur = { ...rectangle, blurRadius: 10 };
    const withoutBlur = { ...rectangle } as Record<string, unknown>;
    delete withoutBlur.blurRadius;

    const normalizedWithBlur = normalizeProjectDocument({
      version: 2,
      nodes: [withBlur],
      fonts: [],
    });
    expect(normalizedWithBlur.nodes[0]).toMatchObject({ blurRadius: 10 });

    const normalizedWithout = normalizeProjectDocument({
      version: 2,
      nodes: [withoutBlur as never],
      fonts: [],
    });
    expect(normalizedWithout.nodes[0]).toMatchObject({ blurRadius: 0 });
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
    };

    expect(normalizeExistingProjectDocument(liveDocument)).toEqual(
      normalizeProjectDocument(liveDocument)
    );
  });
});
