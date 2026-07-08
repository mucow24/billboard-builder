import { createDefaultProjectDocument } from '../document/documentDefaults';
import type { CanvasTool, ProjectDocument, UploadedFont } from '../document/documentTypes';

// A single selected polygon vertex (for handle highlight, Delete, and arrow
// nudges). Sub-selection within the selected polygon: it never exists without
// the polygon itself being selected — the reducer reconciles it after every
// action.
export interface PolygonVertexSelection {
  itemId: string;
  vertexIndex: number;
}

export interface SessionState {
  activeTool: CanvasTool;
  availableFonts: UploadedFont[];
  missingFontFamilies: string[];
  exportScale: number;
  selectedNodeIds: string[];
  selectedPolygonVertex: PolygonVertexSelection | null;
}

export interface HistoryState {
  past: ProjectDocument[];
  future: ProjectDocument[];
}

export interface EditorState {
  document: ProjectDocument;
  session: SessionState;
  history: HistoryState;
  interactionSnapshot: ProjectDocument | null;
}

export function createDefaultSessionState(): SessionState {
  return {
    activeTool: 'select',
    availableFonts: [],
    missingFontFamilies: [],
    exportScale: 1,
    selectedNodeIds: [],
    selectedPolygonVertex: null,
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
    interactionSnapshot: null,
  };
}
