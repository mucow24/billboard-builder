import { registerFontFile } from '../editor/fonts';
import {
  downloadGoogleFontVariants,
  type GoogleFontDownloadRequest,
} from '../editor/fonts/googleFonts/googleFontImport';
import { describeGoogleFontVariant } from '../editor/fonts/googleFonts/googleFontVariants';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
import type { UploadedFont } from '../editor/document/documentTypes';
import { getErrorMessage } from './errorUtils';

/** What became of a request to import styles of a Google Fonts family. */
export interface GoogleFontImportOutcome {
  /** How many styles are now in the font list. */
  added: number;
  /** The names of the styles that could not be imported ("Light Italic"). */
  failed: string[];
}

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

  /**
   * Imports styles of a Google Fonts family: each is downloaded, added to the
   * font list and stored like a font file the user picked. Rejects when the
   * family cannot be looked up or the request is aborted; styles that failed
   * on their own are named in the outcome.
   */
  async function handleGoogleFontImport(
    request: GoogleFontDownloadRequest,
  ): Promise<GoogleFontImportOutcome> {
    const { downloaded, failed } = await downloadGoogleFontVariants(request);
    let persistError: unknown = null;
    for (const { font, bytes } of downloaded) {
      registerAvailableFont(font);
      try {
        await defaultUploadedFontPersistenceService.save(font, bytes);
      } catch (error) {
        persistError = error;
      }
    }
    if (persistError) {
      setErrorMessage(
        `Imported fonts are ready for this session, but failed to persist: ${getErrorMessage(persistError, 'Unknown error.')}`,
      );
    } else if (downloaded.length > 0) {
      setErrorMessage(null);
    }
    return { added: downloaded.length, failed: failed.map(describeGoogleFontVariant) };
  }

  return {
    handleFontUpload,
    handleGoogleFontImport,
  };
}
