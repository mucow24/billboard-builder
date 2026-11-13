import { useEffect, useState } from 'react';

import { loadDocumentLibrarySession } from './documentLibrarySession';
import { runEditorStartup } from './editorStartup';
import { restoreUploadedFontsForReferences } from './uploadedFontPersistence';
import type { UploadedFont } from '../editor/document/documentTypes';
import { loadBundledFonts } from '../editor/fonts';
import { defaultCanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';
import { useEditorStore } from '../editor/state/store';

export interface EditorStartupState {
  /** The saved canvas, if any, is in the editor. Until then the editor must not be shown. */
  canvasReady: boolean;
  /** Every bundled font has been registered or has failed to load. */
  fontsReady: boolean;
}

/** Runs `runEditorStartup` against the editor store once, when the app mounts. */
export function useEditorStartup(): EditorStartupState {
  const [state, setState] = useState<EditorStartupState>({
    canvasReady: false,
    fontsReady: false,
  });

  useEffect(() => {
    let cancelled = false;
    const { loadDocument, registerAvailableFont } = useEditorStore.getState();
    const registerFont = (font: UploadedFont) => {
      if (!cancelled) {
        registerAvailableFont(font);
      }
    };

    void runEditorStartup({
      loadSavedCanvas: () => defaultCanvasPersistenceService.load(),
      loadLibrarySession: (hasSavedCanvas) =>
        loadDocumentLibrarySession({
          hasWorkingCopy: hasSavedCanvas,
          isCancelled: () => cancelled,
        }),
      loadBundledFonts,
      restoreUploadedFonts: (references) =>
        restoreUploadedFontsForReferences({
          references,
          availableFonts: [],
          registerAvailableFont: registerFont,
        }),
      registerAvailableFont: registerFont,
      loadDocument,
      onCanvasReady: () => setState((current) => ({ ...current, canvasReady: true })),
      onFontsReady: () => setState((current) => ({ ...current, fontsReady: true })),
      isCancelled: () => cancelled,
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
