import { describe, expect, it } from 'vitest';

import { familySupportsStyle, familySupportsVariant, familySupportsWeight, findMissingFonts } from './fontRegistry';

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
