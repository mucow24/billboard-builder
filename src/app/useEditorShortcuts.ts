import { useEffect, useRef } from 'react';

import {
  APP_CLIPBOARD_MIME_TYPE,
  readSelectionFromClipboardData,
  writeSelectionToClipboardData,
} from './clipboard';
import { isEditableTarget } from './domUtils';
import { getFirstImageFileFromClipboardData } from '../editor/io/images';
import { cloneCanvasNode } from '../editor/document/sceneGraph';
import type { CanvasTool } from '../editor/document/documentTypes';
import { useEditorStore, type EditorStoreState } from '../editor/state/store';
import { selectSelectedNodes } from '../editor/core/selectors';
import type { InspectorTab } from '../editor/ui/inspector/types';

interface UseEditorShortcutsArgs {
  applyTransaction: EditorStoreState['applyTransaction'];
  deleteSelectedNodes: EditorStoreState['deleteSelectedNodes'];
  duplicateSelectedNodes: () => void;
  groupSelectedNodes: EditorStoreState['groupSelectedNodes'];
  nudgeSelectedNodes: EditorStoreState['nudgeSelectedNodes'];
  onPasteImageFile: (file: File) => void | Promise<void>;
  redo: EditorStoreState['redo'];
  reorderSelectedNode: EditorStoreState['reorderSelectedNode'];
  selectParentNode: EditorStoreState['selectParentNode'];
  selectAllNodes: EditorStoreState['selectAllNodes'];
  setActiveTool: EditorStoreState['setActiveTool'];
  toggleInspectorTab: (tab: InspectorTab) => void;
  undo: EditorStoreState['undo'];
  ungroupSelectedNode: EditorStoreState['ungroupSelectedNode'];
}

export function useEditorShortcuts({
  applyTransaction,
  deleteSelectedNodes,
  duplicateSelectedNodes,
  groupSelectedNodes,
  nudgeSelectedNodes,
  onPasteImageFile,
  redo,
  reorderSelectedNode,
  selectParentNode,
  selectAllNodes,
  setActiveTool,
  toggleInspectorTab,
  undo,
  ungroupSelectedNode,
}: UseEditorShortcutsArgs) {
  const pasteStateRef = useRef<{ payload: string; count: number } | null>(null);

  useEffect(() => {
    function getSelectedNodes() {
      const { editor } = useEditorStore.getState();
      return selectSelectedNodes(editor.document, editor);
    }

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
        selectAllNodes();
        return;
      }
      if (hasModifier && !isEditable && pressedKey === 'd') {
        event.preventDefault();
        duplicateSelectedNodes();
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
        reorderSelectedNode(event.shiftKey ? 'front' : 'forward');
        return;
      }
      if (hasModifier && !isEditable && event.key === 'ArrowDown') {
        event.preventDefault();
        reorderSelectedNode(event.shiftKey ? 'back' : 'backward');
        return;
      }
      if (!hasModifier && !isEditable && getSelectedNodes().length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 1;
        const deltaX = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
        const deltaY = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
        nudgeSelectedNodes(deltaX, deltaY);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (isEditable) {
          return;
        }
        event.preventDefault();
        deleteSelectedNodes();
        return;
      }
      const hotkeyMap = new Map<string, CanvasTool>([
        ['v', 'select'],
        ['h', 'pan'],
        ['z', 'zoom'],
        ['t', 'text'],
        ['r', 'rectangle'],
        ['o', 'ellipse'],
        ['g', 'ngon'],
        ['l', 'line'],
      ]);
      if (event.key === 'Escape') {
        if (isEditable) {
          return;
        }
        event.preventDefault();
        if (selectParentNode()) {
          return;
        }
        clearSelection();
        setActiveTool('select');
        return;
      }
      if (hasModifier || isEditable) {
        return;
      }
      if (pressedKey === '1' || pressedKey === '2' || pressedKey === '3') {
        event.preventDefault();
        const tab: InspectorTab =
          pressedKey === '1' ? 'properties' : pressedKey === '2' ? 'layers' : 'favorites';
        toggleInspectorTab(tab);
        return;
      }
      const tool = hotkeyMap.get(pressedKey);
      if (tool) {
        setActiveTool(tool);
      }
    }

    function handleCopy(event: ClipboardEvent) {
      const nodes = getSelectedNodes();
      if (isEditableTarget(event.target) || nodes.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, nodes)) {
        return;
      }
      pasteStateRef.current = null;
      event.preventDefault();
    }

    function handleCut(event: ClipboardEvent) {
      const nodes = getSelectedNodes();
      if (isEditableTarget(event.target) || nodes.length === 0) {
        return;
      }
      if (!writeSelectionToClipboardData(event.clipboardData, nodes)) {
        return;
      }
      pasteStateRef.current = null;
      event.preventDefault();
      deleteSelectedNodes();
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
    deleteSelectedNodes,
    duplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedNodes,
    onPasteImageFile,
    redo,
    reorderSelectedNode,
    selectParentNode,
    selectAllNodes,
    setActiveTool,
    toggleInspectorTab,
    undo,
    ungroupSelectedNode,
  ]);
}
