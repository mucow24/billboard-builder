import { useEffect, useRef } from 'react';

import { collectRetainedUploadedFontReferences } from './uploadedFontPersistence';
import type { DocumentFontReference } from '../editor/document/documentTypes';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
import type { StoredTemplate } from '../editor/persistence/templateLibraryService';

interface UseUploadedFontPersistenceArgs {
  documentFonts: DocumentFontReference[];
  persistenceReady: boolean;
  templates: StoredTemplate[];
  templatesReady: boolean;
}

export function useUploadedFontPersistence({
  documentFonts,
  persistenceReady,
  templates,
  templatesReady,
}: UseUploadedFontPersistenceArgs) {
  const hasPrunedOnBootstrapRef = useRef(false);

  useEffect(() => {
    if (!persistenceReady || !templatesReady || hasPrunedOnBootstrapRef.current) {
      return;
    }

    // Prune persisted uploaded fonts once after bootstrap/template hydration settles.
    // During the active session, explicit uploads must remain usable even if the user
    // temporarily removes all canvas references before closing the window.
    hasPrunedOnBootstrapRef.current = true;
    void defaultUploadedFontPersistenceService.pruneUnreferenced(
      collectRetainedUploadedFontReferences(documentFonts, templates),
    );
  }, [documentFonts, persistenceReady, templates, templatesReady]);
}
