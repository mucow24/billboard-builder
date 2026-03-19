import { useEffect, useRef } from 'react';

import {
  APP_CLIPBOARD_MIME_TYPE,
  readSelectionFromClipboardData,
  writeSelectionToClipboardData,
} from './clipboard';
import { getFirstImageFileFromClipboardData } from '../editor/io/images';
import { cloneCanvasNode } from '../editor/document/sceneGraph';
import type { CanvasNode, CanvasTool } from '../editor/document/documentTypes';
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
  deleteSelectedItems?: EditorStoreState['deleteSelectedItems'];
  deleteSelectedNodes: EditorStoreState['deleteSelectedNodes'];
  duplicateSelectedItems?: EditorStoreState['duplicateSelectedItems'];
  duplicateSelectedNodes: EditorStoreState['duplicateSelectedNodes'];
  groupSelectedNodes: EditorStoreState['groupSelectedNodes'];
  nudgeSelectedItems?: EditorStoreState['nudgeSelectedItems'];
  nudgeSelectedNodes: EditorStoreState['nudgeSelectedNodes'];
  onPasteImageFile: (file: File) => void | Promise<void>;
  redo: EditorStoreState['redo'];
  reorderSelectedItem?: EditorStoreState['reorderSelectedItem'];
  reorderSelectedNode: EditorStoreState['reorderSelectedNode'];
  selectedItems?: CanvasNode[];
  selectedNodes: CanvasNode[];
  selectAllItems?: EditorStoreState['selectAllItems'];
  selectAllNodes: EditorStoreState['selectAllNodes'];
  setActiveTool: EditorStoreState['setActiveTool'];
  undo: EditorStoreState['undo'];
  ungroupSelectedNode: EditorStoreState['ungroupSelectedNode'];
}

export function useEditorShortcuts({
  applyTransaction,
  deleteSelectedItems,
  deleteSelectedNodes,
  duplicateSelectedItems,
  duplicateSelectedNodes,
  groupSelectedNodes,
  nudgeSelectedItems,
  nudgeSelectedNodes,
  onPasteImageFile,
  redo,
  reorderSelectedItem,
  reorderSelectedNode,
  selectedItems,
  selectedNodes,
  selectAllItems,
  selectAllNodes,
  setActiveTool,
  undo,
  ungroupSelectedNode,
}: UseEditorShortcutsArgs) {
  const pasteStateRef = useRef<{ payload: string; count: number } | null>(null);

  useEffect(() => {
    const resolvedDeleteSelectedNodes = deleteSelectedNodes ?? deleteSelectedItems!;
    const resolvedDuplicateSelectedNodes = duplicateSelectedNodes ?? duplicateSelectedItems!;
    const resolvedNudgeSelectedNodes = nudgeSelectedNodes ?? nudgeSelectedItems!;
    const resolvedReorderSelectedNode = reorderSelectedNode ?? reorderSelectedItem!;
    const resolvedSelectedNodes = selectedNodes ?? selectedItems ?? [];
    const resolvedSelectAllNodes = selectAllNodes ?? selectAllItems!;

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
        resolvedSelectAllNodes();
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'd') {
        event.preventDefault();
        resolvedDuplicateSelectedNodes();
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'g') {
        event.preventDefault();
        if (event.shiftKey) {
          ungroupSelectedNode();
          return;
        }
        groupSelectedNodes();
        return;
      }
      if (hasModifier && !isEditable && event.key === 'ArrowUp') {
        event.preventDefault();
        resolvedReorderSelectedNode(event.shiftKey ? 'front' : 'forward');
        return;
      }
      if (hasModifier && !isEditable && event.key === 'ArrowDown') {
        event.preventDefault();
        resolvedReorderSelectedNode(event.shiftKey ? 'back' : 'backward');
        return;
      }
      if (!hasModifier && !isEditable && resolvedSelectedNodes.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 1;
        const deltaX = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
        const deltaY = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
        resolvedNudgeSelectedNodes(deltaX, deltaY);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (isEditable) {
          return;
        }
        event.preventDefault();
        resolvedDeleteSelectedNodes();
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
      if (isEditableTarget(event.target) || resolvedSelectedNodes.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, resolvedSelectedNodes)) {
        return;
      }
      pasteStateRef.current = null;
      event.preventDefault();
    }

    function handleCut(event: ClipboardEvent) {
      if (isEditableTarget(event.target) || resolvedSelectedNodes.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, resolvedSelectedNodes)) {
        return;
      }
      pasteStateRef.current = null;
      event.preventDefault();
      resolvedDeleteSelectedNodes();
    }

    function handlePaste(event: ClipboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      const pastedNodes = readSelectionFromClipboardData(event.clipboardData);
      if (pastedNodes && pastedNodes.length > 0) {
        const payload = event.clipboardData?.getData(APP_CLIPBOARD_MIME_TYPE) ?? '';
        const nextPasteCount = pasteStateRef.current?.payload === payload ? pasteStateRef.current.count + 1 : 1;
        pasteStateRef.current = { payload, count: nextPasteCount };
        event.preventDefault();
        const clones = pastedNodes.map((node) => cloneCanvasNode(node, 24 * nextPasteCount));
        applyTransaction([
          {
            family: 'document' as const,
            command: { type: 'insert_nodes' as const, nodes: clones },
          },
          {
            family: 'selection' as const,
            command: { type: 'select_nodes' as const, nodeIds: clones.map((node) => node.id) },
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
    deleteSelectedNodes,
    duplicateSelectedItems,
    duplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedItems,
    nudgeSelectedNodes,
    onPasteImageFile,
    redo,
    reorderSelectedItem,
    reorderSelectedNode,
    selectedItems,
    selectedNodes,
    selectAllItems,
    selectAllNodes,
    setActiveTool,
    undo,
    ungroupSelectedNode,
  ]);
}
