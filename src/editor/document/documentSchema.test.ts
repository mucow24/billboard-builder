import { describe, expect, it } from 'vitest';

import {
  createDefaultProjectDocument,
  createImageItem,
  createRectangleItem,
  createTextItem,
} from './documentDefaults';
import { parseProjectDocument, serializeProjectDocument } from './documentSchema';

describe('document schema', () => {
  it('round-trips a valid project document and normalizes item order', () => {
    const document = createDefaultProjectDocument();
    const firstItem = createRectangleItem({ zIndex: 4 });
    const secondItem = createRectangleItem({ zIndex: 2 });

    document.items = [firstItem, secondItem];

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.items.map((item) => item.zIndex)).toEqual([0, 1]);
  });

  it('rejects unsupported document versions', () => {
    expect(() =>
      parseProjectDocument({
        version: 2 as 1,
      })
    ).toThrow();
  });

  it('rejects malformed item payloads that do not satisfy the file DTO schema', () => {
    expect(() =>
      parseProjectDocument({
        version: 1,
        canvas: { width: 1024, height: 1024 },
        background: '#ffffff00',
        fonts: [],
        items: [
          {
            ...createRectangleItem(),
            name: '',
            locked: undefined,
          },
        ],
      })
    ).toThrow();
  });

  it('parses and preserves explicit text vertical alignment values', () => {
    const document = createDefaultProjectDocument();
    document.items = [createTextItem({ verticalAlign: 'bottom' })];

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.items[0]).toMatchObject({
      kind: 'text',
      verticalAlign: 'bottom',
    });
  });


  it('serializes and parses image adjustments in saved project files', () => {
    const document = createDefaultProjectDocument();
    document.items = [
      createImageItem({
        src: 'data:image/png;base64,AAA',
        mimeType: 'image/png',
        originalWidth: 40,
        originalHeight: 20,
      }),
    ];
    if (document.items[0]?.kind !== 'image') {
      throw new Error('Expected image item');
    }
    document.items[0].adjustments = {
      brightness: 120,
      contrast: 30,
      tintColor: '#336699',
      tintStrength: 80,
    };

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.items[0]).toMatchObject({
      kind: 'image',
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
    document.items = [
      createTextItem({
        padding: { top: 12, right: 18, bottom: 24, left: 30 },
      }),
    ];

    const parsed = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsed.items[0]).toMatchObject({
      kind: 'text',
      padding: {
        top: 12,
        right: 18,
        bottom: 24,
        left: 30,
      },
    });
  });

  it('defaults missing text padding when loading older saved files', () => {
    const legacyTextItem = createTextItem();
    const { padding: ignoredPadding, ...legacyPayload } = legacyTextItem;
    void ignoredPadding;

    const parsed = parseProjectDocument({
      version: 1,
      canvas: { width: 1024, height: 1024 },
      background: '#ffffff00',
      fonts: [],
      items: [legacyPayload],
    });

    expect(parsed.items[0]).toMatchObject({
      kind: 'text',
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    });
  });

  it('does not serialize selection into saved project files', () => {
    const document = createDefaultProjectDocument();
    document.items = [createRectangleItem({ id: 'selected-item' })];

    const serialized = JSON.parse(serializeProjectDocument(document));

    expect(serialized.selectedItemIds).toBeUndefined();
  });
});
