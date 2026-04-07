import { createEvent, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  APP_CLIPBOARD_MIME_TYPE,
  writeSelectionToClipboardData,
} from './clipboard';
import {
  createDefaultProjectDocument,
  DUPLICATE_ITEM_OFFSET,
  createLineItem,
  createRectangleItem,
} from '../editor/document/documentDefaults';
import type { CanvasItem } from '../editor/document/documentTypes';
import { useEditorShortcuts } from './useEditorShortcuts';
import { resetEditorStore } from '../test/editorStore';

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

function selectItemsInStore(items: CanvasItem[]) {
  resetEditorStore({
    document: {
      ...createDefaultProjectDocument(),
      nodes: items,
    },
    session: {
      selectedNodeIds: items.map((item) => item.id),
    },
  });
}

function createShortcutHarness() {
  const applyTransaction = vi.fn();
  const deleteSelectedNodes = vi.fn();
  const duplicateSelectedNodes = vi.fn();
  const groupSelectedNodes = vi.fn();
  const nudgeSelectedNodes = vi.fn();
  const onPasteImageFile = vi.fn();
  const redo = vi.fn();
  const reorderSelectedNode = vi.fn();
  const selectAllNodes = vi.fn();
  const selectParentNode = vi.fn().mockReturnValue(false);
  const setActiveTool = vi.fn();
  const toggleInspectorTab = vi.fn();
  const undo = vi.fn();
  const ungroupSelectedNode = vi.fn();

  const args: Parameters<typeof useEditorShortcuts>[0] = {
    applyTransaction,
    deleteSelectedNodes,
    duplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedNodes,
    onPasteImageFile,
    redo,
    reorderSelectedNode,
    selectAllNodes,
    selectParentNode,
    setActiveTool,
    toggleInspectorTab,
    undo,
    ungroupSelectedNode,
  };

  return {
    applyTransaction,
    args,
    deleteSelectedNodes,
    duplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedNodes,
    onPasteImageFile,
    redo,
    reorderSelectedNode,
    selectAllNodes,
    selectParentNode,
    setActiveTool,
    toggleInspectorTab,
    undo,
    ungroupSelectedNode,
  };
}

describe('useEditorShortcuts', () => {
  it('writes the selected item to the clipboard on copy and prevents default', () => {
    const selectedItem = createRectangleItem({ x: 40, y: 60 });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData();
    selectItemsInStore([selectedItem]);

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchCopy(document.body, clipboardData);

    expect(wasUnhandled).toBe(false);
    expect(clipboardData.getData(APP_CLIPBOARD_MIME_TYPE)).not.toBe('');
    expect(harness.applyTransaction).not.toHaveBeenCalled();
    expect(harness.deleteSelectedNodes).not.toHaveBeenCalled();
  });

  it('writes the selected item to the clipboard on cut and deletes after a successful write', () => {
    const selectedItem = createRectangleItem({ x: 40, y: 60 });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData();
    selectItemsInStore([selectedItem]);

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchCut(document.body, clipboardData);

    expect(wasUnhandled).toBe(false);
    expect(clipboardData.getData(APP_CLIPBOARD_MIME_TYPE)).not.toBe('');
    expect(harness.deleteSelectedNodes).toHaveBeenCalledOnce();
  });

  it('does not delete on cut when clipboard data is unavailable', () => {
    const harness = createShortcutHarness();
    selectItemsInStore([createRectangleItem({ x: 40, y: 60 })]);

    renderHook(() => useEditorShortcuts(harness.args));

    const wasUnhandled = dispatchCut(document.body);

    expect(wasUnhandled).toBe(true);
    expect(harness.deleteSelectedNodes).not.toHaveBeenCalled();
  });

  it('does not delete on cut when clipboard writing throws', () => {
    const harness = createShortcutHarness();
    selectItemsInStore([createRectangleItem({ x: 40, y: 60 })]);
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
    expect(harness.deleteSelectedNodes).not.toHaveBeenCalled();
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
    expect(harness.applyTransaction).not.toHaveBeenCalled();
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
    expect(harness.applyTransaction).toHaveBeenCalledOnce();
    expect(harness.applyTransaction.mock.calls[0][0]).toEqual([
      {
        family: 'document',
        command: {
          type: 'insert_nodes',
          nodes: [
            expect.objectContaining({
              kind: 'rectangle',
              x: copiedItem.x + DUPLICATE_ITEM_OFFSET,
              y: copiedItem.y + DUPLICATE_ITEM_OFFSET,
            }),
          ],
        },
      },
      {
        family: 'selection',
        command: {
          type: 'select_nodes',
          nodeIds: [expect.any(String)],
        },
      },
    ]);
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
    expect(harness.applyTransaction).toHaveBeenCalledOnce();
    expect(harness.applyTransaction.mock.calls[0][0]).toEqual([
      {
        family: 'document',
        command: {
          type: 'insert_nodes',
          nodes: [
            expect.objectContaining({
              kind: 'rectangle',
              x: firstItem.x + DUPLICATE_ITEM_OFFSET,
              y: firstItem.y + DUPLICATE_ITEM_OFFSET,
            }),
            expect.objectContaining({
              kind: 'rectangle',
              x: secondItem.x + DUPLICATE_ITEM_OFFSET,
              y: secondItem.y + DUPLICATE_ITEM_OFFSET,
            }),
          ],
        },
      },
      {
        family: 'selection',
        command: {
          type: 'select_nodes',
          nodeIds: [expect.any(String), expect.any(String)],
        },
      },
    ]);
  });


  it('offsets repeated pastes cumulatively for the same clipboard payload', () => {
    const copiedItem = createRectangleItem({ x: 10, y: 20 });
    const harness = createShortcutHarness();
    const clipboardData = makeClipboardData();

    writeSelectionToClipboardData(clipboardData, [copiedItem]);

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchPaste(document.body, clipboardData);
    dispatchPaste(document.body, clipboardData);

    expect(harness.applyTransaction).toHaveBeenCalledTimes(2);
    expect(harness.applyTransaction.mock.calls[0][0][0]).toMatchObject({
      family: 'document',
      command: {
        type: 'insert_nodes',
        nodes: [
          expect.objectContaining({
            x: copiedItem.x + DUPLICATE_ITEM_OFFSET,
            y: copiedItem.y + DUPLICATE_ITEM_OFFSET,
          }),
        ],
      },
    });
    expect(harness.applyTransaction.mock.calls[1][0][0]).toMatchObject({
      family: 'document',
      command: {
        type: 'insert_nodes',
        nodes: [
          expect.objectContaining({
            x: copiedItem.x + DUPLICATE_ITEM_OFFSET * 2,
            y: copiedItem.y + DUPLICATE_ITEM_OFFSET * 2,
          }),
        ],
      },
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
    expect(harness.applyTransaction).not.toHaveBeenCalled();
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
    expect(harness.applyTransaction).not.toHaveBeenCalled();
    expect(harness.onPasteImageFile).not.toHaveBeenCalled();
  });

  it('handles keyboard shortcuts for history, selection, reordering, tools, and escape', () => {
    const harness = createShortcutHarness();

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
    expect(harness.selectAllNodes).toHaveBeenCalledOnce();
    expect(harness.reorderSelectedNode).toHaveBeenNthCalledWith(1, 'forward');
    expect(harness.reorderSelectedNode).toHaveBeenNthCalledWith(2, 'back');
    expect(harness.setActiveTool).toHaveBeenNthCalledWith(1, 'text');
    expect(harness.applyTransaction).toHaveBeenLastCalledWith([
      { family: 'selection', command: { type: 'clear_selection' } },
    ]);
    expect(harness.setActiveTool).toHaveBeenLastCalledWith('select');
  });

  it('nudges selected items through the dedicated store helper', () => {
    const harness = createShortcutHarness();
    selectItemsInStore([createLineItem(), createRectangleItem()]);

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchKeyDown(document.body, { key: 'ArrowRight' });
    dispatchKeyDown(document.body, { key: 'ArrowUp', shiftKey: true });

    expect(harness.nudgeSelectedNodes).toHaveBeenNthCalledWith(1, 1, 0);
    expect(harness.nudgeSelectedNodes).toHaveBeenNthCalledWith(2, 0, -5);
  });

  it('ignores keyboard shortcuts from editable targets', () => {
    const harness = createShortcutHarness();

    renderHook(() => useEditorShortcuts(harness.args));

    const input = document.createElement('input');
    document.body.appendChild(input);

    dispatchKeyDown(input, { key: 'a', ctrlKey: true });
    dispatchKeyDown(input, { key: 'Delete' });
    dispatchKeyDown(input, { key: 'Escape' });

    expect(harness.selectAllNodes).not.toHaveBeenCalled();
    expect(harness.deleteSelectedNodes).not.toHaveBeenCalled();
    expect(harness.setActiveTool).not.toHaveBeenCalled();

    input.remove();
  });

  it('climbs to the parent selection on Escape before clearing the canvas selection', () => {
    const harness = createShortcutHarness();
    harness.selectParentNode.mockReturnValue(true);
    selectItemsInStore([createRectangleItem({ id: 'child' })]);

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchKeyDown(document.body, { key: 'Escape' });

    expect(harness.selectParentNode).toHaveBeenCalledOnce();
    expect(harness.applyTransaction).not.toHaveBeenCalled();
    expect(harness.setActiveTool).not.toHaveBeenCalled();
  });

  it('toggles the inspector tabs with the 1, 2, and 3 digit keys', () => {
    const harness = createShortcutHarness();

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchKeyDown(document.body, { key: '1' });
    dispatchKeyDown(document.body, { key: '2' });
    dispatchKeyDown(document.body, { key: '3' });

    expect(harness.toggleInspectorTab).toHaveBeenNthCalledWith(1, 'properties');
    expect(harness.toggleInspectorTab).toHaveBeenNthCalledWith(2, 'layers');
    expect(harness.toggleInspectorTab).toHaveBeenNthCalledWith(3, 'favorites');
    expect(harness.setActiveTool).not.toHaveBeenCalled();
  });

  it('does not toggle inspector tabs when a modifier key is held', () => {
    const harness = createShortcutHarness();

    renderHook(() => useEditorShortcuts(harness.args));

    dispatchKeyDown(document.body, { key: '1', ctrlKey: true });
    dispatchKeyDown(document.body, { key: '2', metaKey: true });

    expect(harness.toggleInspectorTab).not.toHaveBeenCalled();
  });

  it('does not toggle inspector tabs when typing in an editable target', () => {
    const harness = createShortcutHarness();

    renderHook(() => useEditorShortcuts(harness.args));

    const input = document.createElement('input');
    document.body.appendChild(input);

    dispatchKeyDown(input, { key: '1' });
    dispatchKeyDown(input, { key: '2' });
    dispatchKeyDown(input, { key: '3' });

    expect(harness.toggleInspectorTab).not.toHaveBeenCalled();

    input.remove();
  });
});
