import { create } from 'zustand';

import type { ProjectDocument } from '../editor/document/documentTypes';
import {
  defaultCanvasPersistenceService,
  type CanvasPersistenceService,
} from '../editor/persistence/canvasPersistenceService';
import {
  defaultDocumentLibraryService,
  sortLibraryEntries,
  type DocumentLibraryEntry,
  type DocumentLibraryService,
} from '../editor/persistence/documentLibraryService';

/**
 * How the document in the editor relates to the library.
 *
 * The editor always holds a working copy, autosaved as it changes. The library
 * holds saved versions: one is written by Canvas > Save, and whenever a
 * document with unsaved changes is left for another. A working copy that
 * differs from its saved version has unsaved changes.
 */
export interface DocumentLibrarySessionState {
  /** The id of the document in the editor. The library has an entry for it only once it was saved. */
  currentId: string;
  /** The saved version of the document in the editor, or null if it was never saved. */
  savedDocument: ProjectDocument | null;
  /** The entries of the documents in the library, newest save first. */
  entries: DocumentLibraryEntry[];
  /** False when the library could not be listed at startup, so what it holds is unknown. */
  entriesKnown: boolean;
  /**
   * True while another document is being put in the editor. In between, the
   * document in the editor and `currentId` may not belong together.
   */
  switching: boolean;
}

function createInitialState(): DocumentLibrarySessionState {
  return {
    currentId: crypto.randomUUID(),
    savedDocument: null,
    entries: [],
    entriesKnown: false,
    switching: false,
  };
}

export const useDocumentLibrarySession = create<DocumentLibrarySessionState>(createInitialState);

/** Forgets the session, as if the app had just started with an empty library. */
export function resetDocumentLibrarySession() {
  useDocumentLibrarySession.setState(createInitialState());
}

/** `entries` with `entry` added, or replacing the entry of the same document. */
export function upsertLibraryEntry(
  entries: DocumentLibraryEntry[],
  entry: DocumentLibraryEntry,
): DocumentLibraryEntry[] {
  return sortLibraryEntries([...entries.filter((existing) => existing.id !== entry.id), entry]);
}

interface LoadDocumentLibrarySessionArgs {
  /** Whether a saved canvas was read, which startup then puts in the editor as the working copy. */
  hasWorkingCopy: boolean;
  library?: DocumentLibraryService;
  canvas?: CanvasPersistenceService;
}

/**
 * Reads, at startup, what the library holds and which of its documents the
 * saved canvas is a working copy of. Run it before the editor is shown.
 *
 * Nothing here can stop the editor from starting: whatever cannot be read is
 * logged, and the working copy then counts as a document that was never saved.
 */
export async function loadDocumentLibrarySession({
  hasWorkingCopy,
  library = defaultDocumentLibraryService,
  canvas = defaultCanvasPersistenceService,
}: LoadDocumentLibrarySessionArgs): Promise<void> {
  const state = createInitialState();

  try {
    state.entries = await library.listEntries();
    state.entriesKnown = true;
  } catch (error) {
    console.warn('The document library could not be read.', error);
  }

  // Without a working copy the editor starts on a blank canvas, which must not
  // pass for an edited version of whichever document was open last.
  if (hasWorkingCopy) {
    try {
      const storedId = await canvas.loadDocumentId();
      if (storedId) {
        state.currentId = storedId;
        const entry = state.entries.find((candidate) => candidate.id === storedId);
        state.savedDocument = entry ? await library.loadDocument(entry) : null;
      }
    } catch (error) {
      console.warn('The saved version of the open document could not be read.', error);
    }
  }

  useDocumentLibrarySession.setState(state);
}
