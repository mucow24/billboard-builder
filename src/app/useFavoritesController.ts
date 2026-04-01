import { useEffect, useRef, useState } from 'react';

import {
  buildDefaultFavoriteName,
  instantiateFavoriteNodes,
  uniquifyFavoriteName,
} from './favoriteLibrary';
import { restoreUploadedFontsForReferences } from './uploadedFontPersistence';
import { buildFavoriteSelectionPayload, summarizeFavoriteNodes } from '../editor/document/favoriteLibrary';
import { defaultFavoriteLibraryService, type StoredFavorite } from '../editor/persistence/favoriteLibraryService';
import type { EditorStoreState } from '../editor/state/store';
import type { ProjectDocument, UploadedFont } from '../editor/document/documentTypes';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface UseFavoritesControllerParams {
  applyTransaction: EditorStoreState['applyTransaction'];
  availableFonts: UploadedFont[];
  document: ProjectDocument;
  registerAvailableFont: (font: UploadedFont) => void;
  selectedNodeIds: string[];
  setErrorMessage: (message: string | null) => void;
}

export function useFavoritesController({
  applyTransaction,
  availableFonts,
  document,
  registerAvailableFont,
  selectedNodeIds,
  setErrorMessage,
}: UseFavoritesControllerParams) {
  const [favorites, setFavorites] = useState<StoredFavorite[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const favoriteInsertCountsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    try {
      setFavorites(defaultFavoriteLibraryService.load());
    } catch (error) {
      setErrorMessage(
        `Failed to load favorites library: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    } finally {
      setFavoritesReady(true);
    }
  }, [setErrorMessage]);

  function persistFavorites(nextFavorites: StoredFavorite[]) {
    defaultFavoriteLibraryService.save(nextFavorites);
    setFavorites(nextFavorites);
  }

  function saveSelectionAsFavorite(): boolean {
    const payload = buildFavoriteSelectionPayload(document, selectedNodeIds);
    if (payload.nodes.length === 0) {
      return false;
    }

    const now = new Date().toISOString();
    const name = uniquifyFavoriteName(
      buildDefaultFavoriteName(payload.nodes),
      favorites,
    );
    const { previewColors } = summarizeFavoriteNodes(payload.nodes);
    const nextFavorite: StoredFavorite = {
      id: crypto.randomUUID(),
      name,
      color: previewColors[0] || '#334155',
      nodes: payload.nodes,
      fonts: payload.fonts,
      createdAt: now,
      updatedAt: now,
    };

    try {
      persistFavorites([...favorites, nextFavorite]);
      setErrorMessage(null);
      return true;
    } catch (error) {
      setErrorMessage(
        `Failed to save favorite: ${getErrorMessage(error, 'Unknown error.')}`,
      );
      return false;
    }
  }

  async function insertFavorite(favoriteId: string) {
    const favorite = favorites.find((entry) => entry.id === favoriteId);
    if (!favorite) {
      return;
    }

    await restoreUploadedFontsForReferences({
      references: favorite.fonts,
      availableFonts,
      registerAvailableFont,
    });

    const nextInsertCount = (favoriteInsertCountsRef.current[favoriteId] ?? 0) + 1;
    favoriteInsertCountsRef.current[favoriteId] = nextInsertCount;
    const insertedNodes = instantiateFavoriteNodes(favorite.nodes, nextInsertCount);

    applyTransaction([
      {
        family: 'document' as const,
        command: { type: 'insert_nodes' as const, nodes: insertedNodes },
      },
      ...favorite.fonts.map((font) => ({
        family: 'document' as const,
        command: { type: 'register_font' as const, font },
      })),
      {
        family: 'selection' as const,
        command: {
          type: 'select_nodes' as const,
          nodeIds: insertedNodes.map((node) => node.id),
        },
      },
    ]);
    setErrorMessage(null);
  }

  function deleteFavorite(favoriteId: string) {
    const nextFavorites = favorites.filter((favorite) => favorite.id !== favoriteId);
    if (nextFavorites.length === favorites.length) {
      return;
    }

    try {
      persistFavorites(nextFavorites);
      delete favoriteInsertCountsRef.current[favoriteId];
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        `Failed to delete favorite: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    }
  }

  function renameFavorite(favoriteId: string, name: string) {
    const nextFavorites = favorites.map((fav) =>
      fav.id === favoriteId
        ? { ...fav, name, updatedAt: new Date().toISOString() }
        : fav,
    );

    try {
      persistFavorites(nextFavorites);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        `Failed to rename favorite: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    }
  }

  function reorderFavorite(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return;
    }
    try {
      const reordered = favorites.slice();
      const [item] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, item);
      persistFavorites(reordered);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        `Failed to reorder favorites: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    }
  }

  function recolorFavorite(favoriteId: string, color: string) {
    const nextFavorites = favorites.map((fav) =>
      fav.id === favoriteId
        ? { ...fav, color, updatedAt: new Date().toISOString() }
        : fav,
    );

    try {
      persistFavorites(nextFavorites);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        `Failed to update favorite color: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    }
  }

  return {
    favorites,
    favoritesReady,
    deleteFavorite,
    insertFavorite,
    recolorFavorite,
    renameFavorite,
    reorderFavorite,
    saveSelectionAsFavorite,
  };
}
