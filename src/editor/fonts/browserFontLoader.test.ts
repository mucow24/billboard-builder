import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedUploadedFont } from './fontModel';
import {
  listRegisteredFonts,
  loadBundledFonts,
  loadFontEntries,
  registerFontFile,
  registerUploadedFontBytes,
} from './browserFontLoader';

/** Font loads a test wants to finish or fail by hand, keyed by source URL. */
const pendingLoads = new Map<string, { finish: () => void; fail: (reason: Error) => void }>();

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
      await new Promise<void>((finish, fail) => pendingLoads.set(source, { finish, fail }));
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

  it('loads the bundled fonts in filename order', async () => {
    const sourceNames = (await loadBundledFonts()).map((font) => font.sourceName);

    // Of two files with the same family, weight and style, the later entry is the
    // one text renders with, so the order must not change between builds.
    expect(sourceNames).toEqual([...sourceNames].sort());
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

  /** Settle a deferred font load and let the loader carry on from it. */
  async function settleLoad(url: string, outcome: 'finish' | 'fail') {
    // Matched by URL alone, however the loader wrote it into the face's source.
    const pending = [...pendingLoads].find(([source]) => source.includes(url));
    if (!pending) throw new Error(`No pending font load for ${url}`);
    if (outcome === 'finish') {
      pending[1].finish();
    } else {
      pending[1].fail(new Error('Failed to load font'));
    }
    await new Promise((settle) => setTimeout(settle, 0));
  }
  const finishLoad = (url: string) => settleLoad(url, 'finish');
  const failLoad = (url: string) => settleLoad(url, 'fail');

  /** A real Set stands in for the FontFaceSet: same `add`, same insertion-order iteration. */
  function stubFontSet() {
    pendingLoads.clear();
    Object.defineProperty(document, 'fonts', { configurable: true, value: new Set() });
  }

  // "Poster Book.otf" and "Poster Regular.ttf" are two files for one family, weight
  // and style. The browser renders with whichever of their faces was added last.
  const posterEntries: Array<[string, string]> = [
    ['src/assets/fonts/Poster Book.otf', '/deferred/poster-book.otf'],
    ['src/assets/fonts/Poster Regular.ttf', '/deferred/poster-regular.ttf'],
    ['src/assets/fonts/Poster Bold.otf', '/fonts/poster-bold.otf'],
  ];

  describe('bundled font registration order', () => {
    /** The entry URL behind each face in `document.fonts`, in the order the faces were added. */
    function urlsInDocumentFonts(entries: Array<[string, string]>): string[] {
      return [...document.fonts].map((fontFace) => {
        const { source } = fontFace as unknown as MockFontFace;
        // Matched by URL alone, however the loader wrote it into the face's source.
        const entry = entries.find(([, url]) => typeof source === 'string' && source.includes(url));
        return entry ? entry[1] : `no entry for ${String(source)}`;
      });
    }

    beforeEach(stubFontSet);

    it('registers a face as soon as it has loaded, without waiting for unrelated fonts', async () => {
      const entries: Array<[string, string]> = [
        ['src/assets/fonts/Slow-One.ttf', '/deferred/slow-one.ttf'],
        ['src/assets/fonts/Quick-One.ttf', '/fonts/quick-one.ttf'],
      ];
      const loading = loadFontEntries(entries);
      await new Promise((settle) => setTimeout(settle, 0));

      // Text can already render with the quick font while the slow one is on its way.
      expect(urlsInDocumentFonts(entries)).toEqual(['/fonts/quick-one.ttf']);

      await finishLoad('/deferred/slow-one.ttf');
      await loading;
      expect(urlsInDocumentFonts(entries)).toEqual(['/fonts/quick-one.ttf', '/deferred/slow-one.ttf']);
    });

    it.each([
      ['the earlier file', ['/deferred/poster-book.otf', '/deferred/poster-regular.ttf']],
      ['the later file', ['/deferred/poster-regular.ttf', '/deferred/poster-book.otf']],
    ])(
      'registers two files for one family, weight and style in entry order when %s finishes loading first',
      async (_finishesFirst, loadOrder) => {
        const loading = loadFontEntries(posterEntries);
        for (const url of loadOrder) {
          await finishLoad(url);
        }
        await loading;

        // "Poster Bold.otf" is a different variant and was ready at once. The two
        // regular files follow in entry order, so the later entry wins either way.
        expect(urlsInDocumentFonts(posterEntries)).toEqual([
          '/fonts/poster-bold.otf',
          '/deferred/poster-book.otf',
          '/deferred/poster-regular.ttf',
        ]);
      },
    );

    it('registers the later file once the earlier file for the same variant has failed to load', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const loading = loadFontEntries(posterEntries);
        await finishLoad('/deferred/poster-regular.ttf');
        // Loaded, but held back while the earlier file for its variant is still loading.
        expect(urlsInDocumentFonts(posterEntries)).toEqual(['/fonts/poster-bold.otf']);

        await failLoad('/deferred/poster-book.otf');
        const fonts = await loading;

        expect(urlsInDocumentFonts(posterEntries)).toEqual([
          '/fonts/poster-bold.otf',
          '/deferred/poster-regular.ttf',
        ]);
        expect(fonts.map((font) => font.sourceName)).toEqual(['Poster Regular.ttf', 'Poster Bold.otf']);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          'Skipping bundled font that failed to load.',
          expect.any(Error),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('listRegisteredFonts', () => {
    beforeEach(stubFontSet);

    it('lists registered files in the order their faces joined document.fonts, not filename order', async () => {
      const loading = loadFontEntries(posterEntries);
      await new Promise((settle) => setTimeout(settle, 0));
      // Nothing is listed until its face has loaded and been added.
      expect(listRegisteredFonts().map((font) => font.sourceName)).toEqual(['Poster Bold.otf']);

      // The later of the two regular files finishes loading first. It is not
      // listed yet: its face waits for the earlier file's.
      await finishLoad('/deferred/poster-regular.ttf');
      expect(listRegisteredFonts().map((font) => font.sourceName)).toEqual(['Poster Bold.otf']);
      await finishLoad('/deferred/poster-book.otf');
      const fonts = await loading;

      // The loader reports its results in entry (filename) order...
      expect(fonts.map((font) => font.sourceName)).toEqual([
        'Poster Book.otf',
        'Poster Regular.ttf',
        'Poster Bold.otf',
      ]);
      // ...while the registry reports the order the browser matches faces in.
      expect(listRegisteredFonts()).toEqual([
        { family: 'Poster', sourceName: 'Poster Bold.otf', weight: '700', style: 'normal', kind: 'bundled' },
        { family: 'Poster', sourceName: 'Poster Book.otf', weight: '400', style: 'normal', kind: 'bundled' },
        { family: 'Poster', sourceName: 'Poster Regular.ttf', weight: '400', style: 'normal', kind: 'bundled' },
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
