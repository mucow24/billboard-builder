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

interface UseDocumentLibraryControllerArgs {
  document: ProjectDocument;
  /** Draws a small image of the canvas as it is shown now; null when it cannot be drawn. */
  capturePreview: (document: ProjectDocument) => Promise<string | null>;
  setErrorMessage: (message: string | null) => void;
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
 * A document with unsaved changes is saved to the library before another
 * takes its place, and the switch is called off if that save fails, so leaving
 * a document never loses work. Each of these operations runs alone: while one
 * is under way (`busy`) the others do nothing, and the editor should take no
 * input.
 */
export function useDocumentLibraryController({
  document,
  capturePreview,
  setErrorMessage,
}: UseDocumentLibraryControllerArgs) {
  const { currentId, savedDocument, entries, switching } = useDocumentLibrarySession();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const capturePreviewRef = useRef(capturePreview);
  useEffect(() => {
    capturePreviewRef.current = capturePreview;
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
      let preview = existingEntry?.preview ?? null;
      try {
        preview = (await capturePreviewRef.current(editorDocument)) ?? preview;
      } catch (error) {
        console.warn('No preview could be drawn for the library.', error);
      }

      const now = Date.now();
      const entry: DocumentLibraryEntry = {
        id: session.currentId,
        name: editorDocument.name,
        createdAt: existingEntry?.createdAt ?? now,
        updatedAt: now,
        preview,
        fonts: editorDocument.fonts,
      };
      try {
        await defaultDocumentLibraryService.save(entry, editorDocument);
      } catch (error) {
        setErrorMessage(
          `Failed to save "${editorDocument.name}" to the library: ${getErrorMessage(error, 'Unknown error.')}`,
        );
        return false;
      }

      useDocumentLibrarySession.setState((state) => ({
        savedDocument: editorDocument,
        entries: upsertLibraryEntry(state.entries, entry),
      }));
      return true;
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

    /** Canvas > New: saves the open document, then starts a blank one. */
    function newDocument(): Promise<boolean> {
      return runExclusive(false, async () => {
        if (!(await commitCurrentDocument())) {
          return false;
        }
        await putDocumentInEditor(createDefaultProjectDocument(), crypto.randomUUID(), false);
        setErrorMessage(null);
        return true;
      });
    }

    /** Saves the open document, then opens a document from the library. */
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
          return false;
        }

        if (!(await commitCurrentDocument())) {
          return false;
        }
        await restoreUploadedFonts(libraryDocument.fonts);
        await putDocumentInEditor(libraryDocument, id, true);
        setErrorMessage(null);
        return true;
      });
    }

    /** Canvas > Load > From JSON: saves the open document, then opens the file as a new one. */
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

        if (!(await commitCurrentDocument())) {
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
        useDocumentLibrarySession.setState((state) => ({
          entries: state.entries.filter((candidate) => candidate.id !== id),
        }));
        if (id === useDocumentLibrarySession.getState().currentId) {
          await putDocumentInEditor(createDefaultProjectDocument(), crypto.randomUUID(), false);
        }
        setErrorMessage(null);
        return true;
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

    return {
      saveDocument,
      revertDocument,
      newDocument,
      openLibraryDocument,
      importProjectFile,
      renameLibraryDocument,
      deleteLibraryDocument,
      exportLibraryDocument,
    };
  }, [setErrorMessage]);

  return {
    actions,
    state: {
      /** The id of the document in the editor. */
      documentId: currentId,
      entries,
      /** The document in the editor differs from its saved version, or was never saved and is not blank. */
      hasUnsavedChanges: unsavedChanges,
      /** There are unsaved changes and a saved version to go back to. */
      canRevert: unsavedChanges && savedDocument !== null,
      /** A library operation is under way: the editor should take no input. */
      busy,
    },
  };
}
