import { useEffect, useMemo, useRef } from 'react';

import {
  APP_CLIPBOARD_MIME_TYPE,
  readSelectionFromClipboardData,
  writeSelectionToClipboardData,
} from './clipboard';
import { cloneCanvasItem, DUPLICATE_ITEM_OFFSET } from '../editor/document/documentDefaults';
import { getFirstImageFileFromClipboardData } from '../editor/io/images';
import type { CanvasItem, CanvasTool } from '../editor/document/documentTypes';
import type { EditorStoreState } from '../editor/state/store';

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    Boolean(target.closest('[data-editor-interactive="true"]')) ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

interface UseEditorShortcutsArgs {
  applyTransaction?: EditorStoreState['applyTransaction'];
  deleteSelectedItems: EditorStoreState['deleteSelectedItems'];
  dispatch?: EditorStoreState['dispatch'];
  duplicateSelectedItems?: EditorStoreState['duplicateSelectedItems'];
  nudgeSelectedItems?: EditorStoreState['nudgeSelectedItems'];
  onPasteImageFile: (file: File) => void | Promise<void>;
  redo: EditorStoreState['redo'];
  selectedItem?: CanvasItem | null;
  selectedItems?: CanvasItem[];
  setActiveTool: EditorStoreState['setActiveTool'];
  selectAllItems?: EditorStoreState['selectAllItems'];
  undo: EditorStoreState['undo'];
  reorderSelectedItem: EditorStoreState['reorderSelectedItem'];
}

export function useEditorShortcuts({
  applyTransaction,
  deleteSelectedItems,
  dispatch,
  duplicateSelectedItems,
  nudgeSelectedItems,
  onPasteImageFile,
  redo,
  selectedItem,
  selectedItems,
  setActiveTool,
  selectAllItems,
  undo,
  reorderSelectedItem,
}: UseEditorShortcutsArgs) {
  const resolvedSelectedItems = useMemo(
    () => selectedItems ?? (selectedItem ? [selectedItem] : []),
    [selectedItem, selectedItems]
  );
  const pasteStateRef = useRef<{ payload: string; count: number } | null>(null);

  useEffect(() => {
    function runSelectionTransaction(itemIds: string[]) {
      if (applyTransaction) {
        applyTransaction([{ family: 'selection', command: { type: 'select_items', itemIds } }]);
        return;
      }
      dispatch?.({ type: 'select_items', itemIds });
    }

    function clearSelection() {
      if (applyTransaction) {
        applyTransaction([{ family: 'selection', command: { type: 'clear_selection' } }]);
        return;
      }
      dispatch?.({ type: 'clear_selection' });
    }

    function handleKeyDown(event: KeyboardEvent) {
      const hasModifier = event.ctrlKey || event.metaKey;
      const isEditable = isEditableTarget(event.target);
      const pressedKey = event.key.toLowerCase();

      if (hasModifier && pressedKey === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
          return;
        }
        undo();
        return;
      }
      if (hasModifier && pressedKey === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'a' && selectAllItems) {
        event.preventDefault();
        selectAllItems();
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'd') {
        event.preventDefault();
        if (duplicateSelectedItems) {
          duplicateSelectedItems();
        } else if (resolvedSelectedItems.length > 0 && applyTransaction) {
          const clones = resolvedSelectedItems.map((item) => cloneCanvasItem(item));
          applyTransaction([
            ...clones.map((item) => ({ family: 'document' as const, command: { type: 'add_item' as const, item } })),
            { family: 'selection' as const, command: { type: 'select_items' as const, itemIds: clones.map((item) => item.id) } },
          ]);
        }
        return;
      }
      if (hasModifier && !isEditable && event.key === 'ArrowUp') {
        event.preventDefault();
        reorderSelectedItem(event.shiftKey ? 'front' : 'forward');
        return;
      }
      if (hasModifier && !isEditable && event.key === 'ArrowDown') {
        event.preventDefault();
        reorderSelectedItem(event.shiftKey ? 'back' : 'backward');
        return;
      }
      if (!hasModifier && !isEditable && resolvedSelectedItems.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 1;
        const deltaX = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
        const deltaY = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
        if (nudgeSelectedItems) {
          nudgeSelectedItems(deltaX, deltaY);
        } else {
          for (const item of resolvedSelectedItems) {
            if (item.kind === 'line') {
              dispatch?.({
                type: 'update_item',
                itemId: item.id,
                changes: {
                  startX: item.startX + deltaX,
                  startY: item.startY + deltaY,
                  endX: item.endX + deltaX,
                  endY: item.endY + deltaY,
                },
              });
            } else {
              dispatch?.({ type: 'update_item', itemId: item.id, changes: { x: item.x + deltaX, y: item.y + deltaY } });
            }
          }
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (isEditable) {
          return;
        }
        event.preventDefault();
        deleteSelectedItems();
        return;
      }
      const hotkeyMap = new Map<string, CanvasTool>([
        ['v', 'select'],
        ['h', 'pan'],
        ['z', 'zoom'],
        ['t', 'text'],
        ['r', 'rectangle'],
        ['o', 'ellipse'],
        ['l', 'line'],
      ]);
      if (event.key === 'Escape') {
        if (isEditable) {
          return;
        }
        clearSelection();
        setActiveTool('select');
        return;
      }
      if (hasModifier || isEditable) {
        return;
      }
      const tool = hotkeyMap.get(pressedKey);
      if (tool) {
        setActiveTool(tool);
      }
    }

    function handleCopy(event: ClipboardEvent) {
      if (isEditableTarget(event.target) || resolvedSelectedItems.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, resolvedSelectedItems)) {
        return;
      }
      pasteStateRef.current = null;
      event.preventDefault();
    }

    function handleCut(event: ClipboardEvent) {
      if (isEditableTarget(event.target) || resolvedSelectedItems.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, resolvedSelectedItems)) {
        return;
      }
      pasteStateRef.current = null;
      event.preventDefault();
      deleteSelectedItems();
    }

    function handlePaste(event: ClipboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      const pastedItems = readSelectionFromClipboardData(event.clipboardData);
      if (pastedItems && pastedItems.length > 0) {
        const payload = event.clipboardData?.getData(APP_CLIPBOARD_MIME_TYPE) ?? '';
        const nextPasteCount = pasteStateRef.current?.payload === payload ? pasteStateRef.current.count + 1 : 1;
        pasteStateRef.current = { payload, count: nextPasteCount };
        event.preventDefault();
        const offset = DUPLICATE_ITEM_OFFSET * nextPasteCount;
        const clones = pastedItems.map((item) => cloneCanvasItem(item, offset));
        if (applyTransaction) {
          applyTransaction([
            ...clones.map((item) => ({ family: 'document' as const, command: { type: 'add_item' as const, item } })),
            { family: 'selection' as const, command: { type: 'select_items' as const, itemIds: clones.map((item) => item.id) } },
          ]);
        } else {
          for (const item of clones) {
            dispatch?.({ type: 'add_item', item });
          }
        }
        return;
      }

      const imageFile = getFirstImageFileFromClipboardData(event.clipboardData);
      if (imageFile) {
        event.preventDefault();
        void onPasteImageFile(imageFile);
        return;
      }

      if (!pastedItems || pastedItems.length === 0) {
        return;
      }

      event.preventDefault();
      const clones = pastedItems.map((item) => cloneCanvasItem(item));
      if (applyTransaction) {
        applyTransaction([
          ...clones.map((item) => ({ family: 'document' as const, command: { type: 'add_item' as const, item } })),
          { family: 'selection' as const, command: { type: 'select_items' as const, itemIds: clones.map((item) => item.id) } },
        ]);
      } else {
        for (const item of clones) {
          dispatch?.({ type: 'add_item', item });
        }
        runSelectionTransaction(clones.map((item) => item.id));
      }
    }

    window.document.addEventListener('keydown', handleKeyDown);
    window.document.addEventListener('copy', handleCopy);
    window.document.addEventListener('cut', handleCut);
    window.document.addEventListener('paste', handlePaste);
    return () => {
      window.document.removeEventListener('keydown', handleKeyDown);
      window.document.removeEventListener('copy', handleCopy);
      window.document.removeEventListener('cut', handleCut);
      window.document.removeEventListener('paste', handlePaste);
    };
  }, [
    applyTransaction,
    deleteSelectedItems,
    dispatch,
    duplicateSelectedItems,
    nudgeSelectedItems,
    onPasteImageFile,
    redo,
    reorderSelectedItem,
    resolvedSelectedItems,
    selectAllItems,
    setActiveTool,
    undo,
  ]);
}
