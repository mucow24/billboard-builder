import { useEffect } from 'react';

import type { ProjectDocument } from '../editor/document/documentTypes';
import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';

interface UseCanvasPersistenceArgs {
  document: ProjectDocument;
}

/**
 * Autosaves the canvas shortly after every change, starting with the document
 * the editor mounts with. That must already be the saved canvas (see
 * `useEditorStartup`), or this would overwrite it.
 */
export function useCanvasPersistence({ document }: UseCanvasPersistenceArgs) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void defaultCanvasPersistenceService.save(document);
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [document]);
}
