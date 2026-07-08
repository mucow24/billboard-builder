import { create } from 'zustand';

import { createDefaultEditorState } from '../core/editorState';
import {
  selectCanRedo,
  selectCanUndo,
  selectPrimarySelectedNodeId,
  selectSelectedGroup,
  selectSelectedItem,
  selectSelectedItems,
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
  SelectionItemChange,
} from '../document/documentTypes';
import type {
  EditorState as CoreEditorState,
  PolygonVertexSelection,
} from '../core/editorState';
import { removePolygonVertex } from '../document/polygonVertices';

export { applyEditorCommand, ensureFontRegistered } from '../core/editorReducer';

export interface EditorStoreState {
  editor: CoreEditorState;
  dispatch: (command: EditorCommand) => void;
  applyTransaction: (actions: Parameters<typeof createTransactionAction>[0]) => void;
  setActiveTool: (tool: CanvasTool) => void;
  createItemAt: (kind: Exclude<CanvasLeafKind, 'image' | 'generator'>, x: number, y: number) => void;
  updateSelectedItem: (changes: Partial<CanvasItem>) => void;
  updateSelectedItems: (changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>) => void;
  updateSelectionItems: (changes: SelectionItemChange) => void;
  updateSelectedGroup: (opacity: number) => void;
  selectSingleNode: (nodeId?: string) => void;
  selectParentNode: () => boolean;
  toggleSelectedNode: (nodeId: string) => void;
  toggleSelectedNodes: (nodeIds: string[]) => void;
  selectAllNodes: () => void;
  deleteNode: (nodeId: string) => void;
  deleteSelectedNodes: () => void;
  reorderSelectedNode: (mode: ReorderMode) => void;
  moveNode: (nodeId: string, targetParentId: string | null, targetIndex: number) => void;
  groupSelectedNodes: () => void;
  ungroupSelectedNode: () => void;
  duplicateSelectedNodes: () => string[];
  nudgeSelectedNodes: (deltaX: number, deltaY: number) => void;
  setSelectedPolygonVertex: (selection: PolygonVertexSelection | null) => void;
  deleteSelectedPolygonVertex: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  beginInteraction: () => void;
  commitInteraction: () => void;
  cancelInteraction: () => void;
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
      get().dispatch({ type: 'add_node', item });
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
      get().dispatch({ type: 'update_node', itemId: selectedId, changes });
    },
    updateSelectedItems: (changesById) => {
      if (changesById.length === 0) {
        return;
      }
      get().applyTransaction(
        changesById.map(({ itemId, changes }) => ({
          family: 'document' as const,
          command: { type: 'update_node' as const, itemId, changes },
        }))
      );
    },
    updateSelectionItems: (changes) => {
      const editor = get().editor;
      const selectedItems = selectSelectedItems(editor.document, editor);
      const selectedItem = selectSelectedItem(editor.document, editor);
      const resolveChanges = (item: CanvasItem) =>
        typeof changes === 'function' ? changes(item) : changes;

      if (selectedItems.length > 1) {
        get().updateSelectedItems(
          selectedItems.map((item) => ({
            itemId: item.id,
            changes: resolveChanges(item),
          }))
        );
        return;
      }

      const targetItem = selectedItems[0] ?? selectedItem ?? null;
      if (!targetItem) {
        return;
      }

      get().updateSelectedItem(resolveChanges(targetItem));
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
    moveNode: (nodeId, targetParentId, targetIndex) => {
      get().dispatch({ type: 'move_node', nodeId, targetParentId, targetIndex });
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
        return [];
      }
      const parentInfo = getSelectionParentInfo(get().editor.document.nodes, selectedIds);
      if (!parentInfo) {
        return [];
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
      return clones.filter(isGroupNode).map((node) => node.id);
    },
    setSelectedPolygonVertex: (selection) =>
      set((state) =>
        applyStoreAction(state, {
          family: 'session',
          type: 'set_selected_polygon_vertex',
          selection,
        })
      ),
    deleteSelectedPolygonVertex: () => {
      const selection = get().editor.session.selectedPolygonVertex;
      if (!selection) {
        return false;
      }
      const node = getNodeById(get().editor.document.nodes, selection.itemId);
      if (!node || isGroupNode(node) || node.kind !== 'polygon' || node.locked) {
        return false;
      }
      // Clear the sub-selection either way; the removal itself no-ops at the
      // 3-vertex floor (matching massimo), keeping the polygon selected.
      get().setSelectedPolygonVertex(null);
      const vertices = removePolygonVertex(node.vertices, selection.vertexIndex);
      if (vertices !== node.vertices) {
        get().dispatch({ type: 'update_node', itemId: node.id, changes: { vertices } });
      }
      return true;
    },
    nudgeSelectedNodes: (deltaX, deltaY) => {
      const vertexSelection = get().editor.session.selectedPolygonVertex;
      if (vertexSelection) {
        const node = getNodeById(get().editor.document.nodes, vertexSelection.itemId);
        if (node && !isGroupNode(node) && node.kind === 'polygon' && !node.locked) {
          const vertices = node.vertices.map((vertex, index) =>
            index === vertexSelection.vertexIndex
              ? { x: vertex.x + deltaX, y: vertex.y + deltaY }
              : vertex
          );
          get().dispatch({ type: 'update_node', itemId: node.id, changes: { vertices } });
          return;
        }
      }
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
          changes: item.kind === 'polygon'
            ? {
                // The normalizer re-derives the polygon box from its vertices,
                // so a nudge must move the vertices themselves.
                vertices: item.vertices.map((vertex) => ({
                  x: vertex.x + deltaX,
                  y: vertex.y + deltaY,
                })),
              }
            : item.kind === 'line'
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
    canUndo: () => selectCanUndo(get().editor.history),
    canRedo: () => selectCanRedo(get().editor.history),
    beginInteraction: () => set((state) => applyStoreAction(state, { family: 'interaction', type: 'begin' })),
    commitInteraction: () => set((state) => applyStoreAction(state, { family: 'interaction', type: 'commit' })),
    cancelInteraction: () => set((state) => applyStoreAction(state, { family: 'interaction', type: 'cancel' })),
    registerAvailableFont: (font) => set((state) => applyStoreAction(state, { family: 'session', type: 'register_available_font', font })),
    setMissingFontFamilies: (families) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_missing_font_families', families })),
    loadDocument: (document) => get().dispatch({ type: 'load_document', document }),
    addImageItem: (item) => get().dispatch({ type: 'add_node', item }),
    setCanvasSize: (canvas) => get().dispatch({ type: 'set_canvas_size', canvas }),
    setExportScale: (scale) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_export_scale', scale })),
    resetDocument: () => set((state) => applyStoreAction(state, createResetDocumentTransaction())),
  };
});
