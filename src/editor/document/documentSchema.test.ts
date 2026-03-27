import { describe, expect, it } from 'vitest';

import {
  createDefaultProjectDocument,
  createGroupNode,
  createImageItem,
  createRectangleItem,
  createTextItem,
} from './documentDefaults';
import { parseProjectDocument, serializeProjectDocument } from './documentSchema';

describe('document schema', () => {
  it('round-trips a valid recursive project document and preserves node order', () => {
    const document = createDefaultProjectDocument();
    const firstItem = createRectangleItem({ zIndex: 4 });
    const secondItem = createRectangleItem({ zIndex: 2 });

    document.nodes = [createGroupNode([firstItem, secondItem])];

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.nodes[0]?.kind).toBe('group');
    if (parsed.nodes[0]?.kind !== 'group') {
      throw new Error('Expected group node.');
    }
    expect(parsed.nodes[0].children.map((node) => node.id)).toEqual([firstItem.id, secondItem.id]);
  });

  it('migrates supported legacy version 1 documents into version 2 trees', () => {
    const legacy = {
      version: 1 as const,
      canvas: { width: 1024, height: 1024 },
      background: '#ffffff00',
      fonts: [],
      items: [createRectangleItem({ id: 'legacy-item', zIndex: 0 })],
    };

    const parsed = parseProjectDocument(legacy);

    expect(parsed.version).toBe(2);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]).toMatchObject({ id: 'legacy-item', kind: 'rectangle' });
  });

  it('rejects unsupported document versions', () => {
    expect(() =>
      parseProjectDocument({
        version: 3,
      })
    ).toThrow();
  });

  it('rejects malformed recursive payloads that do not satisfy the file DTO schema', () => {
    expect(() =>
      parseProjectDocument({
        version: 2,
        canvas: { width: 1024, height: 1024 },
        background: '#ffffff00',
        fonts: [],
        nodes: [
          {
            kind: 'group',
            id: '',
            name: '',
            opacity: 1,
            children: [],
          },
        ],
      })
    ).toThrow();
  });

  it('parses and preserves explicit text vertical alignment values', () => {
    const document = createDefaultProjectDocument();
    document.nodes = [createTextItem({ verticalAlign: 'bottom' })];

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.nodes[0]).toMatchObject({
      kind: 'text',
      verticalAlign: 'bottom',
    });
  });

  it('serializes and parses image adjustments in saved project files', () => {
    const document = createDefaultProjectDocument();
    document.nodes = [
      createImageItem({
        src: 'data:image/png;base64,AAA',
        mimeType: 'image/png',
        originalWidth: 40,
        originalHeight: 20,
      }),
    ];
    if (document.nodes[0]?.kind !== 'image') {
      throw new Error('Expected image item');
    }
    document.nodes[0].adjustments = {
      brightness: 120,
      contrast: 30,
      tintColor: '#336699',
      tintStrength: 80,
    };
    document.nodes[0].mirrorHorizontal = true;
    document.nodes[0].crop = {
      x: 4,
      y: 2,
      width: 30,
      height: 12,
    };

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.nodes[0]).toMatchObject({
      kind: 'image',
      mirrorHorizontal: true,
      crop: {
        x: 4,
        y: 2,
        width: 30,
        height: 12,
      },
      adjustments: {
        brightness: 120,
        contrast: 30,
        tintColor: '#336699',
        tintStrength: 80,
      },
    });
  });

  it('serializes and parses text padding in saved project files', () => {
    const document = createDefaultProjectDocument();
    document.nodes = [
      createTextItem({
        padding: { top: 12, right: 18, bottom: 24, left: 30 },
        gradientEnabled: true,
        secondaryFill: '#336699ff',
      }),
    ];

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.nodes[0]).toMatchObject({
      kind: 'text',
      padding: {
        top: 12,
        right: 18,
        bottom: 24,
        left: 30,
      },
      gradientEnabled: true,
      secondaryFill: '#336699ff',
    });
  });

  it('defaults missing text padding when loading older saved files', () => {
    const legacyTextItem = createTextItem();
    const {
      padding: ignoredPadding,
      secondaryFill: ignoredSecondaryFill,
      gradientEnabled: ignoredGradientEnabled,
      ...legacyPayload
    } = legacyTextItem;
    void ignoredPadding;
    void ignoredSecondaryFill;
    void ignoredGradientEnabled;

    const parsed = parseProjectDocument({
      version: 1,
      canvas: { width: 1024, height: 1024 },
      background: '#ffffff00',
      fonts: [],
      items: [legacyPayload],
    });

    expect(parsed.nodes[0]).toMatchObject({
      kind: 'text',
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      gradientEnabled: false,
      secondaryFill: legacyTextItem.fill,
    });
  });

  it('does not serialize selection into saved project files', () => {
    const document = createDefaultProjectDocument();
    document.nodes = [createRectangleItem({ id: 'selected-item' })];

    const serialized = JSON.parse(serializeProjectDocument(document));

    expect(serialized.selectedNodeIds).toBeUndefined();
  });

  it('defaults missing image crop data when loading older saved files', () => {
    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    const { crop: ignoredCrop, ...legacyPayload } = imageItem;
    void ignoredCrop;

    const parsed = parseProjectDocument({
      version: 1,
      canvas: { width: 1024, height: 1024 },
      background: '#ffffff00',
      fonts: [],
      items: [legacyPayload],
    });

    expect(parsed.nodes[0]).toMatchObject({
      kind: 'image',
      crop: {
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      },
    });
  });

  it('defaults missing image mirror data when loading older saved files', () => {
    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    const { mirrorHorizontal: ignoredMirrorHorizontal, ...legacyPayload } = imageItem;
    void ignoredMirrorHorizontal;

    const parsed = parseProjectDocument({
      version: 1,
      canvas: { width: 1024, height: 1024 },
      background: '#ffffff00',
      fonts: [],
      items: [legacyPayload],
    });

    expect(parsed.nodes[0]).toMatchObject({
      kind: 'image',
      mirrorHorizontal: false,
    });
  });

  it('defaults missing gradient fields for legacy rectangle payloads', () => {
    const rectangle = createRectangleItem({ fill: '#123456ff' });
    const {
      secondaryFill: ignoredSecondaryFill,
      gradientEnabled: ignoredGradientEnabled,
      ...legacyPayload
    } = rectangle;
    void ignoredSecondaryFill;
    void ignoredGradientEnabled;

    const parsed = parseProjectDocument({
      version: 1,
      canvas: { width: 1024, height: 1024 },
      background: '#ffffff00',
      fonts: [],
      items: [legacyPayload],
    });

    expect(parsed.nodes[0]).toMatchObject({
      kind: 'rectangle',
      fill: '#123456ff',
      gradientEnabled: false,
      secondaryFill: '#123456ff',
    });
  });
});
