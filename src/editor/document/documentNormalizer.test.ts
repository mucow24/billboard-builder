import { describe, expect, it } from 'vitest';

import {
  createGeneratorItem,
  createGroupNode,
  createImageItem,
  createLineItem,
  createPolygonItem,
  createRectangleItem,
  createTextItem,
  MIN_LINE_STROKE_WIDTH,
} from './documentDefaults';
import {
  normalizeProjectDocument,
} from './documentNormalizer';
import type { BandsGeneratorParams, GeneratorCanvasItem, ImageCanvasItem } from './documentTypes';
import { rgba } from '../generators/colorUtils';

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
      kind: 'polygon',
      closed: false,
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

  it('keeps or drops all the font references of a family together', () => {
    const posterFiles = [
      { family: 'Poster Sans', sourceName: 'PosterSans-Bold.ttf', kind: 'uploaded' as const },
      { family: 'Poster Sans', sourceName: 'PosterSans-Regular.ttf', kind: 'uploaded' as const },
    ];
    const ghostFiles = [
      { family: 'Ghost Font', sourceName: 'GhostFont-Bold.ttf', kind: 'uploaded' as const },
      { family: 'Ghost Font', sourceName: 'GhostFont-Regular.ttf', kind: 'uploaded' as const },
    ];

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [createTextItem({ id: 'poster-text', fontFamily: 'Poster Sans' })],
      fonts: [posterFiles[0], ghostFiles[0], posterFiles[1], ghostFiles[1]],
    });

    expect(normalized.fonts).toEqual(posterFiles);
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

  it('gives text saved before it had an outline none, and keeps a valid one', () => {
    const text = createTextItem();
    const saved = { ...text } as Record<string, unknown>;
    delete saved.stroke;
    delete saved.strokeWidth;

    const normalize = (node: unknown) =>
      normalizeProjectDocument({ version: 2, nodes: [node as never], fonts: [] }).nodes[0];

    expect(normalize(saved)).toMatchObject({ stroke: '#000000ff', strokeWidth: 0 });
    expect(normalize({ ...text, stroke: '#ff8800cc', strokeWidth: 7.5 })).toMatchObject({
      stroke: '#ff8800cc',
      strokeWidth: 7.5,
    });
    expect(normalize({ ...text, strokeWidth: -4 })).toMatchObject({ strokeWidth: 0 });
    expect(normalize({ ...text, strokeWidth: Number.NaN })).toMatchObject({ strokeWidth: 0 });
  });

  it('keeps any finite line height, zero and negative included', () => {
    const text = createTextItem();
    const normalize = (node: unknown) =>
      normalizeProjectDocument({ version: 2, nodes: [node as never], fonts: [] }).nodes[0];

    expect(normalize({ ...text, lineHeight: 0 })).toMatchObject({ lineHeight: 0 });
    expect(normalize({ ...text, lineHeight: -1.5 })).toMatchObject({ lineHeight: -1.5 });
    expect(normalize({ ...text, lineHeight: 12 })).toMatchObject({ lineHeight: 12 });
    expect(normalize({ ...text, lineHeight: Number.NaN })).toMatchObject({ lineHeight: 1 });
  });

  it('lets a line be thinner than 1 but never 0, and a closed polygon drop its outline', () => {
    const normalize = (node: unknown) =>
      normalizeProjectDocument({ version: 2, nodes: [node as never], fonts: [] }).nodes[0];

    expect(normalize(createLineItem({ strokeWidth: 0.5 }))).toMatchObject({ strokeWidth: 0.5 });
    expect(normalize(createLineItem({ strokeWidth: 0 }))).toMatchObject({
      strokeWidth: MIN_LINE_STROKE_WIDTH,
    });
    expect(normalize(createLineItem({ strokeWidth: -3 }))).toMatchObject({
      strokeWidth: MIN_LINE_STROKE_WIDTH,
    });
    expect(normalize(createPolygonItem({ strokeWidth: 0 }))).toMatchObject({ strokeWidth: 0 });
  });

  it('re-derives the polygon AABB from its vertices and defaults closed/curveRadius', () => {
    const polygon = createPolygonItem({
      vertices: [
        { x: 50, y: 30 },
        { x: 250, y: 30 },
        { x: 150, y: 210 },
      ],
    });
    // Simulate a legacy payload missing the newer fields and carrying a stale box.
    const legacy = {
      ...polygon,
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      closed: undefined,
      curveRadius: undefined,
    };

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [legacy as never],
      fonts: [],
    });

    expect(normalized.nodes[0]).toMatchObject({
      x: 50,
      y: 30,
      width: 200,
      height: 180,
      closed: true,
      curveRadius: 0,
      rotation: 0,
    });
  });

  it('rebuilds a rectangle ring when polygon vertices degenerate below the floor', () => {
    const polygon = createPolygonItem();
    const broken = { ...polygon, vertices: [{ x: 1, y: 2 }] };

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [broken as never],
      fonts: [],
    });

    const item = normalized.nodes[0] as typeof polygon;
    expect(item.vertices).toHaveLength(4);
    expect(item.vertices[0]).toEqual({ x: item.x, y: item.y });
  });

  it('rebuilds an open polygon from the diagonal of its box when its vertices degenerate below two', () => {
    const line = createLineItem();
    const broken = { ...line, x: 30, y: 40, width: 120, height: 60, vertices: [{ x: 1, y: 2 }] };

    const normalized = normalizeProjectDocument({ version: 2, nodes: [broken as never], fonts: [] });

    expect(normalized.nodes[0]).toMatchObject({
      kind: 'polygon',
      closed: false,
      vertices: [
        { x: 30, y: 40 },
        { x: 150, y: 100 },
      ],
      x: 30,
      y: 40,
      width: 120,
      height: 60,
    });
  });

  it('keeps a two-vertex line as it is, and only an explicit closed: false makes one', () => {
    const twoPoints = [
      { x: 5, y: 5 },
      { x: 50, y: 80 },
    ];
    const line = createLineItem({ vertices: twoPoints, curveRadius: 9 });
    const { closed: ignoredClosed, ...withoutClosed } = createPolygonItem();
    void ignoredClosed;

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [line, withoutClosed as never],
      fonts: [],
    });

    expect(normalized.nodes[0]).toMatchObject({ closed: false, vertices: twoPoints, curveRadius: 9, rotation: 0 });
    expect(normalized.nodes[1]).toMatchObject({ closed: true });
  });

  it('turns a line saved with start and end points into an open two-vertex polygon', () => {
    const legacyLine = {
      id: 'old-line',
      kind: 'line',
      name: 'Divider',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 0,
      locked: true,
      lockAspectRatio: false,
      hidden: false,
      opacity: 0.5,
      shadow: { color: '#000000', blur: 0, offsetX: 0, offsetY: 0, opacity: 0 },
      blurRadius: 3,
      stroke: '#abcdefff',
      strokeWidth: 0,
      startX: 400,
      startY: 200,
      endX: 100,
      endY: 200,
    };

    const normalized = normalizeProjectDocument({ version: 2, nodes: [legacyLine as never], fonts: [] });
    const item = normalized.nodes[0];

    expect(item).toMatchObject({
      id: 'old-line',
      kind: 'polygon',
      name: 'Divider',
      closed: false,
      curveRadius: 0,
      vertices: [
        { x: 400, y: 200 },
        { x: 100, y: 200 },
      ],
      // The box is derived from the vertices; a flat line is 1 high.
      x: 100,
      y: 200,
      width: 300,
      height: 1,
      rotation: 0,
      locked: true,
      opacity: 0.5,
      blurRadius: 3,
      stroke: '#abcdefff',
      // An old line was never thinner than 1.
      strokeWidth: 1,
      gradientEnabled: false,
    });
    for (const key of ['startX', 'startY', 'endX', 'endY']) {
      expect(item).not.toHaveProperty(key);
    }
    // Normalizing the result again changes nothing.
    expect(normalizeProjectDocument({ version: 2, nodes: [item], fonts: [] }).nodes[0]).toEqual(item);
  });

  it('falls back to the box of an old line that has no start and end points', () => {
    const legacyLine = {
      ...createRectangleItem({ id: 'boxed-line', x: 10, y: 20, width: 90, height: 30 }),
      kind: 'line',
      stroke: '#ffffffff',
      strokeWidth: 6,
    };

    const normalized = normalizeProjectDocument({ version: 2, nodes: [legacyLine as never], fonts: [] });

    expect(normalized.nodes[0]).toMatchObject({
      kind: 'polygon',
      closed: false,
      vertices: [
        { x: 10, y: 20 },
        { x: 100, y: 50 },
      ],
    });
  });

  it('coerces missing or whitespace canvas names to "Untitled canvas"', () => {
    const fromMissing = normalizeProjectDocument({ version: 2, nodes: [], fonts: [] });
    expect(fromMissing.name).toBe('Untitled canvas');

    const fromWhitespace = normalizeProjectDocument({
      version: 2,
      name: '   ',
      nodes: [],
      fonts: [],
    });
    expect(fromWhitespace.name).toBe('Untitled canvas');

    const fromCustom = normalizeProjectDocument({
      version: 2,
      name: '  My Canvas  ',
      nodes: [],
      fonts: [],
    });
    expect(fromCustom.name).toBe('My Canvas');
  });

  it('moves the alpha of an older scanlines color into its own opacity setting', () => {
    const scanlines = createGeneratorItem('scanlines', 1024, 1024);
    const legacyScanlines = {
      ...scanlines,
      generatorParams: {
        generatorType: 'scanlines',
        scanlineColor: '#11223380',
        scanlineHeight: 2,
        scanlineSpacing: 3,
      },
    } as unknown as GeneratorCanvasItem;

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [legacyScanlines],
      fonts: [],
    });

    expect((normalized.nodes[0] as GeneratorCanvasItem).generatorParams).toEqual({
      generatorType: 'scanlines',
      scanlineColor: '#112233',
      opacity: 128 / 255,
      scanlineHeight: 2,
      scanlineSpacing: 3,
    });
  });

  it('draws an older scanlines layer exactly as before once its opacity is split out', () => {
    const legacyColor = '#00000017';
    const scanlines = createGeneratorItem('scanlines', 1024, 1024);
    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [
        {
          ...scanlines,
          generatorParams: {
            generatorType: 'scanlines',
            scanlineColor: legacyColor,
            scanlineHeight: 1,
            scanlineSpacing: 4,
          },
        } as unknown as GeneratorCanvasItem,
      ],
      fonts: [],
    });
    const params = (normalized.nodes[0] as GeneratorCanvasItem).generatorParams;
    if (params.generatorType !== 'scanlines') {
      throw new Error('Expected scanlines params.');
    }

    expect(rgba(params.scanlineColor, params.opacity)).toBe(rgba(legacyColor, 1));
  });

  it('leaves a scanlines layer that already has an opacity as it is', () => {
    const scanlines = createGeneratorItem('scanlines', 1024, 1024);
    scanlines.generatorParams = {
      generatorType: 'scanlines',
      scanlineColor: '#11223380',
      opacity: 0.4,
      scanlineHeight: 2,
      scanlineSpacing: 3,
    };

    const normalized = normalizeProjectDocument({ version: 2, nodes: [scanlines], fonts: [] });

    expect((normalized.nodes[0] as GeneratorCanvasItem).generatorParams).toMatchObject({
      scanlineColor: '#11223380',
      opacity: 0.4,
    });
  });

  it('keeps diagonal bands saved before they were centered on their old layout', () => {
    const bands = createGeneratorItem('bands', 1024, 1024);
    const { stripeCentered: ignoredStripeCentered, ...savedParams } = {
      ...bands.generatorParams,
      stripeOffset: -0.4,
    } as BandsGeneratorParams;
    void ignoredStripeCentered;

    const normalized = normalizeProjectDocument({
      version: 2,
      nodes: [{ ...bands, generatorParams: savedParams } as unknown as GeneratorCanvasItem],
      fonts: [],
    });

    expect((normalized.nodes[0] as GeneratorCanvasItem).generatorParams).toEqual({
      ...savedParams,
      stripeCentered: false,
    });
  });

  it('leaves the params of centered diagonal bands untouched', () => {
    const bands = createGeneratorItem('bands', 1024, 1024);

    const normalized = normalizeProjectDocument({ version: 2, nodes: [bands], fonts: [] });

    // The same object, so the layer is not drawn again after every edit.
    expect((normalized.nodes[0] as GeneratorCanvasItem).generatorParams).toBe(bands.generatorParams);
  });
});
