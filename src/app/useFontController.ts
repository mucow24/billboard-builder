import { registerFontFile, toFontReference } from '../editor/fonts';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
import type { CanvasItem, DocumentFontReference, UploadedFont } from '../editor/document/documentTypes';
import { getErrorMessage } from './errorUtils';

async function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Response(blob).arrayBuffer();
}

interface UseFontControllerParams {
  availableFonts: UploadedFont[];
  dispatch: (action: { type: 'register_font'; font: DocumentFontReference }) => void;
  registerAvailableFont: (font: UploadedFont) => void;
  setErrorMessage: (message: string | null) => void;
  updateSelectedItem: (changes: Partial<CanvasItem>) => void;
  updateSelectedItems: (changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>) => void;
}

export function useFontController({
  availableFonts,
  dispatch,
  registerAvailableFont,
  setErrorMessage,
  updateSelectedItem,
  updateSelectedItems,
}: UseFontControllerParams) {
  function registerDocumentFontForFamily(fontFamily: string | undefined) {
    if (typeof fontFamily !== 'string') {
      return;
    }

    const matchingFont = availableFonts.find((font) => font.family === fontFamily);
    if (!matchingFont) {
      return;
    }

    dispatch({
      type: 'register_font',
      font: toFontReference(matchingFont),
    });
  }

  async function handleFontUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    try {
      const uploadedFont = await registerFontFile(file);
      registerAvailableFont(uploadedFont);
      try {
        await defaultUploadedFontPersistenceService.save(
          uploadedFont,
          await readBlobArrayBuffer(file),
        );
      } catch (error) {
        setErrorMessage(
          `Uploaded font is ready for this session, but failed to persist it: ${getErrorMessage(error, 'Unknown error.')}`,
        );
        return;
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Failed to register font: ${getErrorMessage(error, 'Unknown error.')}`);
    }
  }

  function handleSelectedItemUpdate(changes: Partial<CanvasItem>) {
    updateSelectedItem(changes);
    registerDocumentFontForFamily('fontFamily' in changes ? changes.fontFamily : undefined);
  }

  function handleSelectedItemsUpdate(
    changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>,
  ) {
    const fontFamilies = new Set(
      changesById.flatMap(({ changes }) =>
        'fontFamily' in changes && typeof changes.fontFamily === 'string'
          ? [changes.fontFamily]
          : [],
      ),
    );

    updateSelectedItems(changesById);

    for (const fontFamily of fontFamilies) {
      registerDocumentFontForFamily(fontFamily);
    }
  }

  return {
    handleFontUpload,
    handleSelectedItemUpdate,
    handleSelectedItemsUpdate,
  };
}
