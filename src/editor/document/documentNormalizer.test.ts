import { describe, expect, it } from 'vitest';

import { createLineItem, createRectangleItem, createTextItem } from './documentDefaults';
import { normalizeProjectDocument } from './documentNormalizer';

describe('document normalizer', () => {
  it('normalizes item ordering, shadows, and font entries', () => {
    const normalized = normalizeProjectDocument({
      version: 1,
      items: [
        {
          ...createRectangleItem({ zIndex: 4 }),
          shadow: { color: '#000000ff' },
        } as ReturnType<typeof createRectangleItem>,
        createTextItem({ zIndex: 1 }),
        createLineItem({ zIndex: 2 }),
      ],
      fonts: [
        { family: 'System Sans', sourceName: 'system', kind: 'system' },
        { family: 123 as unknown as string, sourceName: 'broken', kind: 'uploaded' },
      ],
    });

    expect(normalized.items.map((item) => item.zIndex)).toEqual([0, 1, 2]);
    expect(normalized.items[0]).toMatchObject({ kind: 'text' });
    expect(normalized.items[1]).toMatchObject({ kind: 'line' });
    expect(normalized.items[2]).toMatchObject({
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
});
