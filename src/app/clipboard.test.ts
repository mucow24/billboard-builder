import { describe, expect, it } from 'vitest';

import {
  APP_CLIPBOARD_MIME_TYPE,
  readSelectionFromClipboardData,
  writeSelectionToClipboardData,
} from './clipboard';
import { createRectangleItem } from '../editor/document/documentDefaults';

function makeClipboardData(initialData: Record<string, string> = {}): DataTransfer {
  const data = new Map(Object.entries(initialData));

  return {
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
    items: [],
    files: [],
  } as unknown as DataTransfer;
}

describe('clipboard helpers', () => {
  it('writes a valid single-item selection payload', () => {
    const clipboardData = makeClipboardData();
    const item = createRectangleItem({ id: 'item-1' });

    const didWrite = writeSelectionToClipboardData(clipboardData, [item]);

    expect(didWrite).toBe(true);
    expect(JSON.parse(clipboardData.getData(APP_CLIPBOARD_MIME_TYPE))).toEqual({
      version: 2,
      nodes: [item],
    });
  });

  it('reads a valid single-item selection payload', () => {
    const item = createRectangleItem({ id: 'item-1' });
    const clipboardData = makeClipboardData({
      [APP_CLIPBOARD_MIME_TYPE]: JSON.stringify({
        version: 2,
        nodes: [item],
      }),
    });

    expect(readSelectionFromClipboardData(clipboardData)).toEqual([item]);
  });

  it('reads a valid multi-item selection payload', () => {
    const firstItem = createRectangleItem({ id: 'item-1' });
    const secondItem = createRectangleItem({ id: 'item-2', x: 320, y: 240, zIndex: 1 });
    const clipboardData = makeClipboardData({
      [APP_CLIPBOARD_MIME_TYPE]: JSON.stringify({
        version: 2,
        nodes: [firstItem, secondItem],
      }),
    });

    expect(readSelectionFromClipboardData(clipboardData)).toEqual([firstItem, secondItem]);
  });

  it('returns null for unsupported or invalid clipboard payloads', () => {
    const invalidPayloads = [
      '',
      '{',
      JSON.stringify({ version: 2, items: [] }),
      JSON.stringify({ version: 2, nodes: [{ id: '' }] }),
    ];

    for (const payload of invalidPayloads) {
      const clipboardData = makeClipboardData({
        [APP_CLIPBOARD_MIME_TYPE]: payload,
      });

      expect(readSelectionFromClipboardData(clipboardData)).toBeNull();
    }
  });
});
