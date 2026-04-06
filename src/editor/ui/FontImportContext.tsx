import { createContext, useContext, type ReactNode } from 'react';

const FontImportContext = createContext<(() => void) | null>(null);

export function useFontImport() {
  return useContext(FontImportContext);
}

interface FontImportProviderProps {
  children: ReactNode;
  onImportFont: () => void;
}

export function FontImportProvider({ children, onImportFont }: FontImportProviderProps) {
  return (
    <FontImportContext.Provider value={onImportFont}>
      {children}
    </FontImportContext.Provider>
  );
}
