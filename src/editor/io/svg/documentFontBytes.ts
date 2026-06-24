import type {
  DocumentFontReference,
  ProjectDocument,
  TextCanvasItem,
} from '../../document/documentTypes';
import type { FontBytes } from './exportToSvg';

export interface FontByteLoaders {
  loadBundledBytes: (sourceName: string) => Promise<ArrayBuffer | null>;
  loadUploadedBytes: (ref: DocumentFontReference) => Promise<ArrayBuffer | null>;
}

/**
 * Build the `loadFontBytes` resolver for `exportToSvg` from the document's font
 * references. A text item's family is matched against `doc.fonts` to get its kind
 * and source file; system (and unknown) families have no embeddable bytes.
 *
 * v1 limitation: `DocumentFontReference` carries no weight/style, so a family is
 * matched by name only — a bold variant may resolve to the family's regular file.
 * Byte-load failures degrade to `bytes: null` (→ block+warn), never throw.
 */
export function createDocumentFontLoader(doc: ProjectDocument, loaders: FontByteLoaders) {
  return async (item: TextCanvasItem): Promise<FontBytes> => {
    const ref = doc.fonts.find((font) => font.family === item.fontFamily);
    if (!ref || ref.kind === 'system') {
      return { kind: 'system', bytes: null };
    }
    try {
      const bytes =
        ref.kind === 'bundled'
          ? await loaders.loadBundledBytes(ref.sourceName)
          : await loaders.loadUploadedBytes(ref);
      return { kind: ref.kind, bytes };
    } catch {
      return { kind: ref.kind, bytes: null };
    }
  };
}
