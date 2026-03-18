import { createEvent, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  APP_CLIPBOARD_MIME_TYPE,
  writeSelectionToClipboardData,
} from './clipboard';
import {
  DUPLICATE_ITEM_OFFSET,
  createLineItem,
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

function dispatchKeyDown(target: HTMLElement, options: KeyboardEventInit) {
  const event = createEvent.keyDown(target, options);
  return fireEvent(target, event);
}

function createShortcutHarness() {
  const dispatch = vi.fn();
  const onPasteImageFile = vi.fn();
  const redo = vi.fn();
  const reorderSelectedItem = vi.fn();
  const setActiveTool = vi.fn();
  const undo = vi.fn();

  const args: Parameters<typeof useEditorShortcuts>[0] = {
    deleteSelectedItems: vi.fn(),
    dispatch,
    onPasteImageFile,
    redo,
    reorderSelectedItem,
    selectedItem: null,
    setActiveTool,
    undo,
  };

  return {
    args,
    deleteSelectedItems: args.deleteSelectedItems,
    dispatch,
    onPasteImageFile,
    redo,
    reorderSelectedItem,
    setActiveTool,
    undo,
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


  it('offsets repeated pastes cumulatively for the same clipboard payload', () => {
    const copiedItem = createRectangleItem({ x: 10, y: 20 });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData();

    writeSelectionToClipboardData(clipboardData, [copiedItem]);

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchPaste(document.body, clipboardData);
    dispatchPaste(document.body, clipboardData);

    expect(harness.dispatch).toHaveBeenCalledTimes(2);
    expect(harness.dispatch.mock.calls[0][0]).toMatchObject({
      type: 'add_item',
      item: expect.objectContaining({
        x: copiedItem.x + DUPLICATE_ITEM_OFFSET,
        y: copiedItem.y + DUPLICATE_ITEM_OFFSET,
      }),
    });
    expect(harness.dispatch.mock.calls[1][0]).toMatchObject({
      type: 'add_item',
      item: expect.objectContaining({
        x: copiedItem.x + DUPLICATE_ITEM_OFFSET * 2,
        y: copiedItem.y + DUPLICATE_ITEM_OFFSET * 2,
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

  it('handles keyboard shortcuts for history, selection, reordering, tools, and escape', () => {
    const harness = createShortcutHarness();
    harness.args.selectAllItems = vi.fn();

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchKeyDown(document.body, { key: 'z', ctrlKey: true });
    dispatchKeyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    dispatchKeyDown(document.body, { key: 'y', ctrlKey: true });
    dispatchKeyDown(document.body, { key: 'a', ctrlKey: true });
    dispatchKeyDown(document.body, { key: 'ArrowUp', ctrlKey: true });
    dispatchKeyDown(document.body, { key: 'ArrowDown', ctrlKey: true, shiftKey: true });
    dispatchKeyDown(document.body, { key: 't' });
    dispatchKeyDown(document.body, { key: 'Escape' });

    expect(harness.undo).toHaveBeenCalledOnce();
    expect(harness.redo).toHaveBeenCalledTimes(2);
    expect(harness.args.selectAllItems).toHaveBeenCalledOnce();
    expect(harness.reorderSelectedItem).toHaveBeenNthCalledWith(1, 'forward');
    expect(harness.reorderSelectedItem).toHaveBeenNthCalledWith(2, 'back');
    expect(harness.setActiveTool).toHaveBeenNthCalledWith(1, 'text');
    expect(harness.dispatch).toHaveBeenLastCalledWith({ type: 'clear_selection' });
    expect(harness.setActiveTool).toHaveBeenLastCalledWith('select');
  });

  it('nudges selected items through the dispatch fallback when no store helper is provided', () => {
    const harness = createShortcutHarness();
    const line = createLineItem({
      id: 'line',
      startX: 10,
      startY: 20,
      endX: 30,
      endY: 40,
    });
    const rectangle = createRectangleItem({ id: 'rect', x: 50, y: 60 });
    harness.args.selectedItems = [line, rectangle];

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchKeyDown(document.body, { key: 'ArrowRight' });
    dispatchKeyDown(document.body, { key: 'ArrowUp', shiftKey: true });

    expect(harness.dispatch).toHaveBeenNthCalledWith(1, {
      type: 'update_item',
      itemId: 'line',
      changes: {
        startX: 11,
        startY: 20,
        endX: 31,
        endY: 40,
      },
    });
    expect(harness.dispatch).toHaveBeenNthCalledWith(2, {
      type: 'update_item',
      itemId: 'rect',
      changes: {
        x: 51,
        y: 60,
      },
    });
    expect(harness.dispatch).toHaveBeenNthCalledWith(3, {
      type: 'update_item',
      itemId: 'line',
      changes: {
        startX: 10,
        startY: 15,
        endX: 30,
        endY: 35,
      },
    });
    expect(harness.dispatch).toHaveBeenNthCalledWith(4, {
      type: 'update_item',
      itemId: 'rect',
      changes: {
        x: 50,
        y: 55,
      },
    });
  });

  it('ignores keyboard shortcuts from editable targets', () => {
    const harness = createShortcutHarness();
    harness.args.selectAllItems = vi.fn();

    renderHook(() => useEditorShortcuts(harness.args));

    const input = document.createElement('input');
    document.body.appendChild(input);

    dispatchKeyDown(input, { key: 'a', ctrlKey: true });
    dispatchKeyDown(input, { key: 'Delete' });
    dispatchKeyDown(input, { key: 'Escape' });

    expect(harness.args.selectAllItems).not.toHaveBeenCalled();
    expect(harness.deleteSelectedItems).not.toHaveBeenCalled();
    expect(harness.setActiveTool).not.toHaveBeenCalled();

    input.remove();
  });
});
