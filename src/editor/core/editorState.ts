import { createDefaultProjectDocument } from '../document/documentDefaults';
import type { CanvasTool, ProjectDocumentV1, UploadedFont } from '../document/documentTypes';

export interface SessionState {
  activeTool: CanvasTool;
  availableFonts: UploadedFont[];
  missingFontFamilies: string[];
  exportScale: number;
  selectedItemIds: string[];
}

export interface HistoryState {
  past: ProjectDocumentV1[];
  future: ProjectDocumentV1[];
}

export interface EditorState {
  document: ProjectDocumentV1;
  session: SessionState;
  history: HistoryState;
}

export function createDefaultSessionState(): SessionState {
  return {
    activeTool: 'select',
    availableFonts: [],
    missingFontFamilies: [],
    exportScale: 1,
    selectedItemIds: [],
  };
}

export function createDefaultHistoryState(): HistoryState {
  return {
    past: [],
    future: [],
  };
}

export function createDefaultEditorState(
  document: ProjectDocumentV1 = createDefaultProjectDocument()
): EditorState {
  return {
    document,
    session: createDefaultSessionState(),
    history: createDefaultHistoryState(),
  };
}
