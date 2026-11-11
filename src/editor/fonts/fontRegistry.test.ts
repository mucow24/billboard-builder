import { describe, expect, it } from 'vitest';

import type { UploadedFont } from '../document/documentTypes';
import {
  familySupportsStyle,
  familySupportsVariant,
  familySupportsWeight,
  findFontForVariant,
  findMissingFonts,
} from './fontRegistry';

function font(
  sourceName: string,
  weight: UploadedFont['weight'],
  style: UploadedFont['style'],
  overrides: Partial<UploadedFont> = {},
): UploadedFont {
  return { family: 'Poster Sans', sourceName, weight, style, kind: 'bundled', ...overrides };
}

const regular = font('PosterSans-Regular.ttf', '400', 'normal');
const bold = font('PosterSans-Bold.ttf', '700', 'normal');
const italic = font('PosterSans-Italic.ttf', '400', 'italic');
const boldItalic = font('PosterSans-BoldItalic.ttf', '700', 'italic');

describe('findFontForVariant', () => {
  it('picks the file whose weight and style match, whatever order the files registered in', () => {
    // The regular file is rarely the first of its family to register.
    const fonts = [bold, boldItalic, italic, regular];

    expect(findFontForVariant(fonts, 'Poster Sans', '400', 'normal')).toBe(regular);
    expect(findFontForVariant(fonts, 'Poster Sans', '700', 'normal')).toBe(bold);
    expect(findFontForVariant(fonts, 'Poster Sans', '400', 'italic')).toBe(italic);
    expect(findFontForVariant(fonts, 'Poster Sans', '700', 'italic')).toBe(boldItalic);
  });

  it('falls back from bold italic to italic, then bold, then regular', () => {
    expect(findFontForVariant([regular, bold, italic], 'Poster Sans', '700', 'italic')).toBe(italic);
    expect(findFontForVariant([regular, bold], 'Poster Sans', '700', 'italic')).toBe(bold);
    expect(findFontForVariant([regular], 'Poster Sans', '700', 'italic')).toBe(regular);
  });

  it('falls back from a missing bold or italic file to the regular one', () => {
    expect(findFontForVariant([italic, regular], 'Poster Sans', '700', 'normal')).toBe(regular);
    expect(findFontForVariant([bold, regular], 'Poster Sans', '400', 'italic')).toBe(regular);
  });

  it('keeps the requested style ahead of the requested weight, as CSS font matching does', () => {
    // Italic wanted, no regular-weight italic: the bold italic beats the upright regular.
    expect(findFontForVariant([regular, boldItalic], 'Poster Sans', '400', 'italic')).toBe(boldItalic);
    // Upright bold wanted, no upright bold: the upright regular beats the bold italic.
    expect(findFontForVariant([boldItalic, regular], 'Poster Sans', '700', 'normal')).toBe(regular);
  });

  it('uses whatever the family has when nothing shares the requested weight or style', () => {
    // A bold-only family (e.g. Super16Bit) still renders regular-weight text.
    expect(findFontForVariant([bold, boldItalic], 'Poster Sans', '400', 'normal')).toBe(bold);
    expect(findFontForVariant([boldItalic], 'Poster Sans', '400', 'normal')).toBe(boldItalic);
  });

  it('prefers the file registered last when several share a weight and style', () => {
    // Like Futura, which ships "Futura Book.otf" and "Futura Regular.ttf" as one variant.
    const book = font('Poster Book.otf', '400', 'normal');
    const reupload = font('PosterSans-Regular.ttf', '400', 'normal', { kind: 'uploaded' });

    expect(findFontForVariant([regular, book, bold], 'Poster Sans', '400', 'normal')).toBe(book);
    expect(findFontForVariant([book, regular, bold], 'Poster Sans', '400', 'normal')).toBe(regular);
    expect(findFontForVariant([regular, book, reupload], 'Poster Sans', '400', 'normal')).toBe(reupload);
  });

  it('ignores other families and reports an unregistered family as missing', () => {
    const other = font('SessionSans-Bold.ttf', '700', 'normal', { family: 'Session Sans' });

    expect(findFontForVariant([other, regular], 'Poster Sans', '700', 'normal')).toBe(regular);
    expect(findFontForVariant([other], 'Poster Sans', '400', 'normal')).toBeUndefined();
    expect(findFontForVariant([], 'Poster Sans', '400', 'normal')).toBeUndefined();
  });
});

describe('font registry', () => {
  const availableFonts = [
    {
      family: 'Poster Sans',
      sourceName: 'PosterSans-Regular.ttf',
      weight: '400' as const,
      style: 'normal' as const,
      kind: 'bundled' as const,
    },
    {
      family: 'Poster Sans',
      sourceName: 'PosterSans-BoldItalic.ttf',
      weight: '700' as const,
      style: 'italic' as const,
      kind: 'bundled' as const,
    },
    {
      family: 'Session Sans',
      sourceName: 'SessionSans-Italic.ttf',
      weight: '400' as const,
      style: 'italic' as const,
      kind: 'uploaded' as const,
    },
  ];

  it('detects supported weights, styles, and variants', () => {
    expect(familySupportsWeight(availableFonts, 'Poster Sans', '400')).toBe(true);
    expect(familySupportsStyle(availableFonts, 'Session Sans', 'italic')).toBe(true);
    expect(familySupportsVariant(availableFonts, 'Poster Sans', '700', 'italic')).toBe(true);
    expect(familySupportsVariant(availableFonts, 'Poster Sans', '700', 'normal')).toBe(false);
  });

  it('finds missing non-system fonts by family and provenance', () => {
    expect(
      findMissingFonts(
        [
          { family: 'Arial', sourceName: 'Arial', kind: 'system' },
          { family: 'Poster Sans', sourceName: 'PosterSans-Regular.ttf', kind: 'bundled' },
          { family: 'Session Sans', sourceName: 'SessionSans.ttf', kind: 'uploaded' },
          { family: 'Ghost Font', sourceName: 'GhostFont.ttf', kind: 'uploaded' },
          { family: 'Ghost Font', sourceName: 'GhostFont.ttf', kind: 'uploaded' },
          { family: 'Missing Bundle', sourceName: 'MissingBundle.ttf', kind: 'bundled' },
        ],
        availableFonts,
      )
    ).toEqual(['Ghost Font', 'Missing Bundle']);
  });
});
