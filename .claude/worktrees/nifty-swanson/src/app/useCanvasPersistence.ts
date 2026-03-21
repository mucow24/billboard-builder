import { useEffect } from 'react';

import type { ProjectDocument } from '../editor/document/documentTypes';
import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';

interface UseCanvasPersistenceArgs {
  document: ProjectDocument;
  persistenceReady: boolean;
}

export function useCanvasPersistence({ document, persistenceReady }: UseCanvasPersistenceArgs) {
  useEffect(() => {
    if (!persistenceReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void defaultCanvasPersistenceService.save(document);
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [document, persistenceReady]);
}
