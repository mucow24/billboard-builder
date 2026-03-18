import { create } from 'zustand';

import { createDefaultEditorState } from '../core/editorState';
import { selectCanRedo, selectCanUndo, selectPrimarySelectedItemId } from '../core/selectors';
import {
  createItemForKind,
  createResetDocumentTransaction,
  reduceEditorState,
} from '../core/editorReducer';
import { createTransactionAction, toEditorAction, type EditorAction } from '../core/editorActions';
import {
  normalizeSelectionForItems,
  selectAllItems as selectAllItemIds,
  toggleSelectionItem,
  toggleSelectionItems,
} from '../core/selectionOps';
import { cloneCanvasItem } from '../document/documentDefaults';
import type {
  CanvasItem,
  CanvasItemKind,
  CanvasSize,
  CanvasTool,
  EditorCommand,
  ProjectDocumentV1,
  ReorderMode,
  UploadedFont,
} from '../document/documentTypes';
import type { EditorState as CoreEditorState, HistoryState, SessionState } from '../core/editorState';

export { applyEditorCommand, ensureFontRegistered } from '../core/editorReducer';

export interface EditorStoreState {
  document: CoreEditorState['document'];
  activeTool: SessionState['activeTool'];
  availableFonts: SessionState['availableFonts'];
  missingFontFamilies: SessionState['missingFontFamilies'];
  exportScale: SessionState['exportScale'];
  selectedItemIds: SessionState['selectedItemIds'];
  historyPast: HistoryState['past'];
  historyFuture: HistoryState['future'];
  dispatch: (command: EditorCommand) => void;
  applyTransaction: (actions: Parameters<typeof createTransactionAction>[0]) => void;
  setActiveTool: (tool: CanvasTool) => void;
  createItemAt: (kind: Exclude<CanvasItemKind, 'image'>, x: number, y: number) => void;
  updateSelectedItem: (changes: Partial<CanvasItem>) => void;
  updateSelectedItems: (changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>) => void;
  selectSingleItem: (itemId?: string) => void;
  toggleSelectedItem: (itemId: string) => void;
  toggleSelectedItems: (itemIds: string[]) => void;
  selectAllItems: () => void;
  deleteItem: (itemId: string) => void;
  deleteSelectedItems: () => void;
  reorderSelectedItem: (mode: ReorderMode) => void;
  duplicateSelectedItems: () => void;
  nudgeSelectedItems: (deltaX: number, deltaY: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  registerAvailableFont: (font: UploadedFont) => void;
  setMissingFontFamilies: (families: string[]) => void;
  loadDocument: (document: ProjectDocumentV1) => void;
  addImageItem: (item: CanvasItem) => void;
  setCanvasSize: (canvas: CanvasSize) => void;
  setExportScale: (scale: number) => void;
  resetDocument: () => void;
}

function toStoreSlices(state: CoreEditorState) {
  return {
    document: state.document,
    activeTool: state.session.activeTool,
    availableFonts: state.session.availableFonts,
    missingFontFamilies: state.session.missingFontFamilies,
    exportScale: state.session.exportScale,
    selectedItemIds: state.session.selectedItemIds,
    historyPast: state.history.past,
    historyFuture: state.history.future,
  };
}

function fromStoreSlices(state: Pick<EditorStoreState, 'document' | 'activeTool' | 'availableFonts' | 'missingFontFamilies' | 'exportScale' | 'selectedItemIds' | 'historyPast' | 'historyFuture'>): CoreEditorState {
  return {
    document: state.document,
    session: {
      activeTool: state.activeTool,
      availableFonts: state.availableFonts,
      missingFontFamilies: state.missingFontFamilies,
      exportScale: state.exportScale,
      selectedItemIds: state.selectedItemIds,
    },
    history: {
      past: state.historyPast,
      future: state.historyFuture,
    },
  };
}

function applyStoreAction(state: EditorStoreState, action: EditorAction) {
  return toStoreSlices(reduceEditorState(fromStoreSlices(state), action));
}

export const useEditorStore = create<EditorStoreState>((set, get) => {
  const initialState = createDefaultEditorState();

  return {
    ...toStoreSlices(initialState),
    dispatch: (command) => set((state) => applyStoreAction(state, toEditorAction(command))),
    applyTransaction: (actions) => set((state) => applyStoreAction(state, createTransactionAction(actions))),
    setActiveTool: (tool) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_active_tool', tool })),
    createItemAt: (kind, x, y) => {
      const item = createItemForKind(kind, x, y);
      get().dispatch({ type: 'add_item', item });
      get().setActiveTool('select');
    },
    updateSelectedItem: (changes) => {
      const selectedId = selectPrimarySelectedItemId({
        activeTool: get().activeTool,
        availableFonts: get().availableFonts,
        missingFontFamilies: get().missingFontFamilies,
        exportScale: get().exportScale,
        selectedItemIds: get().selectedItemIds,
      });
      if (!selectedId) {
        return;
      }
      get().dispatch({ type: 'update_item', itemId: selectedId, changes });
    },
    updateSelectedItems: (changesById) => {
      if (changesById.length === 0) {
        return;
      }
      get().applyTransaction(changesById.map(({ itemId, changes }) => ({ family: 'document', command: { type: 'update_item', itemId, changes } })));
    },
    selectSingleItem: (itemId) => get().dispatch(itemId ? { type: 'select_items', itemIds: [itemId] } : { type: 'clear_selection' }),
    toggleSelectedItem: (itemId) => {
      const item = get().document.items.find((entry) => entry.id === itemId);
      if (!item || item.hidden) {
        return;
      }
      get().dispatch({ type: 'select_items', itemIds: toggleSelectionItem(get().selectedItemIds, itemId) });
    },
    toggleSelectedItems: (itemIds) => {
      const nextSelection = normalizeSelectionForItems(toggleSelectionItems(get().selectedItemIds, itemIds), get().document.items);
      get().dispatch({ type: 'select_items', itemIds: nextSelection });
    },
    selectAllItems: () => {
      get().dispatch({ type: 'select_items', itemIds: selectAllItemIds(get().document.items) });
    },
    deleteItem: (itemId) => {
      get().dispatch({ type: 'delete_items', itemIds: [itemId] });
    },
    deleteSelectedItems: () => {
      const selectedIds = get().selectedItemIds;
      if (selectedIds.length === 0) {
        return;
      }
      get().dispatch({ type: 'delete_items', itemIds: selectedIds });
    },
    reorderSelectedItem: (mode) => {
      const selectedIds = normalizeSelectionForItems(get().selectedItemIds, get().document.items);
      if (selectedIds.length === 0) {
        return;
      }
      if (selectedIds.length === 1) {
        get().dispatch({ type: 'reorder_item', itemId: selectedIds[0], mode });
        return;
      }
      get().dispatch({ type: 'reorder_items', itemIds: selectedIds, mode });
    },
    duplicateSelectedItems: () => {
      const selectedIds = new Set(normalizeSelectionForItems(get().selectedItemIds, get().document.items));
      const selectedItems = get().document.items.filter((item) => selectedIds.has(item.id));
      if (selectedItems.length === 0) {
        return;
      }
      const clones = selectedItems.map((item) => cloneCanvasItem(item));
      get().applyTransaction([
        ...clones.map((item) => ({ family: 'document' as const, command: { type: 'add_item' as const, item } })),
        { family: 'selection' as const, command: { type: 'select_items' as const, itemIds: clones.map((item) => item.id) } },
      ]);
    },
    nudgeSelectedItems: (deltaX, deltaY) => {
      const selectedIds = new Set(normalizeSelectionForItems(get().selectedItemIds, get().document.items));
      const updates = get().document.items
        .filter((item) => selectedIds.has(item.id) && !item.locked)
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
    canUndo: () => selectCanUndo({ past: get().historyPast, future: get().historyFuture }),
    canRedo: () => selectCanRedo({ past: get().historyPast, future: get().historyFuture }),
    registerAvailableFont: (font) => set((state) => applyStoreAction(state, { family: 'session', type: 'register_available_font', font })),
    setMissingFontFamilies: (families) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_missing_font_families', families })),
    loadDocument: (document) => get().dispatch({ type: 'load_document', document }),
    addImageItem: (item) => get().dispatch({ type: 'add_item', item }),
    setCanvasSize: (canvas) => get().dispatch({ type: 'set_canvas_size', canvas }),
    setExportScale: (scale) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_export_scale', scale })),
    resetDocument: () => set((state) => applyStoreAction(state, createResetDocumentTransaction())),
  };
});
