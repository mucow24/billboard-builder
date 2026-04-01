import { create } from 'zustand';

import { createDefaultEditorState } from '../core/editorState';
import {
  selectCanRedo,
  selectCanUndo,
  selectPrimarySelectedNodeId,
  selectSelectedGroup,
} from '../core/selectors';
import {
  createItemForKind,
  createResetDocumentTransaction,
  reduceEditorState,
} from '../core/editorReducer';
import { createTransactionAction, toEditorAction, type EditorAction } from '../core/editorActions';
import {
  normalizeSelectionForNodes,
  selectAllNodes as selectAllNodeIds,
  toggleSelectionNode,
  toggleSelectionNodes,
} from '../core/selectionOps';
import {
  cloneCanvasNode,
  collectLeafItems,
  getNodeById,
  getNodeEntry,
  getSelectionParentInfo,
  isGroupNode,
} from '../document/sceneGraph';
import type {
  CanvasItem,
  CanvasLeafKind,
  CanvasNode,
  CanvasSize,
  CanvasTool,
  EditorCommand,
  ProjectDocument,
  ReorderMode,
  UploadedFont,
} from '../document/documentTypes';
import type { EditorState as CoreEditorState } from '../core/editorState';

export { applyEditorCommand, ensureFontRegistered } from '../core/editorReducer';

export interface EditorStoreState {
  editor: CoreEditorState;
  dispatch: (command: EditorCommand) => void;
  applyTransaction: (actions: Parameters<typeof createTransactionAction>[0]) => void;
  setActiveTool: (tool: CanvasTool) => void;
  createItemAt: (kind: Exclude<CanvasLeafKind, 'image' | 'generator'>, x: number, y: number) => void;
  updateSelectedItem: (changes: Partial<CanvasItem>) => void;
  updateSelectedItems: (changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>) => void;
  updateSelectedGroup: (opacity: number) => void;
  selectSingleNode: (nodeId?: string) => void;
  selectParentNode: () => boolean;
  toggleSelectedNode: (nodeId: string) => void;
  toggleSelectedNodes: (nodeIds: string[]) => void;
  selectAllNodes: () => void;
  deleteNode: (nodeId: string) => void;
  deleteSelectedNodes: () => void;
  reorderSelectedNode: (mode: ReorderMode) => void;
  groupSelectedNodes: () => void;
  ungroupSelectedNode: () => void;
  duplicateSelectedNodes: () => void;
  nudgeSelectedNodes: (deltaX: number, deltaY: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  registerAvailableFont: (font: UploadedFont) => void;
  setMissingFontFamilies: (families: string[]) => void;
  loadDocument: (document: ProjectDocument) => void;
  addImageItem: (item: CanvasItem) => void;
  setCanvasSize: (canvas: CanvasSize) => void;
  setExportScale: (scale: number) => void;
  resetDocument: () => void;
}

function applyStoreAction(state: EditorStoreState, action: EditorAction) {
  return {
    editor: reduceEditorState(state.editor, action),
  };
}

export const useEditorStore = create<EditorStoreState>((set, get) => {
  const initialState = createDefaultEditorState();

  return {
    editor: initialState,
    dispatch: (command) => set((state) => applyStoreAction(state, toEditorAction(command))),
    applyTransaction: (actions) => set((state) => applyStoreAction(state, createTransactionAction(actions))),
    setActiveTool: (tool) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_active_tool', tool })),
    createItemAt: (kind, x, y) => {
      const item = createItemForKind(kind, x, y);
      get().dispatch({ type: 'add_item', item });
      get().setActiveTool('select');
    },
    updateSelectedItem: (changes) => {
      const selectedId = selectPrimarySelectedNodeId(get().editor);
      if (!selectedId) {
        return;
      }
      const selectedNode = getNodeById(get().editor.document.nodes, selectedId);
      if (!selectedNode || selectedNode.kind === 'group') {
        return;
      }
      get().dispatch({ type: 'update_item', itemId: selectedId, changes });
    },
    updateSelectedItems: (changesById) => {
      if (changesById.length === 0) {
        return;
      }
      get().applyTransaction(
        changesById.map(({ itemId, changes }) => ({
          family: 'document' as const,
          command: { type: 'update_item' as const, itemId, changes },
        }))
      );
    },
    updateSelectedGroup: (opacity) => {
      const selectedGroup = selectSelectedGroup(get().editor.document, get().editor);
      if (!selectedGroup) {
        return;
      }
      get().dispatch({ type: 'update_group', groupId: selectedGroup.id, changes: { opacity } });
    },
    selectSingleNode: (nodeId) =>
      get().dispatch(nodeId ? { type: 'select_nodes', nodeIds: [nodeId] } : { type: 'clear_selection' }),
    selectParentNode: () => {
      const selectedId = selectPrimarySelectedNodeId(get().editor);
      if (!selectedId) {
        return false;
      }
      const entry = getNodeEntry(get().editor.document.nodes, selectedId);
      if (!entry?.parent) {
        return false;
      }
      get().dispatch({ type: 'select_nodes', nodeIds: [entry.parent.id] });
      return true;
    },
    toggleSelectedNode: (nodeId) => {
      const node = getNodeById(get().editor.document.nodes, nodeId);
      if (!node) {
        return;
      }
      get().dispatch({
        type: 'select_nodes',
        nodeIds: toggleSelectionNode(get().editor.session.selectedNodeIds, nodeId),
      });
    },
    toggleSelectedNodes: (nodeIds) => {
      const nextSelection = normalizeSelectionForNodes(
        toggleSelectionNodes(get().editor.session.selectedNodeIds, nodeIds),
        get().editor.document.nodes
      );
      get().dispatch({ type: 'select_nodes', nodeIds: nextSelection });
    },
    selectAllNodes: () => {
      get().dispatch({
        type: 'select_nodes',
        nodeIds: selectAllNodeIds(get().editor.document.nodes),
      });
    },
    deleteNode: (nodeId) => {
      get().dispatch({ type: 'delete_nodes', nodeIds: [nodeId] });
    },
    deleteSelectedNodes: () => {
      const selectedIds = get().editor.session.selectedNodeIds;
      if (selectedIds.length === 0) {
        return;
      }
      get().dispatch({ type: 'delete_nodes', nodeIds: selectedIds });
    },
    reorderSelectedNode: (mode) => {
      const selectedIds = normalizeSelectionForNodes(
        get().editor.session.selectedNodeIds,
        get().editor.document.nodes
      );
      if (selectedIds.length === 0) {
        return;
      }
      if (selectedIds.length === 1) {
        get().dispatch({ type: 'reorder_node', nodeId: selectedIds[0], mode });
        return;
      }
      get().dispatch({ type: 'reorder_nodes', nodeIds: selectedIds, mode });
    },
    groupSelectedNodes: () => {
      const selectedIds = normalizeSelectionForNodes(
        get().editor.session.selectedNodeIds,
        get().editor.document.nodes
      );
      if (selectedIds.length < 2) {
        return;
      }
      get().dispatch({ type: 'group_nodes', nodeIds: selectedIds });
    },
    ungroupSelectedNode: () => {
      const selectedId = selectPrimarySelectedNodeId(get().editor);
      const selectedNode = selectedId ? getNodeById(get().editor.document.nodes, selectedId) : undefined;
      if (!selectedId || !selectedNode || selectedNode.kind !== 'group') {
        return;
      }
      get().dispatch({ type: 'ungroup_node', groupId: selectedId });
    },
    duplicateSelectedNodes: () => {
      const selectedIds = normalizeSelectionForNodes(
        get().editor.session.selectedNodeIds,
        get().editor.document.nodes
      );
      if (selectedIds.length === 0) {
        return;
      }
      const parentInfo = getSelectionParentInfo(get().editor.document.nodes, selectedIds);
      if (!parentInfo) {
        return;
      }
      const sortedEntries = parentInfo.entries.slice().sort((left, right) => left.index - right.index);
      const clones = sortedEntries.map(({ node }) => cloneCanvasNode(node));
      get().dispatch({
        type: 'insert_nodes',
        nodes: clones,
        parentId: parentInfo.parentId ?? undefined,
        index: sortedEntries.at(-1)!.index + 1,
      });
      get().dispatch({ type: 'select_nodes', nodeIds: clones.map((node) => node.id) });
    },
    nudgeSelectedNodes: (deltaX, deltaY) => {
      const selectedIds = normalizeSelectionForNodes(
        get().editor.session.selectedNodeIds,
        get().editor.document.nodes
      );
      const selectedNodes = selectedIds
        .map((nodeId) => getNodeById(get().editor.document.nodes, nodeId))
        .filter((node): node is CanvasNode => Boolean(node));
      const updates = selectedNodes
        .filter((node) => !(isGroupNode(node) && node.locked))
        .flatMap(collectLeafItems)
        .filter((item) => !item.locked)
        .map((item) => ({
          itemId: item.id,
          changes: item.kind === 'line'
            ? {
                startX: item.startX + deltaX,
                startY: item.startY + deltaY,
                endX: item.endX + deltaX,
                endY: item.endY + deltaY,
              }
            : {
                x: item.x + deltaX,
                y: item.y + deltaY,
              },
        }));
      get().updateSelectedItems(updates);
    },
    undo: () => set((state) => applyStoreAction(state, { family: 'history', type: 'undo' })),
    redo: () => set((state) => applyStoreAction(state, { family: 'history', type: 'redo' })),
    canUndo: () => selectCanUndo(get().editor),
    canRedo: () => selectCanRedo(get().editor),
    registerAvailableFont: (font) => set((state) => applyStoreAction(state, { family: 'session', type: 'register_available_font', font })),
    setMissingFontFamilies: (families) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_missing_font_families', families })),
    loadDocument: (document) => get().dispatch({ type: 'load_document', document }),
    addImageItem: (item) => get().dispatch({ type: 'add_item', item }),
    setCanvasSize: (canvas) => get().dispatch({ type: 'set_canvas_size', canvas }),
    setExportScale: (scale) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_export_scale', scale })),
    resetDocument: () => set((state) => applyStoreAction(state, createResetDocumentTransaction())),
  };
});
