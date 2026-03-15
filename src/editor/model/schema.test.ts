import { describe, expect, it } from 'vitest';

import {
  createDefaultProjectDocument,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from './defaults';
import { migrateProjectDocument } from './migrations';
import { parseProjectDocument, serializeProjectDocument } from './schema';

describe('project document schema', () => {
  it('parses a valid document and keeps the item order normalized', () => {
    const document = createDefaultProjectDocument();
    const firstItem = createRectangleItem({ zIndex: 4 });
    const secondItem = createRectangleItem({ zIndex: 2 });

    document.items = [firstItem, secondItem];

    const parsedDocument = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsedDocument.items.map((item) => item.zIndex)).toEqual([0, 1]);
  });

  it('rejects unsupported document versions', () => {
    expect(() =>
      migrateProjectDocument({
        version: 2 as 1,
      })
    ).toThrow('Unsupported project version');
  });

  it('fills in missing legacy line endpoints and base item defaults during migration', () => {
    const migratedDocument = migrateProjectDocument({
      version: 1,
      items: [
        {
          ...createRectangleItem(),
          locked: undefined as unknown as boolean,
          hidden: undefined as unknown as boolean,
          opacity: undefined as unknown as number,
          name: '',
        },
        {
          ...createTextItem(),
          verticalAlign: undefined as unknown as 'top',
        },
        {
          ...createLineItem(),
          name: '',
          startX: undefined as unknown as number,
          startY: undefined as unknown as number,
          endX: undefined as unknown as number,
          endY: undefined as unknown as number,
        },
      ],
    });

    expect(migratedDocument.items[0]).toMatchObject({
      locked: false,
      hidden: false,
      opacity: 1,
      name: 'rectangle-1',
    });
    expect(migratedDocument.items[1]).toMatchObject({
      verticalAlign: 'top',
    });
    expect(migratedDocument.items[2]).toMatchObject({
      startX: migratedDocument.items[2].x,
      startY: migratedDocument.items[2].y,
      endX: migratedDocument.items[2].x + migratedDocument.items[2].width,
      endY: migratedDocument.items[2].y + migratedDocument.items[2].height,
      name: 'line-3',
    });
  });

  it('parses and preserves explicit text vertical alignment values', () => {
    const document = createDefaultProjectDocument();
    document.items = [createTextItem({ verticalAlign: 'bottom' })];

    const parsedDocument = parseProjectDocument(JSON.parse(serializeProjectDocument(document)));

    expect(parsedDocument.items[0]).toMatchObject({
      kind: 'text',
      verticalAlign: 'bottom',
    });
  });
});
