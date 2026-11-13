import { createDefaultProjectDocument } from './documentDefaults';
import type { ProjectDocument } from './documentTypes';

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => valuesEqual(value, b[index]))
    );
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  // A key holding `undefined` counts as absent, as it is in a saved file.
  const keysA = Object.keys(recordA).filter((key) => recordA[key] !== undefined);
  const keysB = Object.keys(recordB).filter((key) => recordB[key] !== undefined);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) => valuesEqual(recordA[key], recordB[key]))
  );
}

/**
 * Whether two documents hold the same canvas: size, background, items and
 * fonts. The name is left out: renaming a document is not a change to it.
 */
export function documentContentsEqual(a: ProjectDocument, b: ProjectDocument): boolean {
  return (
    a === b ||
    (valuesEqual(a.canvas, b.canvas) &&
      a.background === b.background &&
      valuesEqual(a.nodes, b.nodes) &&
      valuesEqual(a.fonts, b.fonts))
  );
}

/**
 * Whether `document` holds anything its saved version does not. A document
 * that was never saved (`savedDocument` null) has unsaved changes as soon as it
 * is no longer a blank canvas.
 */
export function hasUnsavedChanges(
  document: ProjectDocument,
  savedDocument: ProjectDocument | null,
): boolean {
  return !documentContentsEqual(document, savedDocument ?? createDefaultProjectDocument());
}
