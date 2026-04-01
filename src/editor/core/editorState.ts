import { createDefaultProjectDocument } from '../document/documentDefaults';
import type { CanvasTool, ProjectDocument, UploadedFont } from '../document/documentTypes';

export interface SessionState {
  activeTool: CanvasTool;
  availableFonts: UploadedFont[];
  missingFontFamilies: string[];
  exportScale: number;
  selectedNodeIds: string[];
}

export interface HistoryState {
  past: ProjectDocument[];
  future: ProjectDocument[];
}

export interface EditorState {
  document: ProjectDocument;
  session: SessionState;
  history: HistoryState;
}

export function createDefaultSessionState(): SessionState {
  return {
    activeTool: 'select',
    availableFonts: [],
    missingFontFamilies: [],
    exportScale: 1,
    selectedNodeIds: [],
  };
}

export function createDefaultHistoryState(): HistoryState {
  return {
    past: [],
    future: [],
  };
}

export function createDefaultEditorState(
  document: ProjectDocument = createDefaultProjectDocument()
): EditorState {
  return {
    document,
    session: createDefaultSessionState(),
    history: createDefaultHistoryState(),
  };
}
