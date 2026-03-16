import { createEvent, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DUPLICATE_ITEM_OFFSET, createRectangleItem } from '../editor/document/documentDefaults';
import { useEditorShortcuts } from './useEditorShortcuts';

function makeClipboardItem(file: File | null, type = file?.type ?? 'image/png'): DataTransferItem {
  return {
    kind: file ? 'file' : 'string',
    type,
    getAsFile: () => file,
  } as DataTransferItem;
}

function makeClipboardData({
  items = [],
  files = [],
}: {
  items?: DataTransferItem[];
  files?: File[];
} = {}): DataTransfer {
  return {
    items,
    files,
  } as unknown as DataTransfer;
}

function dispatchPaste(target: HTMLElement, clipboardData: DataTransfer) {
  const event = createEvent.paste(target, { clipboardData });
  return fireEvent(target, event);
}

function createShortcutHarness() {
  const dispatch = vi.fn();
  const onPasteImageFile = vi.fn();

  const args: Parameters<typeof useEditorShortcuts>[0] = {
    clipboardItem: null,
    deleteSelectedItems: vi.fn(),
    dispatch,
    onPasteImageFile,
    redo: vi.fn(),
    reorderSelectedItem: vi.fn(),
    selectedItem: null,
    setActiveTool: vi.fn(),
    setClipboardItem: vi.fn(),
    undo: vi.fn(),
  };

  return {
    args,
    dispatch,
    onPasteImageFile,
  };
}

describe('useEditorShortcuts', () => {
  it('pastes the internal clipboard item and prevents default', () => {
    const clipboardItem = createRectangleItem({ x: 40, y: 60 });
    const harness = createShortcutHarness();
    harness.args.clipboardItem = clipboardItem;

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchPaste(document.body, makeClipboardData());

    expect(wasUnhandled).toBe(false);
    expect(harness.dispatch).toHaveBeenCalledOnce();

    const command = harness.dispatch.mock.calls[0][0];
    expect(command).toMatchObject({
      type: 'add_item',
      item: expect.objectContaining({
        kind: 'rectangle',
        x: clipboardItem.x + DUPLICATE_ITEM_OFFSET,
        y: clipboardItem.y + DUPLICATE_ITEM_OFFSET,
      }),
    });
    expect(command.item.id).not.toBe(clipboardItem.id);
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

  it('prefers the internal clipboard item over a system clipboard image', () => {
    const clipboardItem = createRectangleItem({ x: 10, y: 20 });
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const harness = createShortcutHarness();
    harness.args.clipboardItem = clipboardItem;

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchPaste(
      document.body,
      makeClipboardData({ items: [makeClipboardItem(imageFile)] })
    );

    expect(wasUnhandled).toBe(false);
    expect(harness.dispatch).toHaveBeenCalledOnce();
    expect(harness.onPasteImageFile).not.toHaveBeenCalled();
  });

  it('ignores paste events from editable targets', () => {
    const clipboardItem = createRectangleItem({ x: 10, y: 20 });
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const harness = createShortcutHarness();
    harness.args.clipboardItem = clipboardItem;

    renderHook(() => useEditorShortcuts(harness.args));

    const input = document.createElement('input');
    document.body.appendChild(input);

    const wasUnhandled = dispatchPaste(
      input,
      makeClipboardData({ items: [makeClipboardItem(imageFile)] })
    );

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
