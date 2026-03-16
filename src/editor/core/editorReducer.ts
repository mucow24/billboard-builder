import {
  createDefaultProjectDocument,
  createEllipseItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
  normalizeZIndices,
  DEFAULT_ITEM_SHADOW,
  sortByZIndex,
} from '../document/documentDefaults';
import type {
  CanvasItem,
  CanvasItemKind,
  CanvasShadow,
  DocumentFontReference,
  EditorCommand,
  ProjectDocumentV1,
  ReorderMode,
  UploadedFont,
  TextCanvasItem,
  ImageCanvasItem,
  RectangleCanvasItem,
  EllipseCanvasItem,
  LineCanvasItem,
} from '../document/documentTypes';
import {
  createDefaultEditorState,
  createDefaultHistoryState,
  createDefaultSessionState,
  type EditorState,
  type SessionState,
} from './editorState';
import {
  createTransactionAction,
  toEditorAction,
  type DocumentAction,
  type DocumentCommand,
  type EditorAction,
  type SelectionAction,
  type SessionAction,
  type TransactionAction,
} from './editorActions';

function clampFinite(
  value: number,
  fallback: number,
  min?: number,
  max?: number
): number {
  let nextValue = Number.isFinite(value) ? value : fallback;
  if (min !== undefined) {
    nextValue = Math.max(min, nextValue);
  }
  if (max !== undefined) {
    nextValue = Math.min(max, nextValue);
  }
  return nextValue;
}

function clampDimension(value: number): number {
  return clampFinite(value, 1, 1);
}

function clampOpacity(value: number, fallback = 1): number {
  return clampFinite(value, fallback, 0, 1);
}

function clampLineStrokeWidth(value: number): number {
  return clampFinite(value, 1, 1);
}

function normalizeShadow(shadow: Partial<CanvasShadow> | undefined): CanvasShadow {
  const nextShadow = {
    ...DEFAULT_ITEM_SHADOW,
    ...(shadow ?? {}),
  };

  return {
    color: nextShadow.color,
    blur: clampFinite(nextShadow.blur, DEFAULT_ITEM_SHADOW.blur, 0),
    offsetX: clampFinite(nextShadow.offsetX, DEFAULT_ITEM_SHADOW.offsetX),
    offsetY: clampFinite(nextShadow.offsetY, DEFAULT_ITEM_SHADOW.offsetY),
    opacity: clampOpacity(nextShadow.opacity, DEFAULT_ITEM_SHADOW.opacity),
  };
}

function normalizeItem(item: CanvasItem): CanvasItem {
  switch (item.kind) {
    case 'text': {
      const normalizedTextItem: TextCanvasItem = {
        ...item,
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        fontSize: clampFinite(item.fontSize, 1, 1),
        lineHeight: clampFinite(item.lineHeight, 1, 0.1),
        letterSpacing: clampFinite(item.letterSpacing ?? 0, 0),
      };
      return normalizedTextItem;
    }
    case 'image': {
      const normalizedImageItem: ImageCanvasItem = {
        ...item,
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        originalWidth: clampFinite(item.originalWidth, 1, 1),
        originalHeight: clampFinite(item.originalHeight, 1, 1),
        preserveAspectRatio: Boolean(item.preserveAspectRatio),
      };
      return normalizedImageItem;
    }
    case 'rectangle': {
      const normalizedRectangleItem: RectangleCanvasItem = {
        ...item,
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        strokeWidth: clampFinite(item.strokeWidth, 0, 0),
        cornerRadius: clampFinite(item.cornerRadius, 0, 0),
      };
      return normalizedRectangleItem;
    }
    case 'ellipse': {
      const normalizedEllipseItem: EllipseCanvasItem = {
        ...item,
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        strokeWidth: clampFinite(item.strokeWidth, 0, 0),
      };
      return normalizedEllipseItem;
    }
    case 'line': {
      const startX = clampFinite(item.startX, item.x);
      const startY = clampFinite(item.startY, item.y);
      const endX = clampFinite(item.endX, item.x + item.width);
      const endY = clampFinite(item.endY, item.y + item.height);
      const normalizedLineItem: LineCanvasItem = {
        ...item,
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: Math.max(1, Math.abs(endX - startX)),
        height: Math.max(1, Math.abs(endY - startY)),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        startX,
        startY,
        endX,
        endY,
        strokeWidth: clampLineStrokeWidth(item.strokeWidth),
      };
      return normalizedLineItem;
    }
  }
}

export function normalizeDocument(document: ProjectDocumentV1): ProjectDocumentV1 {
  const items = normalizeZIndices(sortByZIndex(document.items).map(normalizeItem));

  return {
    ...document,
    version: 1,
    canvas: {
      ...document.canvas,
      width: clampDimension(document.canvas.width),
      height: clampDimension(document.canvas.height),
      presetId: document.canvas.presetId,
    },
    items,
  };
}

function normalizeSelectionForDocument(
  selectedItemIds: string[],
  document: ProjectDocumentV1
): string[] {
  const itemIds = new Set(document.items.map((item) => item.id));
  const seenSelectionIds = new Set<string>();
  return selectedItemIds.filter((id) => {
    if (!itemIds.has(id) || seenSelectionIds.has(id)) {
      return false;
    }
    seenSelectionIds.add(id);
    return true;
  });
}

function applyItemChanges(item: CanvasItem, changes: Partial<CanvasItem>): CanvasItem {
  return {
    ...item,
    ...changes,
  } as CanvasItem;
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

export function applyDocumentCommand(
  document: ProjectDocumentV1,
  command: DocumentCommand
): ProjectDocumentV1 {
  let nextDocument: ProjectDocumentV1;

  switch (command.type) {
    case 'add_item': {
      const items = normalizeZIndices([
        ...document.items,
        { ...command.item, zIndex: document.items.length },
      ]);
      nextDocument = {
        ...document,
        items,
      };
      break;
    }
    case 'delete_items': {
      const deletedIds = new Set(command.itemIds);
      const items = normalizeZIndices(
        document.items.filter((item) => !deletedIds.has(item.id))
      );
      nextDocument = {
        ...document,
        items,
      };
      break;
    }
    case 'update_item':
      nextDocument = {
        ...document,
        items: document.items.map((item) =>
          item.id === command.itemId ? applyItemChanges(item, command.changes) : item
        ),
      };
      break;
    case 'set_canvas_size':
      nextDocument = {
        ...document,
        canvas: {
          width: clampDimension(command.canvas.width),
          height: clampDimension(command.canvas.height),
          presetId: command.canvas.presetId,
        },
      };
      break;
    case 'set_background':
      nextDocument = {
        ...document,
        background: command.background,
      };
      break;
    case 'reorder_item':
      nextDocument = {
        ...document,
        items: reorderItems(document.items, command.itemId, command.mode),
      };
      break;
    case 'register_font': {
      const alreadyRegistered = document.fonts.some(
        (font) =>
          font.family === command.font.family &&
          font.sourceName === command.font.sourceName &&
          font.kind === command.font.kind
      );
      nextDocument = alreadyRegistered
        ? document
        : {
            ...document,
            fonts: [...document.fonts, command.font],
          };
      break;
    }
    case 'load_document':
      nextDocument = command.document;
      break;
  }

  return normalizeDocument(nextDocument);
}

function registerAvailableFont(session: SessionState, font: UploadedFont): SessionState {
  const alreadyRegistered = session.availableFonts.some(
    (entry) => entry.family === font.family && entry.sourceName === font.sourceName
  );
  return alreadyRegistered
    ? session
    : { ...session, availableFonts: [...session.availableFonts, font] };
}

function applyDocumentSelectionEffects(
  session: SessionState,
  command: DocumentCommand,
  nextDocument: ProjectDocumentV1
): SessionState {
  switch (command.type) {
    case 'add_item':
      return { ...session, selectedItemIds: [command.item.id] };
    case 'delete_items': {
      const deletedIds = new Set(command.itemIds);
      return {
        ...session,
        selectedItemIds: session.selectedItemIds.filter((id) => !deletedIds.has(id)),
      };
    }
    case 'load_document':
      return { ...session, selectedItemIds: [] };
    default:
      return {
        ...session,
        selectedItemIds: normalizeSelectionForDocument(session.selectedItemIds, nextDocument),
      };
  }
}

function isHistoryWorthyDocumentCommand(command: DocumentCommand): boolean {
  return command.type !== 'register_font';
}

function containsHistoryWorthyDocumentAction(actions: Array<DocumentAction | SelectionAction | SessionAction>): boolean {
  return actions.some(
    (action) => action.family === 'document' && isHistoryWorthyDocumentCommand(action.command)
  );
}

function reduceDocumentAction(
  state: EditorState,
  action: DocumentAction,
  options: { suppressHistory?: boolean } = {}
): EditorState {
  const nextDocument = applyDocumentCommand(state.document, action.command);
  const nextSession = applyDocumentSelectionEffects(state.session, action.command, nextDocument);

  if (!options.suppressHistory && action.command.type === 'load_document') {
    return {
      document: nextDocument,
      session: { ...createDefaultSessionState(), availableFonts: state.session.availableFonts },
      history: createDefaultHistoryState(),
    };
  }

  return {
    ...state,
    document: nextDocument,
    session: nextSession,
    history:
      options.suppressHistory || !isHistoryWorthyDocumentCommand(action.command)
        ? state.history
        : {
            past: [...state.history.past, state.document],
            future: [],
          },
  };
}

function reduceSelectionAction(state: EditorState, action: SelectionAction): EditorState {
  return {
    ...state,
    session: {
      ...state.session,
      selectedItemIds: normalizeSelectionForDocument(
        action.command.type === 'select_items' ? action.command.itemIds : [],
        state.document
      ),
    },
  };
}

function reduceSessionAction(state: EditorState, action: SessionAction): EditorState {
  switch (action.type) {
    case 'set_active_tool':
      return {
        ...state,
        session: { ...state.session, activeTool: action.tool },
      };
    case 'register_available_font':
      return {
        ...state,
        session: registerAvailableFont(state.session, action.font),
      };
    case 'set_missing_font_families':
      return {
        ...state,
        session: { ...state.session, missingFontFamilies: action.families },
      };
    case 'set_export_scale':
      return {
        ...state,
        session: { ...state.session, exportScale: action.scale },
      };
  }
}

function reduceTransactionAction(state: EditorState, action: TransactionAction): EditorState {
  const nextState = action.actions.reduce<EditorState>((currentState, currentAction) => {
    switch (currentAction.family) {
      case 'document':
        return reduceDocumentAction(currentState, currentAction, { suppressHistory: true });
      case 'selection':
        return reduceSelectionAction(currentState, currentAction);
      case 'session':
        return reduceSessionAction(currentState, currentAction);
    }
  }, state);

  const historyMode = action.historyMode ?? 'single';
  if (historyMode === 'none') {
    return nextState;
  }

  if (historyMode === 'reset') {
    return {
      ...nextState,
      history: createDefaultHistoryState(),
    };
  }

  if (!containsHistoryWorthyDocumentAction(action.actions)) {
    return nextState;
  }

  return {
    ...nextState,
    history: {
      past: [...state.history.past, state.document],
      future: [],
    },
  };
}

export function reduceEditorState(state: EditorState, action: EditorAction): EditorState {
  switch (action.family) {
    case 'document':
      return reduceDocumentAction(state, action);
    case 'selection':
      return reduceSelectionAction(state, action);
    case 'session':
      return reduceSessionAction(state, action);
    case 'transaction':
      return reduceTransactionAction(state, action);
    case 'history':
      switch (action.type) {
        case 'undo': {
          const previousDocument = state.history.past.at(-1);
          if (!previousDocument) {
            return state;
          }
          return {
            ...state,
            document: previousDocument,
            session: {
              ...state.session,
              selectedItemIds: normalizeSelectionForDocument(
                state.session.selectedItemIds,
                previousDocument
              ),
            },
            history: {
              past: state.history.past.slice(0, -1),
              future: [state.document, ...state.history.future],
            },
          };
        }
        case 'redo': {
          const nextDocument = state.history.future[0];
          if (!nextDocument) {
            return state;
          }
          return {
            ...state,
            document: nextDocument,
            session: {
              ...state.session,
              selectedItemIds: normalizeSelectionForDocument(
                state.session.selectedItemIds,
                nextDocument
              ),
            },
            history: {
              past: [...state.history.past, state.document],
              future: state.history.future.slice(1),
            },
          };
        }
        case 'reset_editor':
          return createDefaultEditorState(createDefaultProjectDocument());
      }
  }
}

export function createItemForKind(
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

export function ensureFontRegistered(
  document: ProjectDocumentV1,
  font: DocumentFontReference
): ProjectDocumentV1 {
  return applyDocumentCommand(document, { type: 'register_font', font });
}

export function applyEditorCommand(document: ProjectDocumentV1, command: EditorCommand): ProjectDocumentV1 {
  return reduceEditorState(createDefaultEditorState(document), toEditorAction(command)).document;
}

export function createResetDocumentTransaction(): TransactionAction {
  return createTransactionAction(
    [
      { family: 'document', command: { type: 'load_document', document: createDefaultProjectDocument() } },
      { family: 'selection', command: { type: 'clear_selection' } },
      { family: 'session', type: 'set_active_tool', tool: 'select' },
      { family: 'session', type: 'set_export_scale', scale: 1 },
      { family: 'session', type: 'set_missing_font_families', families: [] },
    ],
    'single'
  );
}
