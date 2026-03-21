import { useEffect, useState } from 'react';

import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';
import { loadBundledFonts } from '../editor/fonts';
import type { EditorStoreState } from '../editor/state/store';

interface UseCanvasBootstrapArgs {
  loadDocument: EditorStoreState['loadDocument'];
  registerAvailableFont: EditorStoreState['registerAvailableFont'];
  dispatch: EditorStoreState['dispatch'];
}

export function useCanvasBootstrap({
  loadDocument,
  registerAvailableFont,
  dispatch,
}: UseCanvasBootstrapArgs) {
  const [persistenceReady, setPersistenceReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void defaultCanvasPersistenceService
      .load()
      .then((persistedDocument) => {
        if (!isMounted || !persistedDocument) {
          return;
        }
        loadDocument(persistedDocument);
      })
      .finally(() => {
        if (isMounted) {
          setPersistenceReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadDocument]);

  useEffect(() => {
    let isMounted = true;

    void loadBundledFonts().then((fonts) => {
      if (!isMounted) {
        return;
      }
      for (const font of fonts) {
        registerAvailableFont(font);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [dispatch, registerAvailableFont]);

  return { persistenceReady };
}
