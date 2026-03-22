import { useEffect, useRef } from 'react';

import { collectRetainedUploadedFontReferences } from './uploadedFontPersistence';
import type { DocumentFontReference } from '../editor/document/documentTypes';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
import type { StoredFavorite } from '../editor/persistence/favoriteLibraryService';

interface UseUploadedFontPersistenceArgs {
  documentFonts: DocumentFontReference[];
  favorites: StoredFavorite[];
  favoritesReady: boolean;
  persistenceReady: boolean;
}

export function useUploadedFontPersistence({
  documentFonts,
  favorites,
  favoritesReady,
  persistenceReady,
}: UseUploadedFontPersistenceArgs) {
  const hasPrunedOnBootstrapRef = useRef(false);

  useEffect(() => {
    if (!persistenceReady || !favoritesReady || hasPrunedOnBootstrapRef.current) {
      return;
    }

    // Prune persisted uploaded fonts once after bootstrap/favorites hydration settles.
    // During the active session, explicit uploads must remain usable even if the user
    // temporarily removes all canvas references before closing the window.
    hasPrunedOnBootstrapRef.current = true;
    void defaultUploadedFontPersistenceService.pruneUnreferenced(
      collectRetainedUploadedFontReferences(documentFonts, favorites),
    );
  }, [documentFonts, favorites, favoritesReady, persistenceReady]);
}
