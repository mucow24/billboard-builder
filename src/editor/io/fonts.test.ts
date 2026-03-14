import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fontFamilyFromSourceName,
  loadBundledFonts,
  loadFontEntries,
} from './fonts';

class MockFontFace {
  family: string;
  source: string | ArrayBuffer;

  constructor(family: string, source: string | ArrayBuffer) {
    this.family = family;
    this.source = source;
  }

  async load() {
    if (this.family.includes('Broken')) {
      throw new Error('Failed to load font');
    }
    return this;
  }
}

describe('font helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('FontFace', MockFontFace);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        add: vi.fn(),
      },
    });
  });

  it('derives a readable font family from a source file name', () => {
    expect(fontFamilyFromSourceName('Acme-Sans_Bold.otf')).toBe('Acme Sans Bold');
  });

  it('loads bundled startup fonts from src/assets/fonts', async () => {
    const fonts = await loadBundledFonts();

    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: 'Arizonia Regular',
          sourceName: 'Arizonia-Regular.ttf',
        }),
      ])
    );
  });

  it('keeps loading valid bundled fonts when one source fails', async () => {
    const fonts = await loadFontEntries([
      ['src/assets/fonts/Good-One.ttf', '/fonts/good-one.ttf'],
      ['src/assets/fonts/Broken-One.ttf', '/fonts/broken-one.ttf'],
    ]);

    expect(fonts).toEqual([
      {
        family: 'Good One',
        sourceName: 'Good-One.ttf',
      },
    ]);
  });
});
