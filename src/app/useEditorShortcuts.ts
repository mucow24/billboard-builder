import { useEffect } from 'react';

import {
  readSelectionFromClipboardData,
  writeSelectionToClipboardData,
} from './clipboard';
import { cloneCanvasItem } from '../editor/document/documentDefaults';
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
  deleteSelectedItems: EditorStoreState['deleteSelectedItems'];
  dispatch: EditorStoreState['dispatch'];
  onPasteImageFile: (file: File) => void | Promise<void>;
  redo: EditorStoreState['redo'];
  selectedItem: CanvasItem | null;
  setActiveTool: EditorStoreState['setActiveTool'];
  undo: EditorStoreState['undo'];
  reorderSelectedItem: EditorStoreState['reorderSelectedItem'];
}

export function useEditorShortcuts({
  deleteSelectedItems,
  dispatch,
  onPasteImageFile,
  redo,
  selectedItem,
  setActiveTool,
  undo,
  reorderSelectedItem,
}: UseEditorShortcutsArgs) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const hasModifier = event.ctrlKey || event.metaKey;
      const isEditable = isEditableTarget(event.target);
      const pressedKey = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
          return;
        }
        undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'd') {
        event.preventDefault();
        if (selectedItem) {
          dispatch({ type: 'add_item', item: cloneCanvasItem(selectedItem) });
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
      if (!hasModifier && !isEditable && selectedItem && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 1;
        const deltaX = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
        const deltaY = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
        if (selectedItem.kind === 'line') {
          dispatch({
            type: 'update_item',
            itemId: selectedItem.id,
            changes: {
              startX: selectedItem.startX + deltaX,
              startY: selectedItem.startY + deltaY,
              endX: selectedItem.endX + deltaX,
              endY: selectedItem.endY + deltaY,
            },
          });
        } else {
          dispatch({
            type: 'update_item',
            itemId: selectedItem.id,
            changes: {
              x: selectedItem.x + deltaX,
              y: selectedItem.y + deltaY,
            },
          });
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
      if (isEditableTarget(event.target) || !selectedItem) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, [selectedItem])) {
        return;
      }
      event.preventDefault();
    }

    function handleCut(event: ClipboardEvent) {
      if (isEditableTarget(event.target) || !selectedItem) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, [selectedItem])) {
        return;
      }
      event.preventDefault();
      deleteSelectedItems();
    }

    function handlePaste(event: ClipboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      const copiedItems = readSelectionFromClipboardData(event.clipboardData);
      if (copiedItems) {
        event.preventDefault();
        for (const item of copiedItems) {
          dispatch({ type: 'add_item', item: cloneCanvasItem(item) });
        }
        return;
      }
      const imageFile = getFirstImageFileFromClipboardData(event.clipboardData);
      if (imageFile) {
        event.preventDefault();
        void onPasteImageFile(imageFile);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('cut', handleCut);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('cut', handleCut);
      window.removeEventListener('paste', handlePaste);
    };
  }, [
    deleteSelectedItems,
    dispatch,
    onPasteImageFile,
    redo,
    reorderSelectedItem,
    selectedItem,
    setActiveTool,
    undo,
  ]);
}
