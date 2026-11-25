/**
 * Which Google Fonts files would supply the fonts a document is missing.
 *
 * A document references fonts by their font-list entry ("Roboto", "Roboto
 * Light", "Roboto Bold"), so an entry is traced back to the Google family and
 * the styles that are registered under it on import (`toImportedFontMetadata`,
 * `fontEntriesForFile`). Only an entry named exactly as an import would name it
 * is matched: under any other name the text would not be drawn in it anyway.
 *
 * Pure: no DOM, so it is testable on its own.
 */
import type { DocumentFontReference } from '../../document/documentTypes';
import { fontEntriesForFile } from '../fontModel';
import type { GoogleFontFamily } from './googleFontsApi';
import {
  sortGoogleFontVariants,
  toImportedFontMetadata,
  type GoogleFontVariant,
} from './googleFontVariants';

export interface MissingGoogleFontImport {
  /** The Google Fonts family. */
  family: string;
  /** The styles of it to download, lightest first. */
  variants: GoogleFontVariant[];
  /** The missing font-list entries those styles supply. */
  entries: string[];
}

/** The styles of `family` that are registered under the entry `entryName`. */
function variantsOfEntry(family: GoogleFontFamily, entryName: string): GoogleFontVariant[] {
  if (entryName !== family.family && !entryName.startsWith(`${family.family} `)) {
    return [];
  }
  return family.variants.filter((variant) =>
    fontEntriesForFile(toImportedFontMetadata(family.family, variant)).some(
      (entry) => entry.family === entryName,
    ),
  );
}

/**
 * The downloads that supply `missingEntries`, one per Google family; an entry
 * that is no Google font is in none of them.
 *
 * Of an entry's styles, only the files the document references are downloaded
 * where it names them as an import does ("Roboto-LightItalic.ttf"): the
 * document then ends up with the fonts it was saved with, and is not changed
 * by getting them back. A document that names other files (the font came from
 * a file, or was bundled once) gets every style of the entry.
 */
export function planMissingGoogleFontImports(
  catalog: readonly GoogleFontFamily[],
  missingEntries: readonly string[],
  references: readonly DocumentFontReference[],
): MissingGoogleFontImport[] {
  const imports = new Map<string, MissingGoogleFontImport>();

  for (const entryName of new Set(missingEntries)) {
    // "Roboto Condensed Light" is a weight of Roboto Condensed, not of Roboto.
    let match: { family: GoogleFontFamily; variants: GoogleFontVariant[] } | null = null;
    for (const family of catalog) {
      const variants = variantsOfEntry(family, entryName);
      if (variants.length > 0 && (!match || family.family.length > match.family.family.length)) {
        match = { family, variants };
      }
    }
    if (!match) {
      continue;
    }

    const { family } = match.family;
    const referencedFiles = new Set(
      references
        .filter((reference) => reference.family === entryName)
        .map((reference) => reference.sourceName),
    );
    const referenced = match.variants.filter((variant) =>
      referencedFiles.has(toImportedFontMetadata(family, variant).sourceName),
    );
    const wanted = referenced.length > 0 ? referenced : match.variants;

    const planned = imports.get(family) ?? { family, variants: [], entries: [] };
    planned.entries.push(entryName);
    for (const variant of wanted) {
      if (!planned.variants.some((existing) => existing.key === variant.key)) {
        planned.variants.push(variant);
      }
    }
    imports.set(family, planned);
  }

  return [...imports.values()].map((planned) => ({
    ...planned,
    variants: sortGoogleFontVariants(planned.variants),
  }));
}
