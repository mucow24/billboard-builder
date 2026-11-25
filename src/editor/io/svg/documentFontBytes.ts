import type {
  DocumentFontReference,
  ProjectDocument,
  TextCanvasItem,
  UploadedFont,
} from '../../document/documentTypes';
import { drawnFontOf } from '../../fonts/boldWeight';
import { EMOJI_FALLBACK_FAMILY } from '../../fonts/emojiFallback';
import { toFontReference } from '../../fonts/fontModel';
import { findFontForVariant } from '../../fonts/fontRegistry';
import { getRenderableCombinedFontStyle } from '../../fonts/fontStyles';
import type { FontBytes } from './exportToSvg';
import type { SyntheticFontStyle } from './svgExportTypes';

export interface FontByteLoaders {
  loadBundledBytes: (sourceName: string) => Promise<ArrayBuffer | null>;
  loadUploadedBytes: (ref: DocumentFontReference) => Promise<ArrayBuffer | null>;
}

/**
 * Build the `loadFontBytes` resolver for `exportToSvg`.
 *
 * `doc.fonts` decides whether a text item's family is embeddable at all: system
 * (and unknown) families have no obtainable bytes. It does not decide which file
 * to embed. A `DocumentFontReference` carries no weight or style, and a bundled
 * family is referenced by only one of its files (an uploaded family by all of
 * them), so the file is chosen at export time from `registeredFonts`: the one
 * matching the item's weight and style, or the nearest the family has (see
 * `findFontForVariant`). `registeredFonts` must be in registration order
 * (`listRegisteredFonts`) so that a family with two files for one variant exports
 * with the one the canvas renders with.
 *
 * If none of the family's files are registered in this session, the document's
 * first reference for the family is used.
 *
 * When a family lacks the requested variant, the canvas fakes it from the nearest
 * face (synthetic bold / oblique). The export outlines that nearest file, and the
 * result says what was faked (`synthetic`) so that `svgText` fakes it too.
 *
 * Byte-load failures degrade to `bytes: null` (→ block+warn), never throw.
 */
export function createDocumentFontLoader(
  doc: Pick<ProjectDocument, 'fonts'>,
  registeredFonts: readonly UploadedFont[],
  loaders: FontByteLoaders,
) {
  return async (item: TextCanvasItem): Promise<FontBytes> => {
    const ref = doc.fonts.find((font) => font.family === item.fontFamily);
    if (!ref || ref.kind === 'system') {
      return { kind: 'system', bytes: null };
    }

    // Bold text is drawn in a heavier weight of its typeface where there is one,
    // and that weight's file is the one to outline.
    const drawn = drawnFontOf(item, registeredFonts);
    const registeredFont = findFontForVariant(
      registeredFonts,
      drawn.fontFamily,
      drawn.fontWeight === 'bold' ? '700' : '400',
      drawn.fontStyle,
    );
    const source = registeredFont ? toFontReference(registeredFont) : ref;
    const synthetic = registeredFont ? syntheticStyle(drawn, registeredFont) : undefined;
    try {
      const bytes =
        source.kind === 'bundled'
          ? await loaders.loadBundledBytes(source.sourceName)
          : await loaders.loadUploadedBytes(source);
      return { kind: source.kind, bytes, ...(synthetic ? { synthetic } : {}) };
    } catch {
      return { kind: source.kind, bytes: null };
    }
  };
}

/**
 * Build the `loadFallbackFontBytes` resolver for `exportToSvg`: the bytes of the
 * emoji fallback file (see `fonts/emojiFallback`) that the canvas draws `item`'s
 * missing characters with, chosen from `registeredFonts` as for any family (see
 * `createDocumentFontLoader`), and what the browser fakes when it draws them.
 *
 * Nothing when no file of the fallback is registered: the canvas then draws
 * those characters from a system font, which cannot be exported.
 */
export function createFallbackFontLoader(registeredFonts: readonly UploadedFont[], loaders: FontByteLoaders) {
  return async (item: TextCanvasItem): Promise<FontBytes> => {
    // The fallback is asked for in the weight the text's own family is: regular
    // where a heavier weight of the typeface draws the text's bold.
    const drawn = drawnFontOf(item, registeredFonts);
    const font = findFontForVariant(
      registeredFonts,
      EMOJI_FALLBACK_FAMILY,
      drawn.fontWeight === 'bold' ? '700' : '400',
      drawn.fontStyle,
    );
    if (!font) {
      return { kind: 'system', bytes: null };
    }
    const synthetic = syntheticStyle(drawn, font);
    try {
      const bytes =
        font.kind === 'bundled'
          ? await loaders.loadBundledBytes(font.sourceName)
          : await loaders.loadUploadedBytes(toFontReference(font));
      return { kind: font.kind, bytes, ...(synthetic ? { synthetic } : {}) };
    } catch {
      return { kind: font.kind, bytes: null };
    }
  };
}

/**
 * What the browser fakes when it draws `item` with `font`, the file resolved for
 * it: whatever the canvas asks the browser for that the file is not registered
 * as. For bold that is what the browser may fake, told without reading the file
 * or drawing anything: Chromium leaves the bold of a file that is itself heavy
 * unfaked, and `syntheticBoldFor` settles that when the text is laid out.
 */
export function syntheticStyle(item: TextCanvasItem, font: UploadedFont): SyntheticFontStyle | undefined {
  const drawn = getRenderableCombinedFontStyle(item);
  const bold = drawn.includes('bold') && font.weight !== '700';
  const italic = drawn.includes('italic') && font.style !== 'italic';
  return bold || italic ? { bold, italic } : undefined;
}
