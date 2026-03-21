import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedUploadedFont } from './fontModel';
import {
  loadBundledFonts,
  loadFontEntries,
  registerFontFile,
  registerUploadedFontBytes,
} from './browserFontLoader';

class MockFontFace {
  family: string;
  source: string | ArrayBuffer;
  descriptors?: FontFaceDescriptors;

  constructor(family: string, source: string | ArrayBuffer, descriptors?: FontFaceDescriptors) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
  }

  async load() {
    if (this.family.includes('Broken')) {
      throw new Error('Failed to load font');
    }
    return this;
  }
}

describe('browser font loader', () => {
  beforeEach(() => {
    vi.stubGlobal('FontFace', MockFontFace);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        add: vi.fn(),
      },
    });
  });

  it('loads bundled startup fonts from src/assets/fonts with bundled provenance', async () => {
    const fonts = await loadBundledFonts();

    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: 'Arizonia',
          sourceName: 'Arizonia-Regular.ttf',
          weight: '400',
          style: 'normal',
          kind: 'bundled',
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
        weight: '400',
        style: 'normal',
        kind: 'bundled',
      },
    ]);
  });

  it('registers uploaded font files with uploaded provenance', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = new File([bytes], 'SessionSans-BoldItalic.ttf');
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: async () => bytes.buffer,
    });
    const font = await registerFontFile(file);

    expect(font).toEqual({
      family: 'Session Sans',
      sourceName: 'SessionSans-BoldItalic.ttf',
      weight: '700',
      style: 'italic',
      kind: 'uploaded',
    });
  });

  it('registers persisted uploaded font bytes with preserved metadata', async () => {
    const persistedFont: PersistedUploadedFont = {
      family: 'Stored Sans',
      sourceName: 'StoredSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
      bytes: new Uint8Array([9, 8, 7]).buffer,
    };

    const font = await registerUploadedFontBytes(persistedFont);

    expect(font).toEqual({
      family: 'Stored Sans',
      sourceName: 'StoredSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });
  });
});
