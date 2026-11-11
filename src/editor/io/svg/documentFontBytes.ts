import type {
  DocumentFontReference,
  ProjectDocument,
  TextCanvasItem,
  UploadedFont,
} from '../../document/documentTypes';
import { toFontReference } from '../../fonts/fontModel';
import { findFontForVariant } from '../../fonts/fontRegistry';
import type { FontBytes } from './exportToSvg';

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
 * Limitation: when a family lacks the requested variant, the canvas fakes it from
 * the nearest face (synthetic bold / oblique). The export outlines that nearest
 * file as it is, so such text exports lighter or more upright than it looks on
 * screen. The inspector only offers Bold and Italic where the family has the
 * file, so this mostly arises when the font is changed while a toggle is on.
 *
 * Byte-load failures degrade to `bytes: null` (→ block+warn), never throw.
 */
export function createDocumentFontLoader(
  doc: ProjectDocument,
  registeredFonts: readonly UploadedFont[],
  loaders: FontByteLoaders,
) {
  return async (item: TextCanvasItem): Promise<FontBytes> => {
    const ref = doc.fonts.find((font) => font.family === item.fontFamily);
    if (!ref || ref.kind === 'system') {
      return { kind: 'system', bytes: null };
    }

    const registeredFont = findFontForVariant(
      registeredFonts,
      item.fontFamily,
      item.fontWeight === 'bold' ? '700' : '400',
      item.fontStyle,
    );
    const source = registeredFont ? toFontReference(registeredFont) : ref;
    try {
      const bytes =
        source.kind === 'bundled'
          ? await loaders.loadBundledBytes(source.sourceName)
          : await loaders.loadUploadedBytes(source);
      return { kind: source.kind, bytes };
    } catch {
      return { kind: source.kind, bytes: null };
    }
  };
}
