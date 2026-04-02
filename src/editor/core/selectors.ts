import {
  collectLeafItems,
  getNodeById,
  isCanvasItemNode,
  isGroupNode,
} from '../document/sceneGraph';
import type { CanvasItem, CanvasNode, GroupNode, ProjectDocument } from '../document/documentTypes';
import type { EditorState, HistoryState, SessionState } from './editorState';

export function selectPrimarySelectedNodeId(state: EditorState): string | undefined {
  return state.session.selectedNodeIds[0];
}

export function selectSelectedNodes(
  document: ProjectDocument,
  state: EditorState
): CanvasNode[] {
  return state.session.selectedNodeIds
    .map((nodeId) => getNodeById(document.nodes, nodeId))
    .filter((node): node is CanvasNode => Boolean(node));
}

export function selectSelectedNode(
  document: ProjectDocument,
  state: EditorState
): CanvasNode | undefined {
  const selectedId = selectPrimarySelectedNodeId(state);
  return selectedId ? getNodeById(document.nodes, selectedId) : undefined;
}

export function selectSelectedGroup(
  document: ProjectDocument,
  state: EditorState
): GroupNode | undefined {
  const selectedNode = selectSelectedNode(document, state);
  return selectedNode && isGroupNode(selectedNode) ? selectedNode : undefined;
}

export function selectSelectedItem(
  document: ProjectDocument,
  state: EditorState
): CanvasItem | undefined {
  const selectedNode = selectSelectedNode(document, state);
  return selectedNode && isCanvasItemNode(selectedNode) ? selectedNode : undefined;
}

export function selectSelectedItems(
  document: ProjectDocument,
  state: EditorState
): CanvasItem[] {
  return selectSelectedNodes(document, state).flatMap((node) =>
    isCanvasItemNode(node) ? [node] : collectLeafItems(node)
  );
}

export function selectCanUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function selectCanRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

export function selectAvailableFonts(session: SessionState) {
  return session.availableFonts;
}

export function selectMissingFontFamilies(session: SessionState): string[] {
  return session.missingFontFamilies;
}
