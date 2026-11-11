import { registerFontFile } from '../editor/fonts';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
import type { UploadedFont } from '../editor/document/documentTypes';
import { getErrorMessage } from './errorUtils';

async function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Response(blob).arrayBuffer();
}

interface UseFontControllerParams {
  registerAvailableFont: (font: UploadedFont) => void;
  setErrorMessage: (message: string | null) => void;
}

// Choosing a font for text needs nothing here: the reducer references the family
// of any text in the document (`reconcileFontReferences`).
export function useFontController({
  registerAvailableFont,
  setErrorMessage,
}: UseFontControllerParams) {
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

  return {
    handleFontUpload,
  };
}
