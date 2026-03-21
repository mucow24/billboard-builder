import { registerUploadedFontBytes } from '../editor/fonts';
import type {
  DocumentFontReference,
  UploadedFont,
} from '../editor/document/documentTypes';
import type { StoredTemplate } from '../editor/persistence/templateLibraryService';
import {
  defaultUploadedFontPersistenceService,
  toUploadedFontPersistenceKey,
} from '../editor/persistence/uploadedFontPersistenceService';

function isUploadedFontReference(
  reference: DocumentFontReference,
): reference is Extract<DocumentFontReference, { kind: 'uploaded' }> {
  return reference.kind === 'uploaded';
}

function hasAvailableUploadedFont(
  reference: Extract<DocumentFontReference, { kind: 'uploaded' }>,
  availableFonts: UploadedFont[],
): boolean {
  const referenceKey = toUploadedFontPersistenceKey(reference);
  return availableFonts.some(
    (font) => font.kind === 'uploaded' && toUploadedFontPersistenceKey(font) === referenceKey,
  );
}

function dedupeUploadedFontReferences(
  references: DocumentFontReference[],
): Array<Extract<DocumentFontReference, { kind: 'uploaded' }>> {
  const seen = new Set<string>();
  return references.filter(isUploadedFontReference).filter((reference) => {
    const key = toUploadedFontPersistenceKey(reference);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function collectRetainedUploadedFontReferences(
  documentFonts: DocumentFontReference[],
  templates: StoredTemplate[],
): DocumentFontReference[] {
  return dedupeUploadedFontReferences([
    ...documentFonts,
    ...templates.flatMap((template) => template.fonts),
  ]);
}

export async function restoreUploadedFontsForReferences({
  references,
  availableFonts,
  registerAvailableFont,
}: {
  references: DocumentFontReference[];
  availableFonts: UploadedFont[];
  registerAvailableFont: (font: UploadedFont) => void;
}): Promise<void> {
  const missingReferences = dedupeUploadedFontReferences(references).filter(
    (reference) => !hasAvailableUploadedFont(reference, availableFonts),
  );
  if (missingReferences.length === 0) {
    return;
  }

  const persistedFonts = await defaultUploadedFontPersistenceService.loadByReferences(
    missingReferences,
  );

  for (const persistedFont of persistedFonts) {
    try {
      const restoredFont = await registerUploadedFontBytes(persistedFont);
      registerAvailableFont(restoredFont);
    } catch (error) {
      console.warn('Skipping persisted uploaded font that failed to restore.', error);
    }
  }
}
