import { useEffect, useMemo, useRef } from 'react';

import type { DocumentFontReference } from '../editor/document/documentTypes';
import type { GoogleFontDownloadRequest } from '../editor/fonts/googleFonts/googleFontImport';
import {
  getGoogleFontsApiKey,
  loadGoogleFontCatalog,
} from '../editor/fonts/googleFonts/googleFontsApi';
import { planMissingGoogleFontImports } from '../editor/fonts/googleFonts/missingGoogleFonts';

interface UseMissingGoogleFontsArgs {
  /** The font-list entries the document references and the session does not have. */
  missingFontFamilies: string[];
  documentFonts: DocumentFontReference[];
  /** Downloads, registers and stores styles of a Google Fonts family. */
  importGoogleFont: (request: GoogleFontDownloadRequest) => Promise<unknown>;
}

/**
 * Gets the fonts a document is missing from Google Fonts, where they are
 * Google fonts: a canvas opened on another computer, or whose stored fonts are
 * gone, is drawn in its own fonts again without anyone importing them by hand.
 * A font that arrives is no longer missing; one that is not on Google Fonts
 * stays listed as missing.
 *
 * Nothing is asked of Google while no font is missing, or in a build without a
 * key for the Google Fonts API. Each missing font is looked up once; one whose
 * lookup failed (no network) is looked up again the next time the missing fonts
 * are worked out, such as when the document is opened again.
 */
export function useMissingGoogleFonts({
  missingFontFamilies,
  documentFonts,
  importGoogleFont,
}: UseMissingGoogleFontsArgs) {
  const apiKey = useMemo(() => getGoogleFontsApiKey(), []);
  const lookedUpRef = useRef(new Set<string>());
  // Read when a lookup runs: neither is a reason to start one.
  const latestRef = useRef({ documentFonts, importGoogleFont });
  useEffect(() => {
    latestRef.current = { documentFonts, importGoogleFont };
  });

  useEffect(() => {
    if (!apiKey) {
      return;
    }
    const lookedUp = lookedUpRef.current;
    const entries = missingFontFamilies.filter((family) => !lookedUp.has(family));
    if (entries.length === 0) {
      return;
    }
    for (const entry of entries) {
      lookedUp.add(entry);
    }
    const lookUpAgain = (failed: readonly string[]) => {
      for (const entry of failed) {
        lookedUp.delete(entry);
      }
    };

    // The references of the canvas these entries are missing from: another
    // canvas may be open by the time the catalog is in.
    const references = latestRef.current.documentFonts;

    void (async () => {
      let imports;
      try {
        imports = planMissingGoogleFontImports(
          await loadGoogleFontCatalog(apiKey),
          entries,
          references,
        );
      } catch (error) {
        console.warn('Missing fonts could not be looked up on Google Fonts.', error);
        lookUpAgain(entries);
        return;
      }
      await Promise.all(
        imports.map(async ({ family, variants, entries: supplied }) => {
          try {
            await latestRef.current.importGoogleFont({ apiKey, family, variants });
          } catch (error) {
            console.warn(`The missing font ${family} could not be fetched from Google Fonts.`, error);
            lookUpAgain(supplied);
          }
        }),
      );
    })();
  }, [apiKey, missingFontFamilies]);
}
