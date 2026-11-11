import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedUploadedFont } from './fontModel';
import {
  listRegisteredFonts,
  loadBundledFonts,
  loadFontEntries,
  registerFontFile,
  registerUploadedFontBytes,
} from './browserFontLoader';

/** Resolvers for font loads a test wants to finish by hand, keyed by source URL. */
const pendingLoads = new Map<string, () => void>();

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
    if (typeof this.source === 'string' && this.source.includes('/deferred/')) {
      const source = this.source;
      await new Promise<void>((resolve) => pendingLoads.set(source, resolve));
    }
    return this;
  }
}

/** The `source` each registered FontFace was constructed with, in registration order. */
function registeredFontSources(): Array<string | ArrayBuffer> {
  return vi
    .mocked(document.fonts.add)
    .mock.calls.map(([fontFace]) => (fontFace as unknown as MockFontFace).source);
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
    // The production code intentionally console.warn's when a font fails to
    // load; silence it here so this success-path test doesn't pollute stderr.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
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
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('loads a bundled font whose file name contains parentheses', async () => {
    const fonts = await loadFontEntries([
      [
        '../../assets/fonts/Elite Hacker (Corroded).ttf',
        '/src/assets/fonts/Elite%20Hacker%20(Corroded).ttf',
      ],
    ]);

    expect(fonts).toEqual([
      {
        family: 'Elite Hacker Corroded',
        sourceName: 'Elite Hacker (Corroded).ttf',
        weight: '400',
        style: 'normal',
        kind: 'bundled',
      },
    ]);
    // The URL must be quoted: in an unquoted CSS url() the parentheses are a
    // syntax error, and a real browser rejects the whole FontFace source.
    expect(registeredFontSources()).toEqual([
      'url("/src/assets/fonts/Elite%20Hacker%20(Corroded).ttf")',
    ]);
  });

  it('escapes quotes, backslashes and line breaks inside the quoted font URL', async () => {
    await loadFontEntries([['src/assets/fonts/Odd-Name.ttf', '/fonts/a"b\\c\nd.ttf']]);

    // String.raw keeps the expectation readable as the literal CSS text.
    expect(registeredFontSources()).toEqual([String.raw`url("/fonts/a\"b\\c\a d.ttf")`]);
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

  describe('listRegisteredFonts', () => {
    /** Finish a deferred font load and let the loader add the face to `document.fonts`. */
    async function finishLoad(url: string) {
      // Matched by URL alone, however the loader wrote it into the face's source.
      const pending = [...pendingLoads].find(([source]) => source.includes(url));
      if (!pending) throw new Error(`No pending font load for ${url}`);
      pending[1]();
      await new Promise((settle) => setTimeout(settle, 0));
    }

    beforeEach(() => {
      pendingLoads.clear();
      // A real Set stands in for the FontFaceSet: same `add`, same insertion-order iteration.
      Object.defineProperty(document, 'fonts', { configurable: true, value: new Set() });
    });

    it('lists registered files in the order their faces joined document.fonts, not filename order', async () => {
      const loading = loadFontEntries([
        ['src/assets/fonts/Poster Book.otf', '/deferred/poster-book.otf'],
        ['src/assets/fonts/Poster Regular.ttf', '/deferred/poster-regular.ttf'],
        ['src/assets/fonts/Poster Bold.otf', '/fonts/poster-bold.otf'],
      ]);
      await new Promise((settle) => setTimeout(settle, 0));
      // Nothing is listed until its face has loaded and been added.
      expect(listRegisteredFonts().map((font) => font.sourceName)).toEqual(['Poster Bold.otf']);

      // The later filename finishes loading first, so the browser sees it first.
      await finishLoad('/deferred/poster-regular.ttf');
      await finishLoad('/deferred/poster-book.otf');
      const fonts = await loading;

      // The loader still reports its results in entry (filename) order...
      expect(fonts.map((font) => font.sourceName)).toEqual([
        'Poster Book.otf',
        'Poster Regular.ttf',
        'Poster Bold.otf',
      ]);
      // ...while the registry reports the order the browser matches faces in.
      expect(listRegisteredFonts()).toEqual([
        { family: 'Poster', sourceName: 'Poster Bold.otf', weight: '700', style: 'normal', kind: 'bundled' },
        { family: 'Poster', sourceName: 'Poster Regular.ttf', weight: '400', style: 'normal', kind: 'bundled' },
        { family: 'Poster', sourceName: 'Poster Book.otf', weight: '400', style: 'normal', kind: 'bundled' },
      ]);
    });

    it('lists uploaded fonts after the bundled ones they were registered after', async () => {
      await loadFontEntries([['src/assets/fonts/Good-One.ttf', '/fonts/good-one.ttf']]);
      await registerUploadedFontBytes({
        family: 'Good One',
        sourceName: 'GoodOne-Bold.ttf',
        weight: '700',
        style: 'normal',
        kind: 'uploaded',
        bytes: new Uint8Array([1]).buffer,
      });

      expect(listRegisteredFonts()).toEqual([
        { family: 'Good One', sourceName: 'Good-One.ttf', weight: '400', style: 'normal', kind: 'bundled' },
        { family: 'Good One', sourceName: 'GoodOne-Bold.ttf', weight: '700', style: 'normal', kind: 'uploaded' },
      ]);
    });

    it('leaves out fonts that failed to load and faces it did not register', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        document.fonts.add(new MockFontFace('Page Font', '/fonts/page.ttf') as unknown as FontFace);
        await loadFontEntries([
          ['src/assets/fonts/Broken-One.ttf', '/fonts/broken-one.ttf'],
          ['src/assets/fonts/Good-One.ttf', '/fonts/good-one.ttf'],
        ]);

        expect(listRegisteredFonts().map((font) => font.sourceName)).toEqual(['Good-One.ttf']);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('lists nothing where the browser has no font set', () => {
      Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });

      expect(listRegisteredFonts()).toEqual([]);
    });
  });
});
