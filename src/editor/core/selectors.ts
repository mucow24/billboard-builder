import type { CanvasItem, ProjectDocumentV1 } from '../document/documentTypes';
import type { EditorState, HistoryState, SessionState } from './editorState';

type SelectionSource = SessionState | Pick<EditorState, 'session'>;

function getSession(selection: SelectionSource): SessionState {
  return 'session' in selection ? selection.session : selection;
}

function getSelectedItemIds(selection: SelectionSource): string[] {
  return getSession(selection).selectedItemIds;
}

export function selectPrimarySelectedItemId(selection: SelectionSource): string | undefined {
  return getSelectedItemIds(selection)[0];
}

export function selectSelectedItems(
  document: ProjectDocumentV1,
  selection: SelectionSource
): CanvasItem[] {
  const selectedIds = new Set(getSelectedItemIds(selection));
  return document.items.filter((item) => selectedIds.has(item.id));
}

export function selectSelectedItem(
  document: ProjectDocumentV1,
  selection: SelectionSource
): CanvasItem | undefined {
  const selectedId = selectPrimarySelectedItemId(selection);
  return selectedId ? document.items.find((item) => item.id === selectedId) : undefined;
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
