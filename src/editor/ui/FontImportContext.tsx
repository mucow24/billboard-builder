/* eslint-disable react-refresh/only-export-components -- hook + provider are co-located by design */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** The ways to add a font, as the font menu offers them. */
export interface FontImportActions {
  /** Opens the file chooser for a font file. */
  importFromFile: () => void;
  /** Opens the Google Fonts dialog. Null when this build cannot reach Google Fonts. */
  importFromGoogle: (() => void) | null;
}

const FontImportContext = createContext<FontImportActions | null>(null);

export function useFontImport() {
  return useContext(FontImportContext);
}

interface FontImportProviderProps extends FontImportActions {
  children: ReactNode;
}

export function FontImportProvider({
  children,
  importFromFile,
  importFromGoogle,
}: FontImportProviderProps) {
  const actions = useMemo(
    () => ({ importFromFile, importFromGoogle }),
    [importFromFile, importFromGoogle],
  );
  return <FontImportContext.Provider value={actions}>{children}</FontImportContext.Provider>;
}
