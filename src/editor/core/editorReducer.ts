import {
  createDefaultProjectDocument,
  createEllipseItem,
  createLineItem,
  createNgonItem,
  createPolygonItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import { normalizeProjectDocument } from '../document/documentNormalizer';
import {
  getNodeById,
  getNodeIds,
  groupNodes,
  insertNodesAt,
  isGroupNode,
  moveNode,
  removeNodesByIds,
  reorderNodes,
  ungroupNode,
  updateGeneratorItemSizes,
  updateGroupNode,
  updateItemNode,
} from '../document/sceneGraph';
import type {
  CanvasItem,
  CanvasLeafKind,
  DocumentFontReference,
  EditorCommand,
  ProjectDocument,
  UploadedFont,
} from '../document/documentTypes';
import {
  createDefaultEditorState,
  createDefaultHistoryState,
  createDefaultSessionState,
  type EditorState,
  type SessionState,
} from './editorState';
import { normalizeSelectionForNodes } from './selectionOps';
import {
  createTransactionAction,
  toEditorAction,
  type DocumentAction,
  type DocumentCommand,
  type EditorAction,
  type InteractionAction,
  type SelectionAction,
  type SessionAction,
  type TransactionAction,
} from './editorActions';

function normalizeSelectionForDocument(
  selectedNodeIds: string[],
  document: ProjectDocument
): string[] {
  // Use getNodeIds to flatten the tree (includes group IDs), then delegate
  // to the shared dedup-and-filter logic in selectionOps.
  const allNodes = getNodeIds(document.nodes).map((id) => ({ id }));
  return normalizeSelectionForNodes(selectedNodeIds, allNodes);
}

interface DocumentCommandResult {
  nextDocument: ProjectDocument;
  selectionOverride?: string[];
}

function replaceDocumentNodes(document: ProjectDocument, nodes: ProjectDocument['nodes']): ProjectDocument {
  return {
    ...document,
    nodes,
  };
}

export function applyDocumentCommand(
  document: ProjectDocument,
  command: DocumentCommand
): ProjectDocument {
  return applyDocumentCommandWithEffects(document, command).nextDocument;
}

function applyDocumentCommandWithEffects(
  document: ProjectDocument,
  command: DocumentCommand
): DocumentCommandResult {
  const currentDocument = normalizeProjectDocument(document);
  let result: DocumentCommandResult;

  switch (command.type) {
    case 'add_node':
      result = {
        nextDocument: replaceDocumentNodes(currentDocument, [...currentDocument.nodes, command.item]),
        selectionOverride: [command.item.id],
      };
      break;
    case 'insert_nodes':
      result = {
        nextDocument: replaceDocumentNodes(
          currentDocument,
          insertNodesAt(currentDocument.nodes, command.nodes, command.parentId ?? null, command.index)
        ),
        selectionOverride: command.nodes.map((node) => node.id),
      };
      break;
    case 'delete_nodes': {
      const deletedIds = new Set(command.nodeIds);
      result = {
        nextDocument: replaceDocumentNodes(
          currentDocument,
          removeNodesByIds(currentDocument.nodes, deletedIds)
        ),
      };
      break;
    }
    case 'update_node':
      result = {
        nextDocument: replaceDocumentNodes(
          currentDocument,
          updateItemNode(currentDocument.nodes, command.itemId, command.changes)
        ),
      };
      break;
    case 'update_group':
      result = {
        nextDocument: replaceDocumentNodes(
          currentDocument,
          updateGroupNode(currentDocument.nodes, command.groupId, command.changes)
        ),
      };
      break;
    case 'group_nodes': {
      const grouped = groupNodes(currentDocument.nodes, command.nodeIds);
      result = grouped
        ? {
            nextDocument: replaceDocumentNodes(currentDocument, grouped.nextNodes),
            selectionOverride: [grouped.groupId],
          }
        : { nextDocument: currentDocument };
      break;
    }
    case 'ungroup_node': {
      const ungrouped = ungroupNode(currentDocument.nodes, command.groupId);
      result = ungrouped
        ? {
            nextDocument: replaceDocumentNodes(currentDocument, ungrouped.nextNodes),
            selectionOverride: ungrouped.childIds,
          }
        : { nextDocument: currentDocument };
      break;
    }
    case 'set_canvas_size':
      result = {
        nextDocument: {
          ...currentDocument,
          canvas: {
            width: command.canvas.width,
            height: command.canvas.height,
            presetId: command.canvas.presetId,
          },
          nodes: updateGeneratorItemSizes(
            currentDocument.nodes,
            command.canvas.width,
            command.canvas.height,
          ),
        },
      };
      break;
    case 'set_background':
      result = {
        nextDocument: {
          ...currentDocument,
          background: command.background,
        },
      };
      break;
    case 'set_canvas_name':
      result = {
        nextDocument: {
          ...currentDocument,
          name: command.name,
        },
      };
      break;
    case 'reorder_node':
      result = {
        nextDocument: replaceDocumentNodes(
          currentDocument,
          reorderNodes(currentDocument.nodes, [command.nodeId], command.mode)
        ),
      };
      break;
    case 'reorder_nodes':
      result = {
        nextDocument: replaceDocumentNodes(
          currentDocument,
          reorderNodes(currentDocument.nodes, command.nodeIds, command.mode)
        ),
      };
      break;
    case 'move_node':
      result = {
        nextDocument: replaceDocumentNodes(
          currentDocument,
          moveNode(currentDocument.nodes, command.nodeId, command.targetParentId, command.targetIndex)
        ),
      };
      break;
    case 'register_font': {
      const alreadyRegistered = document.fonts.some(
        (font) =>
          font.family === command.font.family &&
          font.sourceName === command.font.sourceName &&
          font.kind === command.font.kind
      );
      result = {
        nextDocument: alreadyRegistered
          ? currentDocument
          : {
              ...currentDocument,
              fonts: [...currentDocument.fonts, command.font],
            },
      };
      break;
    }
    case 'load_document':
      result = {
        nextDocument: normalizeProjectDocument(command.document as ProjectDocument),
      };
      break;
  }

  return {
    ...result,
    nextDocument: normalizeProjectDocument(result.nextDocument),
  };
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
  commandResult: DocumentCommandResult
): SessionState {
  const selectedNodeIds = commandResult.selectionOverride
    ? commandResult.selectionOverride
    : normalizeSelectionForDocument(session.selectedNodeIds, commandResult.nextDocument);
  return {
    ...session,
    selectedNodeIds,
  };
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
  const commandResult = applyDocumentCommandWithEffects(state.document, action.command);
  const nextSession = applyDocumentSelectionEffects(state.session, commandResult);

  if (!options.suppressHistory && action.command.type === 'load_document') {
    return {
      document: commandResult.nextDocument,
      session: { ...createDefaultSessionState(), availableFonts: state.session.availableFonts },
      history: createDefaultHistoryState(),
      interactionSnapshot: null,
    };
  }

  const suppressForInteraction = state.interactionSnapshot !== null;

  return {
    ...state,
    document: commandResult.nextDocument,
    session: nextSession,
    history:
      options.suppressHistory ||
      suppressForInteraction ||
      !isHistoryWorthyDocumentCommand(action.command)
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
      selectedNodeIds: normalizeSelectionForDocument(
        action.command.type === 'select_nodes'
          ? action.command.nodeIds
          : [],
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
    case 'set_selected_polygon_vertex':
      return {
        ...state,
        session: { ...state.session, selectedPolygonVertex: action.selection },
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
      interactionSnapshot: null,
    };
  }

  if (state.interactionSnapshot !== null) {
    return nextState;
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

function reduceInteractionAction(state: EditorState, action: InteractionAction): EditorState {
  switch (action.type) {
    case 'begin': {
      // Double-begin guard: if already mid-interaction, keep the original snapshot.
      if (state.interactionSnapshot !== null) {
        return state;
      }
      return { ...state, interactionSnapshot: state.document };
    }
    case 'commit': {
      const snapshot = state.interactionSnapshot;
      if (snapshot === null) {
        return state;
      }
      // No net change — drop the snapshot without touching history.
      if (snapshot === state.document) {
        return { ...state, interactionSnapshot: null };
      }
      return {
        ...state,
        interactionSnapshot: null,
        history: {
          past: [...state.history.past, snapshot],
          future: [],
        },
      };
    }
    case 'cancel': {
      const snapshot = state.interactionSnapshot;
      if (snapshot === null) {
        return state;
      }
      return {
        ...state,
        document: snapshot,
        session: {
          ...state.session,
          selectedNodeIds: normalizeSelectionForDocument(
            state.session.selectedNodeIds,
            snapshot
          ),
        },
        interactionSnapshot: null,
      };
    }
  }
}

/**
 * Drop a dangling polygon-vertex sub-selection: it survives only while its
 * polygon is still a selected polygon item whose vertex list covers the index
 * (covers deletes, undo/redo, selection changes, and document loads).
 */
function reconcilePolygonVertexSelection(state: EditorState): EditorState {
  const selection = state.session.selectedPolygonVertex;
  if (!selection) {
    return state;
  }
  const node = getNodeById(state.document.nodes, selection.itemId);
  const valid =
    node !== undefined &&
    !isGroupNode(node) &&
    node.kind === 'polygon' &&
    selection.vertexIndex >= 0 &&
    selection.vertexIndex < node.vertices.length &&
    state.session.selectedNodeIds.includes(selection.itemId);
  if (valid) {
    return state;
  }
  return {
    ...state,
    session: { ...state.session, selectedPolygonVertex: null },
  };
}

export function reduceEditorState(state: EditorState, action: EditorAction): EditorState {
  return reconcilePolygonVertexSelection(reduceEditorStateForAction(state, action));
}

function reduceEditorStateForAction(state: EditorState, action: EditorAction): EditorState {
  switch (action.family) {
    case 'document':
      return reduceDocumentAction(state, action);
    case 'selection':
      return reduceSelectionAction(state, action);
    case 'session':
      return reduceSessionAction(state, action);
    case 'transaction':
      return reduceTransactionAction(state, action);
    case 'interaction':
      return reduceInteractionAction(state, action);
    case 'history':
      // Undo/redo while mid-interaction would corrupt the snapshot's meaning —
      // silently ignore so the drag can complete normally.
      if (state.interactionSnapshot !== null && (action.type === 'undo' || action.type === 'redo')) {
        return state;
      }
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
              selectedNodeIds: normalizeSelectionForDocument(
                state.session.selectedNodeIds,
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
              selectedNodeIds: normalizeSelectionForDocument(
                state.session.selectedNodeIds,
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
  kind: Exclude<CanvasLeafKind, 'image' | 'generator'>,
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
    case 'ngon':
      return createNgonItem(position);
    case 'polygon':
      return createPolygonItem(position);
    case 'line':
      return createLineItem(position);
  }
}

export function ensureFontRegistered(
  document: ProjectDocument,
  font: DocumentFontReference
): ProjectDocument {
  return applyDocumentCommand(document, { type: 'register_font', font });
}

export function applyEditorCommand(document: ProjectDocument, command: EditorCommand): ProjectDocument {
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
