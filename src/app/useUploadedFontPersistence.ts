import { useEffect, useRef } from 'react';

import { collectRetainedUploadedFontReferences } from './uploadedFontPersistence';
import type { DocumentFontReference } from '../editor/document/documentTypes';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
import type { StoredFavorite } from '../editor/persistence/favoriteLibraryService';

interface UseUploadedFontPersistenceArgs {
  documentFonts: DocumentFontReference[];
  /** The imported font files behind the fonts starred in the font menu. */
  favoriteFontFiles: DocumentFontReference[];
  favorites: StoredFavorite[];
  favoritesReady: boolean;
  /** The fonts used by the saved versions of the documents in the library. */
  libraryFonts: DocumentFontReference[];
  /** False when it is not known what the library holds: nothing is pruned then. */
  libraryReady: boolean;
}

export function useUploadedFontPersistence({
  documentFonts,
  favoriteFontFiles,
  favorites,
  favoritesReady,
  libraryFonts,
  libraryReady,
}: UseUploadedFontPersistenceArgs) {
  const hasPrunedOnBootstrapRef = useRef(false);

  useEffect(() => {
    if (!favoritesReady || !libraryReady || hasPrunedOnBootstrapRef.current) {
      return;
    }

    // Prune persisted uploaded fonts once, when the favorites and the library are
    // known. The editor mounts with the saved canvas already loaded, so
    // `documentFonts` is complete.
    // During the active session, explicit uploads must remain usable even if the user
    // temporarily removes all canvas references before closing the window.
    hasPrunedOnBootstrapRef.current = true;
    void defaultUploadedFontPersistenceService.pruneUnreferenced(
      collectRetainedUploadedFontReferences(
        [...documentFonts, ...libraryFonts, ...favoriteFontFiles],
        favorites,
      ),
    );
  }, [documentFonts, favoriteFontFiles, favorites, favoritesReady, libraryFonts, libraryReady]);
}
