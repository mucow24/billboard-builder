import { useEffect, useRef } from 'react';

import { collectRetainedUploadedFontReferences } from './uploadedFontPersistence';
import type { DocumentFontReference } from '../editor/document/documentTypes';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
import type { StoredFavorite } from '../editor/persistence/favoriteLibraryService';

interface UseUploadedFontPersistenceArgs {
  documentFonts: DocumentFontReference[];
  favorites: StoredFavorite[];
  favoritesReady: boolean;
}

export function useUploadedFontPersistence({
  documentFonts,
  favorites,
  favoritesReady,
}: UseUploadedFontPersistenceArgs) {
  const hasPrunedOnBootstrapRef = useRef(false);

  useEffect(() => {
    if (!favoritesReady || hasPrunedOnBootstrapRef.current) {
      return;
    }

    // Prune persisted uploaded fonts once, when the favorites are known. The editor
    // mounts with the saved canvas already loaded, so `documentFonts` is complete.
    // During the active session, explicit uploads must remain usable even if the user
    // temporarily removes all canvas references before closing the window.
    hasPrunedOnBootstrapRef.current = true;
    void defaultUploadedFontPersistenceService.pruneUnreferenced(
      collectRetainedUploadedFontReferences(documentFonts, favorites),
    );
  }, [documentFonts, favorites, favoritesReady]);
}
