import {
  collectLeafItems,
  getNodeById,
  isCanvasItemNode,
  isGroupNode,
} from '../document/sceneGraph';
import type { CanvasItem, CanvasNode, GroupNode, ProjectDocument } from '../document/documentTypes';
import type { EditorState, HistoryState, SessionState } from './editorState';

type SelectionSource = SessionState | Pick<EditorState, 'session'>;

function getSession(selection: SelectionSource): SessionState {
  return 'session' in selection ? selection.session : selection;
}

function getSelectedNodeIds(selection: SelectionSource): string[] {
  return getSession(selection).selectedNodeIds;
}

export function selectPrimarySelectedNodeId(selection: SelectionSource): string | undefined {
  return getSelectedNodeIds(selection)[0];
}

export function selectSelectedNodes(
  document: ProjectDocument,
  selection: SelectionSource
): CanvasNode[] {
  return getSelectedNodeIds(selection)
    .map((nodeId) => getNodeById(document.nodes, nodeId))
    .filter((node): node is CanvasNode => Boolean(node));
}

export function selectSelectedNode(
  document: ProjectDocument,
  selection: SelectionSource
): CanvasNode | undefined {
  const selectedId = selectPrimarySelectedNodeId(selection);
  return selectedId ? getNodeById(document.nodes, selectedId) : undefined;
}

export function selectSelectedGroup(
  document: ProjectDocument,
  selection: SelectionSource
): GroupNode | undefined {
  const selectedNode = selectSelectedNode(document, selection);
  return selectedNode && isGroupNode(selectedNode) ? selectedNode : undefined;
}

export function selectSelectedItem(
  document: ProjectDocument,
  selection: SelectionSource
): CanvasItem | undefined {
  const selectedNode = selectSelectedNode(document, selection);
  return selectedNode && isCanvasItemNode(selectedNode) ? selectedNode : undefined;
}

export function selectSelectedItems(
  document: ProjectDocument,
  selection: SelectionSource
): CanvasItem[] {
  return selectSelectedNodes(document, selection).flatMap((node) =>
    isCanvasItemNode(node) ? [node] : collectLeafItems(node)
  );
}

export function selectCanUndo(history: HistoryState | Pick<EditorState, 'history'>): boolean {
  return ('history' in history ? history.history : history).past.length > 0;
}

export function selectCanRedo(history: HistoryState | Pick<EditorState, 'history'>): boolean {
  return ('history' in history ? history.history : history).future.length > 0;
}

export function selectAvailableFonts(session: SessionState | Pick<EditorState, 'session'>) {
  return ('session' in session ? session.session : session).availableFonts;
}

export function selectMissingFontFamilies(session: SessionState | Pick<EditorState, 'session'>): string[] {
  return ('session' in session ? session.session : session).missingFontFamilies;
}
