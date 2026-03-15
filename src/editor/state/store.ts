import { create } from 'zustand';

import {
  createDefaultProjectDocument,
  createEllipseItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
  normalizeZIndices,
} from '../model/defaults';
import type {
  CanvasItem,
  CanvasItemKind,
  CanvasSize,
  CanvasTool,
  DocumentFontReference,
  EditorCommand,
  ProjectDocumentV1,
  ReorderMode,
  UploadedFont,
} from '../model/types';

function clampDimension(value: number): number {
  return Math.max(1, Number.isFinite(value) ? value : 1);
}

function applyItemChanges(item: CanvasItem, changes: Partial<CanvasItem>): CanvasItem {
  const nextItem = {
    ...item,
    ...changes,
  } as CanvasItem;

  if (nextItem.kind === 'line') {
    nextItem.width = Math.max(1, Math.abs(nextItem.endX - nextItem.startX));
    nextItem.height = Math.max(1, Math.abs(nextItem.endY - nextItem.startY));
    nextItem.x = Math.min(nextItem.startX, nextItem.endX);
    nextItem.y = Math.min(nextItem.startY, nextItem.endY);
    return nextItem;
  }

  nextItem.width = clampDimension(nextItem.width);
  nextItem.height = clampDimension(nextItem.height);
  return nextItem;
}

function reorderItems(items: CanvasItem[], itemId: string, mode: ReorderMode): CanvasItem[] {
  const orderedItems = items.slice().sort((left, right) => left.zIndex - right.zIndex);
  const currentIndex = orderedItems.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) {
    return orderedItems;
  }

  const [item] = orderedItems.splice(currentIndex, 1);
  let nextIndex = currentIndex;

  switch (mode) {
    case 'front':
      nextIndex = orderedItems.length;
      break;
    case 'back':
      nextIndex = 0;
      break;
    case 'forward':
      nextIndex = Math.min(currentIndex + 1, orderedItems.length);
      break;
    case 'backward':
      nextIndex = Math.max(currentIndex - 1, 0);
      break;
  }

  orderedItems.splice(nextIndex, 0, item);
  return normalizeZIndices(orderedItems);
}

export function applyEditorCommand(
  document: ProjectDocumentV1,
  command: EditorCommand
): ProjectDocumentV1 {
  switch (command.type) {
    case 'add_item': {
      const items = normalizeZIndices([
        ...document.items,
        { ...command.item, zIndex: document.items.length },
      ]);
      return {
        ...document,
        items,
        selectedItemIds: [command.item.id],
      };
    }
    case 'delete_items': {
      const deletedIds = new Set(command.itemIds);
      const items = normalizeZIndices(
        document.items.filter((item) => !deletedIds.has(item.id))
      );
      return {
        ...document,
        items,
        selectedItemIds: document.selectedItemIds.filter((id) => !deletedIds.has(id)),
      };
    }
    case 'select_items':
      return {
        ...document,
        selectedItemIds: command.itemIds,
      };
    case 'clear_selection':
      return {
        ...document,
        selectedItemIds: [],
      };
    case 'update_item':
      return {
        ...document,
        items: document.items.map((item) =>
          item.id === command.itemId ? applyItemChanges(item, command.changes) : item
        ),
      };
    case 'set_canvas_size':
      return {
        ...document,
        canvas: {
          width: clampDimension(command.canvas.width),
          height: clampDimension(command.canvas.height),
          presetId: command.canvas.presetId,
        },
      };
    case 'set_background':
      return {
        ...document,
        background: command.background,
      };
    case 'reorder_item':
      return {
        ...document,
        items: reorderItems(document.items, command.itemId, command.mode),
      };
    case 'register_font': {
      const alreadyRegistered = document.fonts.some(
        (font) =>
          font.family === command.font.family &&
          font.sourceName === command.font.sourceName &&
          font.kind === command.font.kind
      );
      return alreadyRegistered
        ? document
        : {
            ...document,
            fonts: [...document.fonts, command.font],
          };
    }
    case 'load_document':
      return command.document;
  }
}

function shouldRecordHistory(command: EditorCommand): boolean {
  return !['select_items', 'clear_selection', 'register_font'].includes(command.type);
}

function createItemForKind(
  kind: Exclude<CanvasItemKind, 'image'>,
  x: number,
  y: number
): CanvasItem {
  const position = { x, y };
  switch (kind) {
    case 'text':
      return createTextItem(position);
    case 'rectangle':
      return createRectangleItem(position);
    case 'ellipse':
      return createEllipseItem(position);
    case 'line':
      return createLineItem(position);
  }
}

export interface EditorState {
  document: ProjectDocumentV1;
  activeTool: CanvasTool;
  availableFonts: UploadedFont[];
  missingFontFamilies: string[];
  exportScale: number;
  historyPast: ProjectDocumentV1[];
  historyFuture: ProjectDocumentV1[];
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

export const useEditorStore = create<EditorState>((set, get) => ({
  document: createDefaultProjectDocument(),
  activeTool: 'select',
  availableFonts: [],
  missingFontFamilies: [],
  exportScale: 2,
  historyPast: [],
  historyFuture: [],
  dispatch: (command) =>
    set((state) => {
      const nextDocument = applyEditorCommand(state.document, command);
      const nextPast = shouldRecordHistory(command)
        ? [...state.historyPast, state.document]
        : state.historyPast;
      return {
        document: nextDocument,
        historyPast: nextPast,
        historyFuture: shouldRecordHistory(command) ? [] : state.historyFuture,
      };
    }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  createItemAt: (kind, x, y) => {
    const item = createItemForKind(kind, x, y);
    get().dispatch({ type: 'add_item', item });
    get().setActiveTool('select');
  },
  updateSelectedItem: (changes) => {
    const selectedId = get().document.selectedItemIds[0];
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
    const selectedIds = get().document.selectedItemIds;
    if (selectedIds.length === 0) {
      return;
    }
    get().dispatch({ type: 'delete_items', itemIds: selectedIds });
  },
  reorderSelectedItem: (mode) => {
    const selectedId = get().document.selectedItemIds[0];
    if (!selectedId) {
      return;
    }
    get().dispatch({ type: 'reorder_item', itemId: selectedId, mode });
  },
  undo: () =>
    set((state) => {
      const previousDocument = state.historyPast.at(-1);
      if (!previousDocument) {
        return state;
      }
      return {
        document: previousDocument,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [state.document, ...state.historyFuture],
      };
    }),
  redo: () =>
    set((state) => {
      const nextDocument = state.historyFuture[0];
      if (!nextDocument) {
        return state;
      }
      return {
        document: nextDocument,
        historyPast: [...state.historyPast, state.document],
        historyFuture: state.historyFuture.slice(1),
      };
    }),
  canUndo: () => get().historyPast.length > 0,
  canRedo: () => get().historyFuture.length > 0,
  registerAvailableFont: (font) =>
    set((state) => {
      const alreadyRegistered = state.availableFonts.some(
        (entry) =>
          entry.family === font.family && entry.sourceName === font.sourceName
      );
      return alreadyRegistered
        ? state
        : { availableFonts: [...state.availableFonts, font] };
    }),
  setMissingFontFamilies: (families) => set({ missingFontFamilies: families }),
  loadDocument: (document) =>
    set((state) => ({
      document,
      historyPast: [...state.historyPast, state.document],
      historyFuture: [],
    })),
  addImageItem: (item) => get().dispatch({ type: 'add_item', item }),
  setCanvasSize: (canvas) => get().dispatch({ type: 'set_canvas_size', canvas }),
  setExportScale: (scale) => set({ exportScale: scale }),
  resetDocument: () =>
    set({
      document: createDefaultProjectDocument(),
      historyPast: [],
      historyFuture: [],
      missingFontFamilies: [],
    }),
}));

export function ensureFontRegistered(
  document: ProjectDocumentV1,
  font: DocumentFontReference
): ProjectDocumentV1 {
  return applyEditorCommand(document, { type: 'register_font', font });
}
