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
  type DocumentLibraryPreviews,
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
  /** The entries of the documents in the library that could be read, newest save first. */
  entries: DocumentLibraryEntry[];
  /**
   * False when the library could not be listed at startup, or not all of it:
   * it may then hold documents, and need fonts, that `entries` does not show.
   */
  entriesKnown: boolean;
  /**
   * The preview images read or made so far, by document id. They are not read
   * at startup: the library dialog asks for them when it opens.
   */
  previews: DocumentLibraryPreviews;
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
    previews: {},
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
  /** True once the startup this belongs to has been abandoned: the session is then left alone. */
  isCancelled?: () => boolean;
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
  isCancelled = () => false,
  library = defaultDocumentLibraryService,
  canvas = defaultCanvasPersistenceService,
}: LoadDocumentLibrarySessionArgs): Promise<void> {
  const state = createInitialState();

  try {
    const listing = await library.listEntries();
    state.entries = listing.entries;
    state.entriesKnown = listing.complete;
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

  if (!isCancelled()) {
    useDocumentLibrarySession.setState(state);
  }
}
