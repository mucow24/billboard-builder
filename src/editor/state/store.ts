import { create } from 'zustand';

import { createDefaultEditorState } from '../core/editorState';
import { selectCanRedo, selectCanUndo, selectPrimarySelectedItemId } from '../core/selectors';
import {
  createItemForKind,
  createResetDocumentTransaction,
  reduceEditorState,
} from '../core/editorReducer';
import { toEditorAction, type EditorAction } from '../core/editorActions';
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
  setActiveTool: (tool: CanvasTool) => void;
  createItemAt: (kind: Exclude<CanvasItemKind, 'image'>, x: number, y: number) => void;
  updateSelectedItem: (changes: Partial<CanvasItem>) => void;
  selectSingleItem: (itemId?: string) => void;
  deleteItem: (itemId: string) => void;
  deleteSelectedItems: () => void;
  reorderSelectedItem: (mode: ReorderMode) => void;
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
    selectSingleItem: (itemId) =>
      get().dispatch(
        itemId ? { type: 'select_items', itemIds: [itemId] } : { type: 'clear_selection' }
      ),
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
      get().dispatch({ type: 'reorder_item', itemId: selectedId, mode });
    },
    undo: () => set((state) => applyStoreAction(state, { family: 'history', type: 'undo' })),
    redo: () => set((state) => applyStoreAction(state, { family: 'history', type: 'redo' })),
    canUndo: () => selectCanUndo({ past: get().historyPast, future: get().historyFuture }),
    canRedo: () => selectCanRedo({ past: get().historyPast, future: get().historyFuture }),
    registerAvailableFont: (font) =>
      set((state) => applyStoreAction(state, { family: 'session', type: 'register_available_font', font })),
    setMissingFontFamilies: (families) =>
      set((state) => applyStoreAction(state, { family: 'session', type: 'set_missing_font_families', families })),
    loadDocument: (document) => get().dispatch({ type: 'load_document', document }),
    addImageItem: (item) => get().dispatch({ type: 'add_item', item }),
    setCanvasSize: (canvas) => get().dispatch({ type: 'set_canvas_size', canvas }),
    setExportScale: (scale) => set((state) => applyStoreAction(state, { family: 'session', type: 'set_export_scale', scale })),
    resetDocument: () => set((state) => applyStoreAction(state, createResetDocumentTransaction())),
  };
});
