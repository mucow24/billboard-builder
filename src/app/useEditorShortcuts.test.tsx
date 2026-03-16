import { createEvent, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  APP_CLIPBOARD_MIME_TYPE,
  writeSelectionToClipboardData,
} from './clipboard';
import {
  DUPLICATE_ITEM_OFFSET,
  createRectangleItem,
} from '../editor/document/documentDefaults';
import { useEditorShortcuts } from './useEditorShortcuts';

function makeClipboardItem(file: File | null, type = file?.type ?? 'image/png'): DataTransferItem {
  return {
    kind: file ? 'file' : 'string',
    type,
    getAsFile: () => file,
  } as DataTransferItem;
}

function makeClipboardData({
  initialData = {},
  items = [],
  files = [],
}: {
  initialData?: Record<string, string>;
  items?: DataTransferItem[];
  files?: File[];
} = {}): DataTransfer {
  const data = new Map(Object.entries(initialData));

  return {
    items,
    files,
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
  } as unknown as DataTransfer;
}

function dispatchPaste(target: HTMLElement, clipboardData: DataTransfer) {
  const event = createEvent.paste(target, { clipboardData });
  return fireEvent(target, event);
}

function dispatchCopy(target: HTMLElement, clipboardData?: DataTransfer) {
  const event = createEvent.copy(target, clipboardData ? { clipboardData } : {});
  return fireEvent(target, event);
}

function dispatchCut(target: HTMLElement, clipboardData?: DataTransfer) {
  const event = createEvent.cut(target, clipboardData ? { clipboardData } : {});
  return fireEvent(target, event);
}

function createShortcutHarness() {
  const dispatch = vi.fn();
  const onPasteImageFile = vi.fn();

  const args: Parameters<typeof useEditorShortcuts>[0] = {
    deleteSelectedItems: vi.fn(),
    dispatch,
    onPasteImageFile,
    redo: vi.fn(),
    reorderSelectedItem: vi.fn(),
    selectedItem: null,
    setActiveTool: vi.fn(),
    undo: vi.fn(),
  };

  return {
    args,
    deleteSelectedItems: args.deleteSelectedItems,
    dispatch,
    onPasteImageFile,
  };
}

describe('useEditorShortcuts', () => {
  it('writes the selected item to the clipboard on copy and prevents default', () => {
    const selectedItem = createRectangleItem({ x: 40, y: 60 });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData();
    harness.args.selectedItem = selectedItem;

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchCopy(document.body, clipboardData);

    expect(wasUnhandled).toBe(false);
    expect(clipboardData.getData(APP_CLIPBOARD_MIME_TYPE)).not.toBe('');
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(harness.deleteSelectedItems).not.toHaveBeenCalled();
  });

  it('writes the selected item to the clipboard on cut and deletes after a successful write', () => {
    const selectedItem = createRectangleItem({ x: 40, y: 60 });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData();
    harness.args.selectedItem = selectedItem;

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchCut(document.body, clipboardData);

    expect(wasUnhandled).toBe(false);
    expect(clipboardData.getData(APP_CLIPBOARD_MIME_TYPE)).not.toBe('');
    expect(harness.deleteSelectedItems).toHaveBeenCalledOnce();
  });

  it('does not delete on cut when clipboard data is unavailable', () => {
    const harness = createShortcutHarness();
    harness.args.selectedItem = createRectangleItem({ x: 40, y: 60 });

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchCut(document.body);

    expect(wasUnhandled).toBe(true);
    expect(harness.deleteSelectedItems).not.toHaveBeenCalled();
  });

  it('does not delete on cut when clipboard writing throws', () => {
    const harness = createShortcutHarness();
    harness.args.selectedItem = createRectangleItem({ x: 40, y: 60 });
    const clipboardData = {
      getData: () => '',
      items: [],
      files: [],
      setData: () => {
        throw new Error('write failed');
      },
    } as unknown as DataTransfer;

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchCut(document.body, clipboardData);

    expect(wasUnhandled).toBe(true);
    expect(harness.deleteSelectedItems).not.toHaveBeenCalled();
  });

  it('imports a clipboard image when the app clipboard is empty', () => {
    const harness = createShortcutHarness();
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchPaste(
      document.body,
      makeClipboardData({ items: [makeClipboardItem(imageFile)] })
    );

    expect(wasUnhandled).toBe(false);
    expect(harness.onPasteImageFile).toHaveBeenCalledWith(imageFile);
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it('prefers the app clipboard payload over an image file when both are present', () => {
    const copiedItem = createRectangleItem({ x: 10, y: 20 });
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData({
      items: [makeClipboardItem(imageFile)],
    });

    writeSelectionToClipboardData(clipboardData, [copiedItem]);

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchPaste(document.body, clipboardData);

    expect(wasUnhandled).toBe(false);
    expect(harness.onPasteImageFile).not.toHaveBeenCalled();
    expect(harness.dispatch).toHaveBeenCalledOnce();

    const command = harness.dispatch.mock.calls[0][0];
    expect(command).toMatchObject({
      type: 'add_item',
      item: expect.objectContaining({
        kind: 'rectangle',
        x: copiedItem.x + DUPLICATE_ITEM_OFFSET,
        y: copiedItem.y + DUPLICATE_ITEM_OFFSET,
      }),
    });
    expect(command.item.id).not.toBe(copiedItem.id);
  });

  it('pastes every item from a valid app clipboard payload in order', () => {
    const firstItem = createRectangleItem({ id: 'first', x: 10, y: 20, zIndex: 0 });
    const secondItem = createRectangleItem({ id: 'second', x: 30, y: 40, zIndex: 1 });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData();

    writeSelectionToClipboardData(clipboardData, [firstItem, secondItem]);

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchPaste(document.body, clipboardData);

    expect(wasUnhandled).toBe(false);
    expect(harness.dispatch).toHaveBeenCalledTimes(2);
    expect(harness.dispatch.mock.calls[0][0]).toMatchObject({
      type: 'add_item',
      item: expect.objectContaining({
        kind: 'rectangle',
        x: firstItem.x + DUPLICATE_ITEM_OFFSET,
        y: firstItem.y + DUPLICATE_ITEM_OFFSET,
      }),
    });
    expect(harness.dispatch.mock.calls[1][0]).toMatchObject({
      type: 'add_item',
      item: expect.objectContaining({
        kind: 'rectangle',
        x: secondItem.x + DUPLICATE_ITEM_OFFSET,
        y: secondItem.y + DUPLICATE_ITEM_OFFSET,
      }),
    });
  });

  it('ignores paste events from editable targets', () => {
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData({
      items: [makeClipboardItem(imageFile)],
    });
    writeSelectionToClipboardData(clipboardData, [createRectangleItem({ x: 10, y: 20 })]);

    renderHook(() => useEditorShortcuts(harness.args));

    const input = document.createElement('input');
    document.body.appendChild(input);

    const wasUnhandled = dispatchPaste(input, clipboardData);

    expect(wasUnhandled).toBe(true);
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(harness.onPasteImageFile).not.toHaveBeenCalled();

    input.remove();
  });

  it('leaves unsupported paste content alone', () => {
    const harness = createShortcutHarness();

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchPaste(
      document.body,
      makeClipboardData({ items: [makeClipboardItem(null, 'text/plain')] })
    );

    expect(wasUnhandled).toBe(true);
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(harness.onPasteImageFile).not.toHaveBeenCalled();
  });
});
