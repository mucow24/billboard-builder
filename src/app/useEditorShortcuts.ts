import { useEffect, useRef } from 'react';

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
  applyTransaction: EditorStoreState['applyTransaction'];
  deleteSelectedItems: EditorStoreState['deleteSelectedItems'];
  duplicateSelectedItems: EditorStoreState['duplicateSelectedItems'];
  nudgeSelectedItems: EditorStoreState['nudgeSelectedItems'];
  onPasteImageFile: (file: File) => void | Promise<void>;
  redo: EditorStoreState['redo'];
  selectedItems: CanvasItem[];
  setActiveTool: EditorStoreState['setActiveTool'];
  selectAllItems: EditorStoreState['selectAllItems'];
  undo: EditorStoreState['undo'];
  reorderSelectedItem: EditorStoreState['reorderSelectedItem'];
}

export function useEditorShortcuts({
  applyTransaction,
  deleteSelectedItems,
  duplicateSelectedItems,
  nudgeSelectedItems,
  onPasteImageFile,
  redo,
  selectedItems,
  setActiveTool,
  selectAllItems,
  undo,
  reorderSelectedItem,
}: UseEditorShortcutsArgs) {
  const pasteStateRef = useRef<{ payload: string; count: number } | null>(null);

  useEffect(() => {
    function clearSelection() {
      applyTransaction([{ family: 'selection', command: { type: 'clear_selection' } }]);
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
      if (hasModifier && !isEditable && pressedKey === 'a') {
        event.preventDefault();
        selectAllItems();
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'd') {
        event.preventDefault();
        duplicateSelectedItems();
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
      if (!hasModifier && !isEditable && selectedItems.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 1;
        const deltaX = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
        const deltaY = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
        nudgeSelectedItems(deltaX, deltaY);
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
      if (isEditableTarget(event.target) || selectedItems.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, selectedItems)) {
        return;
      }
      pasteStateRef.current = null;
      event.preventDefault();
    }

    function handleCut(event: ClipboardEvent) {
      if (isEditableTarget(event.target) || selectedItems.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, selectedItems)) {
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
        applyTransaction([
          ...clones.map((item) => ({
            family: 'document' as const,
            command: { type: 'add_item' as const, item },
          })),
          {
            family: 'selection' as const,
            command: { type: 'select_items' as const, itemIds: clones.map((item) => item.id) },
          },
        ]);
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
    duplicateSelectedItems,
    nudgeSelectedItems,
    onPasteImageFile,
    redo,
    reorderSelectedItem,
    selectedItems,
    selectAllItems,
    setActiveTool,
    undo,
  ]);
}
