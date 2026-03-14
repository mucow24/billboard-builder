import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createRectangleItem } from './defaults';
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
});
