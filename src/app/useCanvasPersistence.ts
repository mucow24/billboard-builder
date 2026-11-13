import { useEffect } from 'react';

import type { ProjectDocument } from '../editor/document/documentTypes';
import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';

interface UseCanvasPersistenceArgs {
  document: ProjectDocument;
  /** The id of the library document `document` is the working copy of. */
  documentId: string;
}

/**
 * Autosaves the canvas shortly after every change, starting with the document
 * the editor mounts with. That must already be the saved canvas (see
 * `useEditorStartup`), or this would overwrite it.
 *
 * This is the working copy, which survives a reload with its unsaved changes.
 * The library version of the document is a separate thing, written only by
 * `useDocumentLibraryController`.
 */
export function useCanvasPersistence({ document, documentId }: UseCanvasPersistenceArgs) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void defaultCanvasPersistenceService.save(document, documentId);
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [document, documentId]);
}
