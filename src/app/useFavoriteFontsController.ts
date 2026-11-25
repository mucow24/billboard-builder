import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { restoreUploadedFontsForReferences } from './uploadedFontPersistence';
import type { DocumentFontReference, UploadedFont } from '../editor/document/documentTypes';
import { splitFontFamilyVariant } from '../editor/fonts/fontFamilyGroups';
import { toFontReference } from '../editor/fonts/fontModel';
import {
  loadFavoriteFonts,
  saveFavoriteFonts,
  type FavoriteFont,
} from '../editor/persistence/favoriteFontsService';
import { useEditorStore } from '../editor/state/store';

/**
 * The imported font files behind the menu row called `name`: the files of the
 * font of that name, and of its weights when the row is a family ("Barlow":
 * "Barlow Light", "Barlow Black"), as the menu groups them. The available
 * fonts list a file once for each font it draws (a Bold file is also its
 * family's "<Family> Bold" entry), so every file is found by its family.
 */
export function collectImportedFontFiles(
  name: string,
  availableFonts: readonly UploadedFont[],
): DocumentFontReference[] {
  const familyKey = name.toLowerCase();
  return availableFonts
    .filter(
      (font) =>
        font.kind === 'uploaded' &&
        (font.family === name ||
          splitFontFamilyVariant(font.family).base.toLowerCase() === familyKey),
    )
    .map(toFontReference);
}

/** `favorites` with the row called `name` added, or removed if it was there. */
export function toggleFavoriteFontIn(
  favorites: readonly FavoriteFont[],
  name: string,
  files: DocumentFontReference[],
): FavoriteFont[] {
  return favorites.some((favorite) => favorite.name === name)
    ? favorites.filter((favorite) => favorite.name !== name)
    : [...favorites, { name, files }];
}

/**
 * `favorites` with the imported files now available added to each. A file
 * already recorded stays, whether or not it is available: it may not have
 * been loaded yet. Returns `favorites` itself when nothing is added.
 */
export function addImportedFontFiles(
  favorites: readonly FavoriteFont[],
  availableFonts: readonly UploadedFont[],
): readonly FavoriteFont[] {
  let changed = false;
  const next = favorites.map((favorite) => {
    const added = collectImportedFontFiles(favorite.name, availableFonts).filter(
      (file) =>
        !favorite.files.some(
          (known) => known.family === file.family && known.sourceName === file.sourceName,
        ),
    );
    if (added.length === 0) {
      return favorite;
    }
    changed = true;
    return { ...favorite, files: [...favorite.files, ...added] };
  });
  return changed ? next : favorites;
}

interface UseFavoriteFontsControllerParams {
  availableFonts: readonly UploadedFont[];
  registerAvailableFont: (font: UploadedFont) => void;
  setErrorMessage: (message: string | null) => void;
}

/**
 * The fonts starred in the font menu. They are kept in the browser, apart from
 * any canvas, by the name of their row in the menu.
 *
 * An imported font is otherwise stored only while a canvas or a favorite
 * object uses it. A starred one is stored for as long as it is starred: each
 * favorite records its imported files, which are kept in storage
 * (`useUploadedFontPersistence`) and loaded when the editor appears.
 */
export function useFavoriteFontsController({
  availableFonts,
  registerAvailableFont,
  setErrorMessage,
}: UseFavoriteFontsControllerParams) {
  const [favoriteFonts, setFavoriteFonts] = useState<readonly FavoriteFont[]>(() =>
    loadFavoriteFonts(),
  );
  // What `favoriteFonts` is about to be: several changes can come before a render.
  const latestRef = useRef(favoriteFonts);
  const saveFailedRef = useRef(false);

  /**
   * The favorites to change: the stored ones, read again, because another tab
   * of the editor may have starred fonts since this one read them, and writing
   * this tab's list back would drop those. If storing has failed, this tab's
   * list is all there is.
   */
  const readStored = useCallback(
    (): readonly FavoriteFont[] => (saveFailedRef.current ? latestRef.current : loadFavoriteFonts()),
    [],
  );

  const commit = useCallback(
    (next: readonly FavoriteFont[]) => {
      latestRef.current = next;
      setFavoriteFonts(next);
      try {
        saveFavoriteFonts(next);
        saveFailedRef.current = false;
      } catch (error) {
        saveFailedRef.current = true;
        console.warn('The favorite fonts could not be stored.', error);
        setErrorMessage('The favorite fonts could not be saved in this browser.');
      }
    },
    [setErrorMessage],
  );

  // An imported font that only a favorite refers to is not loaded with any
  // canvas: bring those back once, when the editor appears.
  useEffect(() => {
    const references = latestRef.current.flatMap((favorite) => favorite.files);
    if (references.length === 0) {
      return;
    }
    void restoreUploadedFontsForReferences({
      references,
      availableFonts: useEditorStore.getState().editor.session.availableFonts,
      registerAvailableFont,
    }).catch((error: unknown) => {
      console.warn('Imported fonts of the favorite fonts could not be restored.', error);
    });
  }, [registerAvailableFont]);

  // A weight imported after its family was starred belongs to the favorite too.
  useEffect(() => {
    const stored = readStored();
    const next = addImportedFontFiles(stored, availableFonts);
    if (next !== stored) {
      commit(next);
    }
  }, [availableFonts, commit, readStored]);

  const toggleFavoriteFont = useCallback(
    (name: string) => {
      const isFavorite = (favorites: readonly FavoriteFont[]) =>
        favorites.some((favorite) => favorite.name === name);
      const stored = readStored();
      // The star turns into the opposite of what this tab shows. If another
      // tab already made that change, the stored favorites are right as they are.
      commit(
        isFavorite(stored) === isFavorite(latestRef.current)
          ? toggleFavoriteFontIn(
              stored,
              name,
              collectImportedFontFiles(
                name,
                useEditorStore.getState().editor.session.availableFonts,
              ),
            )
          : stored,
      );
    },
    [commit, readStored],
  );

  const favoriteFontNames = useMemo(
    () => favoriteFonts.map((favorite) => favorite.name),
    [favoriteFonts],
  );
  const favoriteFontFiles = useMemo(
    () => favoriteFonts.flatMap((favorite) => favorite.files),
    [favoriteFonts],
  );

  return { favoriteFontFiles, favoriteFontNames, toggleFavoriteFont };
}
