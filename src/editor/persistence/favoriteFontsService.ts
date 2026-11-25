import { z } from 'zod';

import type { DocumentFontReference } from '../document/documentTypes';

export const FAVORITE_FONTS_STORAGE_KEY = 'billboard-builder:favorite-fonts:v1';

/**
 * A row of the font menu marked as a favorite: a font, or a family with all of
 * its weights.
 */
export interface FavoriteFont {
  /** The row's name in the menu: "Barlow", "Cal Sans". */
  name: string;
  /**
   * The imported font files behind the row when it was marked. They are kept
   * in storage for as long as the favorite is, like the files a canvas uses.
   * Empty for system and bundled fonts, which are always there.
   */
  files: DocumentFontReference[];
}

const favoriteFontsSchema = z.object({
  version: z.literal(1),
  fonts: z.array(
    z.object({
      name: z.string().min(1),
      files: z.array(
        z.object({
          family: z.string(),
          sourceName: z.string(),
          kind: z.enum(['system', 'bundled', 'uploaded']),
        }),
      ),
    }),
  ),
});

/** The stored favorite fonts. Storage that cannot be read counts as none, and is cleared. */
export function loadFavoriteFonts(): FavoriteFont[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_FONTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return favoriteFontsSchema.parse(JSON.parse(raw)).fonts;
  } catch {
    try {
      window.localStorage.removeItem(FAVORITE_FONTS_STORAGE_KEY);
    } catch {
      // No storage at all: there is nothing to clear.
    }
    return [];
  }
}

export function saveFavoriteFonts(fonts: readonly FavoriteFont[]): void {
  window.localStorage.setItem(
    FAVORITE_FONTS_STORAGE_KEY,
    JSON.stringify({ version: 1, fonts }),
  );
}
