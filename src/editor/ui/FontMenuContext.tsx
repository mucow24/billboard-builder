/* eslint-disable react-refresh/only-export-components -- hook + provider are co-located by design */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** What the font menu shows besides the list of fonts it is given. */
export interface FontMenuData {
  /** The fonts the text of the canvas is set in, for the "In this canvas" section. */
  canvasFamilies: readonly string[];
  /** The names of the menu rows marked as favorites. */
  favoriteNames: readonly string[];
  /** Marks the row called `name` as a favorite, or unmarks it. */
  toggleFavorite: (name: string) => void;
}

const FontMenuContext = createContext<FontMenuData | null>(null);

/** Null outside the editor: the menu is then the plain list of fonts, without stars. */
export function useFontMenuData() {
  return useContext(FontMenuContext);
}

interface FontMenuProviderProps extends FontMenuData {
  children: ReactNode;
}

export function FontMenuProvider({
  canvasFamilies,
  children,
  favoriteNames,
  toggleFavorite,
}: FontMenuProviderProps) {
  const data = useMemo(
    () => ({ canvasFamilies, favoriteNames, toggleFavorite }),
    [canvasFamilies, favoriteNames, toggleFavorite],
  );
  return <FontMenuContext.Provider value={data}>{children}</FontMenuContext.Provider>;
}
