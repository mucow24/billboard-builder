/**
 * Downloads styles of a Google Fonts family and registers them with the
 * browser, as fonts the user has imported.
 */
import type { UploadedFont } from '../../document/documentTypes';
import { registerUploadedFontBytes } from '../browserFontLoader';
import { fetchGoogleFontFiles } from './googleFontsApi';
import { toImportedFontMetadata, type GoogleFontVariant } from './googleFontVariants';

/** How many font files are fetched at a time. */
const CONCURRENT_DOWNLOADS = 4;

export interface GoogleFontDownload {
  variant: GoogleFontVariant;
  /** The font as registered: text can be set in it. */
  font: UploadedFont;
  /** The font file, for storing. */
  bytes: ArrayBuffer;
}

export interface GoogleFontDownloadResult {
  /** The styles that are now registered, in the order they were asked for. */
  downloaded: GoogleFontDownload[];
  /** The styles whose file could not be fetched or was not a usable font. */
  failed: GoogleFontVariant[];
}

export interface GoogleFontDownloadRequest {
  apiKey: string;
  family: string;
  variants: readonly GoogleFontVariant[];
  /** Called as each style is finished with, downloaded or not. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Fetches the font file of each of `variants` and registers it. One style
 * failing does not stop the others. Rejects when the family's files cannot be
 * looked up at all, or when `signal` aborts; styles registered before that stay
 * registered.
 */
export async function downloadGoogleFontVariants({
  apiKey,
  family,
  variants,
  onProgress,
  signal,
}: GoogleFontDownloadRequest): Promise<GoogleFontDownloadResult> {
  const files = await fetchGoogleFontFiles(apiKey, family, signal);
  const results: Array<GoogleFontDownload | null> = variants.map(() => null);
  let nextIndex = 0;
  let done = 0;

  async function downloadVariant(variant: GoogleFontVariant): Promise<GoogleFontDownload> {
    const address = files.get(variant.key);
    if (!address) {
      throw new Error(`Google Fonts lists no file for ${family} ${variant.key}.`);
    }
    const response = await fetch(address, { signal });
    if (!response.ok) {
      throw new Error(`The font file could not be fetched (${response.status}).`);
    }
    const bytes = await response.arrayBuffer();
    const font = await registerUploadedFontBytes({
      ...toImportedFontMetadata(family, variant),
      kind: 'uploaded',
      bytes,
    });
    return { variant, font, bytes };
  }

  async function work(): Promise<void> {
    while (nextIndex < variants.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await downloadVariant(variants[index]);
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        console.warn(`Skipping a style of ${family} that could not be imported.`, error);
      }
      done += 1;
      onProgress?.(done, variants.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENT_DOWNLOADS, variants.length) }, () => work()),
  );
  signal?.throwIfAborted();

  return {
    downloaded: results.flatMap((result) => (result ? [result] : [])),
    failed: variants.filter((_, index) => results[index] === null),
  };
}
