import { afterEach, describe, expect, it, vi } from 'vitest';

import { runEditorStartup, type EditorStartupDeps } from './editorStartup';
import {
  createDefaultProjectDocument,
  createRectangleItem,
  createTextItem,
} from '../editor/document/documentDefaults';
import type { ProjectDocument, UploadedFont } from '../editor/document/documentTypes';
import type { FontLoadOptions } from '../editor/fonts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every promise continuation that is ready to run do so. */
async function settle() {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

function bundledFont(family: string): UploadedFont {
  return {
    family,
    sourceName: `${family.replace(/ /g, '')}-Regular.ttf`,
    weight: '400',
    style: 'normal',
    kind: 'bundled',
  };
}

function savedCanvasSetIn(...families: string[]): ProjectDocument {
  return {
    ...createDefaultProjectDocument(),
    nodes: [
      createRectangleItem({ id: 'saved-rectangle' }),
      ...families.map((fontFamily, index) => createTextItem({ id: `saved-text-${index}`, fontFamily })),
    ],
    fonts: [{ family: 'Poster Sans', sourceName: 'PosterSans-Regular.ttf', kind: 'uploaded' }],
  };
}

/** A startup run whose every step finishes only when the test says so. */
function startStartup(overrides: Partial<EditorStartupDeps> = {}) {
  const events: string[] = [];
  const savedCanvas = deferred<ProjectDocument | null>();
  const firstFonts = deferred<void>();
  const allFonts = deferred<UploadedFont[]>();
  const uploadedFonts = deferred<void>();
  let fontOptions: FontLoadOptions | undefined;
  let cancelled = false;

  const finished = runEditorStartup({
    loadSavedCanvas: () => savedCanvas.promise,
    loadBundledFonts: (options) => {
      fontOptions = options;
      events.push(`load bundled fonts, first: ${[...(options.first ?? [])].join(', ') || 'none'}`);
      return { first: firstFonts.promise, all: allFonts.promise };
    },
    restoreUploadedFonts: (references) => {
      events.push(`restore uploaded fonts: ${references.map((font) => font.family).join(', ')}`);
      return uploadedFonts.promise;
    },
    registerAvailableFont: (font) => events.push(`register ${font.family}`),
    loadDocument: (document) => events.push(`load document with ${document.nodes.length} nodes`),
    onCanvasReady: () => events.push('canvas ready'),
    onFontsReady: () => events.push('fonts ready'),
    isCancelled: () => cancelled,
    ...overrides,
  });

  return {
    events,
    finished,
    savedCanvas,
    firstFonts,
    allFonts,
    uploadedFonts,
    familyLoaded: (...fonts: UploadedFont[]) => fontOptions?.onFamilyLoaded?.(fonts),
    cancel: () => {
      cancelled = true;
    },
  };
}

describe('runEditorStartup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the saved canvas before it asks for any font, and asks for the fonts of its text first', async () => {
    const startup = startStartup();
    await settle();
    expect(startup.events).toEqual([]);

    startup.savedCanvas.resolve(savedCanvasSetIn('Barlow', 'Arial', 'Barlow'));
    await settle();

    expect(startup.events).toEqual([
      'load bundled fonts, first: Barlow, Arial',
      'restore uploaded fonts: Poster Sans',
    ]);
  });

  it('puts the saved canvas in the editor only once its bundled and uploaded fonts are registered', async () => {
    const startup = startStartup();
    startup.savedCanvas.resolve(savedCanvasSetIn('Barlow'));
    await settle();
    startup.events.length = 0;

    startup.familyLoaded(bundledFont('Barlow'));
    startup.firstFonts.resolve();
    await settle();
    // Its uploaded font is still on the way.
    expect(startup.events).toEqual(['register Barlow']);

    startup.uploadedFonts.resolve();
    await settle();
    expect(startup.events).toEqual(['register Barlow', 'load document with 2 nodes', 'canvas ready']);
  });

  it('does not wait for the uploaded fonts while the bundled fonts of the canvas are still loading', async () => {
    const startup = startStartup();
    startup.savedCanvas.resolve(savedCanvasSetIn('Barlow'));
    await settle();
    startup.events.length = 0;

    startup.uploadedFonts.resolve();
    await settle();
    expect(startup.events).toEqual([]);

    startup.firstFonts.resolve();
    await settle();
    expect(startup.events).toEqual(['load document with 2 nodes', 'canvas ready']);
  });

  it('reports the canvas ready without waiting for the other bundled fonts, which register as they arrive', async () => {
    const startup = startStartup();
    startup.savedCanvas.resolve(savedCanvasSetIn('Barlow'));
    startup.firstFonts.resolve();
    startup.uploadedFonts.resolve();
    await settle();
    expect(startup.events.at(-1)).toBe('canvas ready');
    startup.events.length = 0;

    startup.familyLoaded(bundledFont('Arizonia'));
    startup.familyLoaded(bundledFont('Cal Sans'), { ...bundledFont('Cal Sans'), weight: '700' });
    expect(startup.events).toEqual(['register Arizonia', 'register Cal Sans', 'register Cal Sans']);

    await settle();
    expect(startup.events).not.toContain('fonts ready');

    startup.allFonts.resolve([]);
    await startup.finished;
    expect(startup.events.at(-1)).toBe('fonts ready');
  });

  it('starts with an empty canvas when nothing is saved: no document is loaded and no font goes first', async () => {
    const startup = startStartup();
    startup.savedCanvas.resolve(null);
    startup.firstFonts.resolve();
    await settle();

    expect(startup.events).toEqual(['load bundled fonts, first: none', 'canvas ready']);
  });

  it('starts with an empty canvas when the saved one cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const startup = startStartup();
    startup.savedCanvas.reject(new Error('storage is unavailable'));
    startup.firstFonts.resolve();
    startup.allFonts.resolve([]);
    await startup.finished;

    expect(startup.events).toEqual(['load bundled fonts, first: none', 'canvas ready', 'fonts ready']);
    expect(warn).toHaveBeenCalled();
  });

  it('still shows the saved canvas when its uploaded fonts cannot be restored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const startup = startStartup();
    startup.savedCanvas.resolve(savedCanvasSetIn());
    startup.firstFonts.resolve();
    startup.uploadedFonts.reject(new Error('storage is unavailable'));
    await settle();

    expect(startup.events.slice(-2)).toEqual(['load document with 1 nodes', 'canvas ready']);
    expect(warn).toHaveBeenCalled();
  });

  it('leaves the editor alone once it has been cancelled', async () => {
    const startup = startStartup();
    startup.savedCanvas.resolve(savedCanvasSetIn('Barlow'));
    await settle();
    startup.events.length = 0;

    startup.cancel();
    startup.familyLoaded(bundledFont('Barlow'));
    startup.firstFonts.resolve();
    startup.uploadedFonts.resolve();
    startup.allFonts.resolve([]);
    await startup.finished;

    expect(startup.events).toEqual([]);
  });

  it('does not ask for fonts when cancelled while the saved canvas was being read', async () => {
    const startup = startStartup();
    startup.cancel();
    startup.savedCanvas.resolve(savedCanvasSetIn('Barlow'));
    await startup.finished;

    expect(startup.events).toEqual([]);
  });
});
