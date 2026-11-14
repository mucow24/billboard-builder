import { useEffect, useMemo, useRef, useState } from 'react';

import {
  upsertLibraryEntry,
  useDocumentLibrarySession,
} from './documentLibrarySession';
import { getErrorMessage } from './errorUtils';
import { restoreUploadedFontsForReferences } from './uploadedFontPersistence';
import { hasUnsavedChanges } from '../editor/document/documentComparison';
import {
  createDefaultProjectDocument,
  DEFAULT_CANVAS_NAME,
} from '../editor/document/documentDefaults';
import type { DocumentFontReference, ProjectDocument } from '../editor/document/documentTypes';
import { sanitizeBasename } from '../editor/io/filename';
import { downloadProject, readProjectFile } from '../editor/io/projectFile';
import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';
import {
  defaultDocumentLibraryService,
  type DocumentLibraryEntry,
} from '../editor/persistence/documentLibraryService';
import { useEditorStore } from '../editor/state/store';

/** What is about to be left behind, for the question put to the user. */
export interface LeaveRequest {
  documentName: string;
  /** The document is not in the library at all, so discarding it loses all of it. */
  neverSaved: boolean;
}

/** What to do with unsaved changes before another document takes their place. */
export type LeaveChoice = 'save' | 'discard' | 'cancel';

interface UseDocumentLibraryControllerArgs {
  document: ProjectDocument;
  /** Draws a small image of the canvas as it is shown now; null when it cannot be drawn. */
  capturePreview: (document: ProjectDocument) => Promise<string | null>;
  /**
   * Asks the user what to do with the unsaved changes of the document that is
   * about to be replaced. Only asked when there are any.
   */
  confirmLeave: (request: LeaveRequest) => Promise<LeaveChoice>;
  setErrorMessage: (message: string | null) => void;
}

/**
 * The name for a copy of a document named `name`: "<name> copy", or
 * "<name> copy 2", "<name> copy 3"... when the library already has that name.
 * A copy of a copy counts on from it, rather than getting "copy copy".
 */
export function nameForCopy(name: string, takenNames: Iterable<string>): string {
  const taken = new Set(takenNames);
  const base = name.replace(/ copy(?: \d+)?$/, '');
  const first = `${base} copy`;
  if (!taken.has(first)) {
    return first;
  }
  for (let index = 2; ; index++) {
    const candidate = `${first} ${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** Registers the stored uploaded fonts a document is about to need. Never fails. */
async function restoreUploadedFonts(references: DocumentFontReference[]) {
  const { editor, registerAvailableFont } = useEditorStore.getState();
  try {
    await restoreUploadedFontsForReferences({
      references,
      availableFonts: editor.session.availableFonts,
      registerAvailableFont,
    });
  } catch (error) {
    console.warn('Uploaded fonts of the document could not be restored.', error);
  }
}

/**
 * Puts another document in the editor, with a fresh undo history, and stores
 * it as the working copy. `isSavedVersion` says the document is exactly what
 * the library holds for `id`.
 */
async function putDocumentInEditor(document: ProjectDocument, id: string, isSavedVersion: boolean) {
  useDocumentLibrarySession.setState({ switching: true });
  useEditorStore.getState().loadDocument(document);
  const editorDocument = useEditorStore.getState().editor.document;
  useDocumentLibrarySession.setState({
    currentId: id,
    // The editor normalizes what it loads: keep that very object, so the
    // document compares as unchanged without a deep comparison.
    savedDocument: isSavedVersion ? editorDocument : null,
    switching: false,
  });

  // Not left to the autosave, which waits a moment: a reload right after the
  // switch would bring the previous document back.
  try {
    await defaultCanvasPersistenceService.save(editorDocument, id);
  } catch (error) {
    console.warn('The newly opened document could not be autosaved yet.', error);
  }
}

/**
 * The document library, as the editor uses it: saving the document in the
 * editor, reverting it, starting or opening another, and managing the saved
 * ones.
 *
 * Unsaved changes are never dropped, or saved over the saved version, without
 * the user saying so: before another document takes the place of one that has
 * them, the user is asked whether to save them, discard them, or stay. If that
 * save fails the switch is called off. Each of these operations runs alone:
 * while one is under way (`busy`) the others do nothing, and the editor should
 * take no input other than the answer to that question.
 */
export function useDocumentLibraryController({
  document,
  capturePreview,
  confirmLeave,
  setErrorMessage,
}: UseDocumentLibraryControllerArgs) {
  const { currentId, savedDocument, entries, entriesKnown, previews, switching } =
    useDocumentLibrarySession();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const capturePreviewRef = useRef(capturePreview);
  const confirmLeaveRef = useRef(confirmLeave);
  useEffect(() => {
    capturePreviewRef.current = capturePreview;
    confirmLeaveRef.current = confirmLeave;
  });

  const unsavedChanges = useMemo(
    () => hasUnsavedChanges(document, savedDocument),
    [document, savedDocument],
  );

  // The name of the open document is not part of its unsaved changes: the
  // library lists it under its current name at all times.
  const currentEntry = entries.find((entry) => entry.id === currentId);
  useEffect(() => {
    if (switching || !currentEntry || currentEntry.name === document.name) {
      return;
    }
    const renamedEntry = { ...currentEntry, name: document.name };
    useDocumentLibrarySession.setState((state) => ({
      entries: upsertLibraryEntry(state.entries, renamedEntry),
    }));
    defaultDocumentLibraryService.updateEntry(renamedEntry).catch((error: unknown) => {
      console.warn('The new name of the document could not be stored in the library.', error);
    });
  }, [currentEntry, document.name, switching]);

  const actions = useMemo(() => {
    /** Runs `operation` unless another one is under way, in which case it resolves to `skipped`. */
    async function runExclusive<T>(skipped: T, operation: () => Promise<T>): Promise<T> {
      if (busyRef.current) {
        return skipped;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        return await operation();
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    }

    /**
     * Saves the document in the editor to the library if it has unsaved
     * changes. False when it could not be saved; the reason is then shown.
     */
    async function commitCurrentDocument(): Promise<boolean> {
      const editorDocument = useEditorStore.getState().editor.document;
      const session = useDocumentLibrarySession.getState();
      if (!hasUnsavedChanges(editorDocument, session.savedDocument)) {
        return true;
      }

      const existingEntry = session.entries.find((entry) => entry.id === session.currentId);
      // Without a new preview the library keeps the one it has.
      let preview: string | null = null;
      try {
        preview = await capturePreviewRef.current(editorDocument);
      } catch (error) {
        console.warn('No preview could be drawn for the library.', error);
      }

      const now = Date.now();
      const entry: DocumentLibraryEntry = {
        id: session.currentId,
        name: editorDocument.name,
        createdAt: existingEntry?.createdAt ?? now,
        updatedAt: now,
        fonts: editorDocument.fonts,
      };
      try {
        await defaultDocumentLibraryService.save(entry, editorDocument, preview);
      } catch (error) {
        setErrorMessage(
          `Failed to save "${editorDocument.name}" to the library: ${getErrorMessage(error, 'Unknown error.')}`,
        );
        return false;
      }

      useDocumentLibrarySession.setState((state) => ({
        savedDocument: editorDocument,
        entries: upsertLibraryEntry(state.entries, entry),
        previews: preview === null ? state.previews : { ...state.previews, [entry.id]: preview },
      }));
      return true;
    }

    /**
     * Settles what happens to the unsaved changes of the document in the
     * editor before another takes its place. True when it may be replaced:
     * nothing was unsaved, the user had it saved, or chose to discard it.
     */
    async function leaveCurrentDocument(): Promise<boolean> {
      const editorDocument = useEditorStore.getState().editor.document;
      const { savedDocument: saved } = useDocumentLibrarySession.getState();
      if (!hasUnsavedChanges(editorDocument, saved)) {
        return true;
      }
      const choice = await confirmLeaveRef.current({
        documentName: editorDocument.name,
        neverSaved: saved === null,
      });
      if (choice === 'cancel') {
        return false;
      }
      return choice === 'discard' || commitCurrentDocument();
    }

    /** Canvas > Save: stores the unsaved changes in the library. */
    function saveDocument(): Promise<boolean> {
      return runExclusive(false, async () => {
        const saved = await commitCurrentDocument();
        if (saved) {
          setErrorMessage(null);
        }
        return saved;
      });
    }

    /**
     * Canvas > Revert: goes back to the saved version, keeping the current
     * name. It is one undoable step, so the reverted changes can be had back.
     */
    function revertDocument(): Promise<boolean> {
      return runExclusive(false, async () => {
        const { savedDocument: target } = useDocumentLibrarySession.getState();
        if (!target || !hasUnsavedChanges(useEditorStore.getState().editor.document, target)) {
          return false;
        }
        await restoreUploadedFonts(target.fonts);

        const { applyTransaction, editor } = useEditorStore.getState();
        applyTransaction([
          {
            family: 'document',
            command: { type: 'load_document', document: { ...target, name: editor.document.name } },
          },
          { family: 'selection', command: { type: 'clear_selection' } },
        ]);
        setErrorMessage(null);
        return true;
      });
    }

    /** Canvas > New: starts a blank document, once the open one may be left. */
    function newDocument(): Promise<boolean> {
      return runExclusive(false, async () => {
        if (!(await leaveCurrentDocument())) {
          return false;
        }
        await putDocumentInEditor(createDefaultProjectDocument(), crypto.randomUUID(), false);
        setErrorMessage(null);
        return true;
      });
    }

    /** Opens a document from the library, once the open one may be left. */
    function openLibraryDocument(id: string): Promise<boolean> {
      return runExclusive(false, async () => {
        const session = useDocumentLibrarySession.getState();
        if (id === session.currentId) {
          return true;
        }
        const entry = session.entries.find((candidate) => candidate.id === id);
        if (!entry) {
          return false;
        }

        let libraryDocument: ProjectDocument | null;
        try {
          libraryDocument = await defaultDocumentLibraryService.loadDocument(entry);
        } catch (error) {
          setErrorMessage(
            `Failed to open "${entry.name}" from the library: ${getErrorMessage(error, 'Unknown error.')}`,
          );
          return false;
        }
        if (!libraryDocument) {
          setErrorMessage(`"${entry.name}" is no longer in the library.`);
          useDocumentLibrarySession.setState((state) => ({
            entries: state.entries.filter((candidate) => candidate.id !== id),
          }));
          // Take the entry out of storage too, or it is back after a reload.
          defaultDocumentLibraryService.remove(id).catch((error: unknown) => {
            console.warn('The entry of a missing library document could not be removed.', error);
          });
          return false;
        }

        if (!(await leaveCurrentDocument())) {
          return false;
        }
        await restoreUploadedFonts(libraryDocument.fonts);
        await putDocumentInEditor(libraryDocument, id, true);
        setErrorMessage(null);
        return true;
      });
    }

    /** Canvas > Load > From JSON: opens the file as a new document, once the open one may be left. */
    function importProjectFile(files: FileList | null): Promise<boolean> {
      const file = files?.[0];
      if (!file) {
        return Promise.resolve(false);
      }
      return runExclusive(false, async () => {
        let fileDocument: ProjectDocument;
        try {
          fileDocument = await readProjectFile(file);
        } catch (error) {
          setErrorMessage(`Failed to open project: ${getErrorMessage(error, 'Unknown error.')}`);
          return false;
        }

        if (!(await leaveCurrentDocument())) {
          return false;
        }
        await restoreUploadedFonts(fileDocument.fonts);
        await putDocumentInEditor(fileDocument, crypto.randomUUID(), false);
        setErrorMessage(null);
        return true;
      });
    }

    /** Renames a library document. The open one is renamed in the editor, which the library follows. */
    function renameLibraryDocument(id: string, name: string) {
      const session = useDocumentLibrarySession.getState();
      const entry = session.entries.find((candidate) => candidate.id === id);
      const nextName = name.trim();
      if (!entry || nextName.length === 0 || nextName === entry.name) {
        return;
      }
      if (id === session.currentId) {
        useEditorStore.getState().dispatch({ type: 'set_canvas_name', name: nextName });
        return;
      }
      const renamedEntry = { ...entry, name: nextName };
      useDocumentLibrarySession.setState((state) => ({
        entries: upsertLibraryEntry(state.entries, renamedEntry),
      }));
      defaultDocumentLibraryService.updateEntry(renamedEntry).catch((error: unknown) => {
        setErrorMessage(
          `Failed to rename "${entry.name}" in the library: ${getErrorMessage(error, 'Unknown error.')}`,
        );
      });
    }

    /**
     * Deletes a document from the library for good. Deleting the open one also
     * discards its working copy: the editor starts a blank document.
     */
    function deleteLibraryDocument(id: string): Promise<boolean> {
      return runExclusive(false, async () => {
        const entry = useDocumentLibrarySession
          .getState()
          .entries.find((candidate) => candidate.id === id);
        if (!entry) {
          return false;
        }
        try {
          await defaultDocumentLibraryService.remove(id);
        } catch (error) {
          setErrorMessage(
            `Failed to delete "${entry.name}" from the library: ${getErrorMessage(error, 'Unknown error.')}`,
          );
          return false;
        }
        useDocumentLibrarySession.setState((state) => {
          const remainingPreviews = { ...state.previews };
          delete remainingPreviews[id];
          return {
            entries: state.entries.filter((candidate) => candidate.id !== id),
            previews: remainingPreviews,
          };
        });
        if (id === useDocumentLibrarySession.getState().currentId) {
          await putDocumentInEditor(createDefaultProjectDocument(), crypto.randomUUID(), false);
        }
        setErrorMessage(null);
        return true;
      });
    }

    /**
     * Adds a copy of the saved version of a library document to the library,
     * with its preview, under a name of its own. The document in the editor
     * stays open.
     */
    function duplicateLibraryDocument(id: string): Promise<boolean> {
      return runExclusive(false, async () => {
        const session = useDocumentLibrarySession.getState();
        const entry = session.entries.find((candidate) => candidate.id === id);
        if (!entry) {
          return false;
        }
        try {
          const libraryDocument = await defaultDocumentLibraryService.loadDocument(entry);
          if (!libraryDocument) {
            throw new Error('It is no longer in the library.');
          }
          let preview = session.previews[id] ?? null;
          if (preview === null) {
            try {
              preview = (await defaultDocumentLibraryService.loadPreviews())[id] ?? null;
            } catch (error) {
              console.warn('The preview of the duplicated document could not be read.', error);
            }
          }

          const now = Date.now();
          const copy: DocumentLibraryEntry = {
            id: crypto.randomUUID(),
            name: nameForCopy(
              entry.name,
              session.entries.map((candidate) => candidate.name),
            ),
            createdAt: now,
            updatedAt: now,
            fonts: entry.fonts,
          };
          await defaultDocumentLibraryService.save(copy, libraryDocument, preview);
          useDocumentLibrarySession.setState((state) => ({
            entries: upsertLibraryEntry(state.entries, copy),
            previews: preview === null ? state.previews : { ...state.previews, [copy.id]: preview },
          }));
          setErrorMessage(null);
          return true;
        } catch (error) {
          setErrorMessage(
            `Failed to duplicate "${entry.name}": ${getErrorMessage(error, 'Unknown error.')}`,
          );
          return false;
        }
      });
    }

    /** Downloads the saved version of a library document as a JSON project file. */
    async function exportLibraryDocument(id: string): Promise<boolean> {
      const entry = useDocumentLibrarySession
        .getState()
        .entries.find((candidate) => candidate.id === id);
      if (!entry) {
        return false;
      }
      try {
        const libraryDocument = await defaultDocumentLibraryService.loadDocument(entry);
        if (!libraryDocument) {
          throw new Error('It is no longer in the library.');
        }
        downloadProject(
          libraryDocument,
          `${sanitizeBasename(entry.name, DEFAULT_CANVAS_NAME)}.json`,
        );
        return true;
      } catch (error) {
        setErrorMessage(
          `Failed to export "${entry.name}": ${getErrorMessage(error, 'Unknown error.')}`,
        );
        return false;
      }
    }

    /**
     * Reads the preview images from storage, for the library dialog. They are
     * left out of startup, which would otherwise wait for every one of them.
     */
    async function loadLibraryPreviews(): Promise<void> {
      try {
        const storedPreviews = await defaultDocumentLibraryService.loadPreviews();
        useDocumentLibrarySession.setState((state) => ({
          previews: { ...state.previews, ...storedPreviews },
        }));
      } catch (error) {
        console.warn('The library previews could not be read.', error);
      }
    }

    return {
      saveDocument,
      revertDocument,
      newDocument,
      openLibraryDocument,
      importProjectFile,
      renameLibraryDocument,
      deleteLibraryDocument,
      duplicateLibraryDocument,
      exportLibraryDocument,
      loadLibraryPreviews,
    };
  }, [setErrorMessage]);

  return {
    actions,
    state: {
      /** The id of the document in the editor. */
      documentId: currentId,
      entries,
      /** False when the library could not be read, or not all of it: `entries` may be missing documents. */
      entriesKnown,
      /** The preview images read or made so far, by document id. */
      previews,
      /** The document in the editor differs from its saved version, or was never saved and is not blank. */
      hasUnsavedChanges: unsavedChanges,
      /** There are unsaved changes and a saved version to go back to. */
      canRevert: unsavedChanges && savedDocument !== null,
      /** A library operation is under way: the editor should take no input. */
      busy,
    },
  };
}
