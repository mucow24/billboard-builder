import { describe, expect, it } from 'vitest';

import type { DocumentFontReference } from '../../document/documentTypes';
import type { GoogleFontFamily } from './googleFontsApi';
import { parseGoogleFontVariant } from './googleFontVariants';
import { planMissingGoogleFontImports } from './missingGoogleFonts';

function family(name: string, ...keys: string[]): GoogleFontFamily {
  return {
    family: name,
    category: 'sans-serif',
    variants: keys.flatMap((key) => parseGoogleFontVariant(key) ?? []),
  };
}

function uploaded(entry: string, sourceName: string): DocumentFontReference {
  return { family: entry, sourceName, kind: 'uploaded' };
}

const CATALOG = [
  family('Roboto', '300', '300italic', 'regular', 'italic', '700', '700italic', '900'),
  family('Roboto Condensed', '300', 'regular', '700'),
  family('Lobster', 'regular'),
];

function plan(missing: string[], references: DocumentFontReference[] = []) {
  return planMissingGoogleFontImports(CATALOG, missing, references).map((planned) => ({
    family: planned.family,
    variants: planned.variants.map((variant) => variant.key),
    entries: planned.entries,
  }));
}

describe('planMissingGoogleFontImports', () => {
  it('gets the regular and bold styles, with their italics, for a family by its own name', () => {
    expect(plan(['Roboto'])).toEqual([
      { family: 'Roboto', variants: ['regular', 'italic', '700', '700italic'], entries: ['Roboto'] },
    ]);
  });

  it('gets the weight an entry is named after, with its italic', () => {
    expect(plan(['Roboto Light'])).toEqual([
      { family: 'Roboto', variants: ['300', '300italic'], entries: ['Roboto Light'] },
    ]);
    expect(plan(['Roboto Bold'])).toEqual([
      { family: 'Roboto', variants: ['700', '700italic'], entries: ['Roboto Bold'] },
    ]);
  });

  it('downloads a family once for all of its missing entries', () => {
    expect(plan(['Roboto Black', 'Roboto', 'Roboto Bold', 'Lobster'])).toEqual([
      {
        family: 'Roboto',
        variants: ['regular', 'italic', '700', '700italic', '900'],
        entries: ['Roboto Black', 'Roboto', 'Roboto Bold'],
      },
      { family: 'Lobster', variants: ['regular'], entries: ['Lobster'] },
    ]);
  });

  it('takes an entry for a weight of the longest family it could belong to', () => {
    expect(plan(['Roboto Condensed Light', 'Roboto Condensed'])).toEqual([
      {
        family: 'Roboto Condensed',
        variants: ['300', 'regular', '700'],
        entries: ['Roboto Condensed Light', 'Roboto Condensed'],
      },
    ]);
  });

  it('leaves out what is not a Google font, or not a style its family has', () => {
    expect(plan(['Ghost Font', 'Roboto Medium', 'Robot', 'roboto', 'Lobster Bold'])).toEqual([]);
  });

  it('gets only the files the document references where it names them as an import does', () => {
    expect(
      plan(
        ['Roboto', 'Roboto Light'],
        [
          uploaded('Roboto', 'Roboto-Regular.ttf'),
          uploaded('Roboto', 'Roboto-Bold.ttf'),
          uploaded('Roboto Light', 'Roboto-Light.ttf'),
          // Another entry's file says nothing about this one's.
          uploaded('Roboto Black', 'Roboto-Italic.ttf'),
        ],
      ),
    ).toEqual([
      { family: 'Roboto', variants: ['300', 'regular', '700'], entries: ['Roboto', 'Roboto Light'] },
    ]);
  });

  it('gets every style of an entry whose files the document names differently', () => {
    expect(plan(['Lobster'], [{ family: 'Lobster', sourceName: 'Lobster.otf', kind: 'bundled' }])).toEqual([
      { family: 'Lobster', variants: ['regular'], entries: ['Lobster'] },
    ]);
    expect(plan(['Roboto Light'], [uploaded('Roboto Light', 'roboto_light.woff2')])).toEqual([
      { family: 'Roboto', variants: ['300', '300italic'], entries: ['Roboto Light'] },
    ]);
  });
});
