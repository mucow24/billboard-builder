import { useEffect } from 'react';

import { cloneCanvasItem } from '../editor/document/documentDefaults';
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

interface UseEditorHotkeysArgs {
  clipboardItem: CanvasItem | null;
  deleteSelectedItems: EditorStoreState['deleteSelectedItems'];
  dispatch: EditorStoreState['dispatch'];
  redo: EditorStoreState['redo'];
  selectedItem: CanvasItem | null;
  setActiveTool: EditorStoreState['setActiveTool'];
  setClipboardItem: (item: CanvasItem | null) => void;
  undo: EditorStoreState['undo'];
  reorderSelectedItem: EditorStoreState['reorderSelectedItem'];
}

export function useEditorHotkeys({
  clipboardItem,
  deleteSelectedItems,
  dispatch,
  redo,
  selectedItem,
  setActiveTool,
  setClipboardItem,
  undo,
  reorderSelectedItem,
}: UseEditorHotkeysArgs) {
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
      if (hasModifier && !isEditable && pressedKey === 'c') {
        event.preventDefault();
        if (selectedItem) {
          setClipboardItem(selectedItem);
        }
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'v') {
        event.preventDefault();
        if (clipboardItem) {
          dispatch({ type: 'add_item', item: cloneCanvasItem(clipboardItem) });
        }
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'x') {
        event.preventDefault();
        if (selectedItem) {
          setClipboardItem(selectedItem);
          deleteSelectedItems();
        }
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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clipboardItem,
    deleteSelectedItems,
    dispatch,
    redo,
    reorderSelectedItem,
    selectedItem,
    setActiveTool,
    setClipboardItem,
    undo,
  ]);
}
