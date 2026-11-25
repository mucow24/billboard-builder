import { describe, expect, it } from 'vitest';

import type { GoogleFontFamily } from './googleFontsApi';
import { searchGoogleFonts } from './googleFontSearch';

// In catalog order: most used first.
const CATALOG: GoogleFontFamily[] = [
  'Open Sans',
  'Roboto',
  'Playfair Display',
  'Display Playground',
  'Play',
  'Roboto Slab',
  'Cosplay Sans',
  'Noto Sans Display',
].map((family) => ({ family, category: 'sans-serif', variants: [] }));

function search(query: string, limit = 10) {
  return searchGoogleFonts(CATALOG, query, limit).map((family) => family.family);
}

describe('searchGoogleFonts', () => {
  it('finds nothing for an empty query', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  it('puts the family of exactly that name first, then names that start with it, most used first', () => {
    expect(search('play')).toEqual([
      'Play',
      'Playfair Display',
      'Display Playground',
      'Cosplay Sans',
      'Noto Sans Display',
    ]);
  });

  it('ranks a word that starts with the query above a name that only contains it', () => {
    expect(search('disp')).toEqual(['Display Playground', 'Playfair Display', 'Noto Sans Display']);
  });

  it('ignores case and surplus spaces', () => {
    expect(search('  ROBOTO   sl ')).toEqual(['Roboto Slab']);
  });

  it('does not need the spaces of a name', () => {
    expect(search('opensans')).toEqual(['Open Sans']);
    expect(search('robotos')).toEqual(['Roboto Slab']);
  });

  it('returns no more than the limit', () => {
    expect(search('o', 2)).toEqual(['Open Sans', 'Roboto']);
  });
});
