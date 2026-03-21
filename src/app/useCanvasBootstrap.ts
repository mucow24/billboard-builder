import { useEffect, useState } from 'react';

import { restoreUploadedFontsForReferences } from './uploadedFontPersistence';
import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';
import { loadBundledFonts } from '../editor/fonts';
import type { EditorStoreState } from '../editor/state/store';

interface UseCanvasBootstrapArgs {
  loadDocument: EditorStoreState['loadDocument'];
  registerAvailableFont: EditorStoreState['registerAvailableFont'];
}

export function useCanvasBootstrap({
  loadDocument,
  registerAvailableFont,
}: UseCanvasBootstrapArgs) {
  const [persistenceReady, setPersistenceReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const [persistedDocument, bundledFonts] = await Promise.all([
        defaultCanvasPersistenceService.load(),
        loadBundledFonts(),
      ]);
      if (!isMounted) {
        return;
      }

      for (const font of bundledFonts) {
        registerAvailableFont(font);
      }

      if (persistedDocument) {
        loadDocument(persistedDocument);
        await restoreUploadedFontsForReferences({
          references: persistedDocument.fonts,
          availableFonts: bundledFonts,
          registerAvailableFont,
        });
      }
    })().finally(() => {
      if (isMounted) {
        setPersistenceReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadDocument, registerAvailableFont]);

  return { persistenceReady };
}
