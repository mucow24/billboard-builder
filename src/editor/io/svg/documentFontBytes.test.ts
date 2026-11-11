import { describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import type {
  DocumentFontReference,
  ProjectDocument,
  TextCanvasItem,
  UploadedFont,
} from '../../document/documentTypes';
import { createDocumentFontLoader } from './documentFontBytes';

function docWithFonts(fonts: DocumentFontReference[]): ProjectDocument {
  return { ...createDefaultProjectDocument(), fonts };
}

function registered(
  family: string,
  sourceName: string,
  weight: UploadedFont['weight'],
  style: UploadedFont['style'],
  kind: UploadedFont['kind'] = 'bundled',
): UploadedFont {
  return { family, sourceName, weight, style, kind };
}

function textItem(
  fontFamily: string,
  fontWeight: TextCanvasItem['fontWeight'] = 'normal',
  fontStyle: TextCanvasItem['fontStyle'] = 'normal',
): TextCanvasItem {
  return createTextItem({ fontFamily, fontWeight, fontStyle });
}

/** Byte loaders whose "bytes" are distinct per source file, so a test can tell files apart. */
function trackingLoaders() {
  const bytesBySource = new Map<string, ArrayBuffer>();
  const bytesFor = (sourceName: string) => {
    let bytes = bytesBySource.get(sourceName);
    if (!bytes) {
      bytes = new Uint8Array([bytesBySource.size + 1]).buffer;
      bytesBySource.set(sourceName, bytes);
    }
    return bytes;
  };
  return {
    bytesFor,
    loadBundledBytes: vi.fn(async (sourceName: string) => bytesFor(sourceName)),
    loadUploadedBytes: vi.fn(async (ref: DocumentFontReference) => bytesFor(ref.sourceName)),
  };
}

const audiowideRef: DocumentFontReference = {
  family: 'Audiowide',
  sourceName: 'Audiowide-Regular.ttf',
  kind: 'bundled',
};
const audiowide = registered('Audiowide', 'Audiowide-Regular.ttf', '400', 'normal');

// Bundled Helvetica Neue. The document's font reference names whichever file comes
// first by filename, which is the bold one.
const helveticaNeue = [
  registered('Helvetica Neue', 'HelveticaNeueBold.otf', '700', 'normal'),
  registered('Helvetica Neue', 'HelveticaNeueBoldItalic.otf', '700', 'italic'),
  registered('Helvetica Neue', 'HelveticaNeueItalic.ttf', '400', 'italic'),
  registered('Helvetica Neue', 'HelveticaNeueRoman.otf', '400', 'normal'),
];
const helveticaNeueRef: DocumentFontReference = {
  family: 'Helvetica Neue',
  sourceName: 'HelveticaNeueBold.otf',
  kind: 'bundled',
};

describe('createDocumentFontLoader', () => {
  it('treats a family absent from the document as a system font', async () => {
    const loaders = trackingLoaders();
    // Even a family with registered files is not embedded unless the document references it.
    const load = createDocumentFontLoader(docWithFonts([]), [audiowide], loaders);

    expect(await load(textItem('Arial'))).toEqual({ kind: 'system', bytes: null });
    expect(await load(textItem('Arial', 'bold', 'italic'))).toEqual({ kind: 'system', bytes: null });
    expect(await load(textItem('Audiowide'))).toEqual({ kind: 'system', bytes: null });
    expect(loaders.loadBundledBytes).not.toHaveBeenCalled();
    expect(loaders.loadUploadedBytes).not.toHaveBeenCalled();
  });

  it('treats a family the document references as a system font as one', async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(
      docWithFonts([{ family: 'Georgia', sourceName: 'Georgia', kind: 'system' }]),
      [registered('Georgia', 'Georgia.ttf', '400', 'normal', 'uploaded')],
      loaders,
    );

    expect(await load(textItem('Georgia', 'bold'))).toEqual({ kind: 'system', bytes: null });
    expect(loaders.loadUploadedBytes).not.toHaveBeenCalled();
  });

  it('loads bundled bytes by source name', async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(docWithFonts([audiowideRef]), [audiowide], loaders);

    expect(await load(textItem('Audiowide'))).toEqual({
      kind: 'bundled',
      bytes: loaders.bytesFor('Audiowide-Regular.ttf'),
    });
    expect(loaders.loadBundledBytes).toHaveBeenCalledWith('Audiowide-Regular.ttf');
  });

  it('loads a different file for the regular, bold, italic and bold-italic items of one family', async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(docWithFonts([helveticaNeueRef]), helveticaNeue, loaders);

    const regular = await load(textItem('Helvetica Neue', 'normal', 'normal'));
    const bold = await load(textItem('Helvetica Neue', 'bold', 'normal'));
    const italic = await load(textItem('Helvetica Neue', 'normal', 'italic'));
    const boldItalic = await load(textItem('Helvetica Neue', 'bold', 'italic'));

    expect(loaders.loadBundledBytes.mock.calls.map(([sourceName]) => sourceName)).toEqual([
      'HelveticaNeueRoman.otf',
      'HelveticaNeueBold.otf',
      'HelveticaNeueItalic.ttf',
      'HelveticaNeueBoldItalic.otf',
    ]);
    expect(regular).toEqual({ kind: 'bundled', bytes: loaders.bytesFor('HelveticaNeueRoman.otf') });
    expect(bold).toEqual({ kind: 'bundled', bytes: loaders.bytesFor('HelveticaNeueBold.otf') });
    expect(italic).toEqual({ kind: 'bundled', bytes: loaders.bytesFor('HelveticaNeueItalic.ttf') });
    expect(boldItalic).toEqual({
      kind: 'bundled',
      bytes: loaders.bytesFor('HelveticaNeueBoldItalic.otf'),
    });
    expect(new Set([regular.bytes, bold.bytes, italic.bytes, boldItalic.bytes]).size).toBe(4);
  });

  it('falls back to the nearest file when the family has no file for the requested variant', async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(
      docWithFonts([
        { family: 'Instrument Serif', sourceName: 'InstrumentSerif-Italic.ttf', kind: 'bundled' },
        { family: 'Sulphur Point', sourceName: 'SulphurPoint-Bold.ttf', kind: 'bundled' },
        { family: 'Super16Bit', sourceName: 'Super16Bit-Bold.ttf', kind: 'bundled' },
      ]),
      [
        registered('Instrument Serif', 'InstrumentSerif-Italic.ttf', '400', 'italic'),
        registered('Instrument Serif', 'InstrumentSerif-Regular.ttf', '400', 'normal'),
        registered('Sulphur Point', 'SulphurPoint-Bold.ttf', '700', 'normal'),
        registered('Sulphur Point', 'SulphurPoint-Regular.ttf', '400', 'normal'),
        registered('Super16Bit', 'Super16Bit-Bold.ttf', '700', 'normal'),
        registered('Super16Bit', 'Super16Bit-BoldOblique.ttf', '700', 'italic'),
      ],
      loaders,
    );
    const sourceFor = async (item: TextCanvasItem) => {
      loaders.loadBundledBytes.mockClear();
      await load(item);
      return loaders.loadBundledBytes.mock.calls.map(([sourceName]) => sourceName);
    };

    // No bold file: bold text keeps its style and drops to the regular weight.
    expect(await sourceFor(textItem('Instrument Serif', 'bold', 'normal'))).toEqual([
      'InstrumentSerif-Regular.ttf',
    ]);
    expect(await sourceFor(textItem('Instrument Serif', 'bold', 'italic'))).toEqual([
      'InstrumentSerif-Italic.ttf',
    ]);
    // No italic file: italic text keeps its weight and drops to the upright style.
    expect(await sourceFor(textItem('Sulphur Point', 'normal', 'italic'))).toEqual([
      'SulphurPoint-Regular.ttf',
    ]);
    expect(await sourceFor(textItem('Sulphur Point', 'bold', 'italic'))).toEqual([
      'SulphurPoint-Bold.ttf',
    ]);
    // No regular-weight file at all: regular text uses the bold file of the same style.
    expect(await sourceFor(textItem('Super16Bit', 'normal', 'normal'))).toEqual(['Super16Bit-Bold.ttf']);
    expect(await sourceFor(textItem('Super16Bit', 'normal', 'italic'))).toEqual([
      'Super16Bit-BoldOblique.ttf',
    ]);
  });

  it('prefers the file registered last when two files share a weight and style', async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(
      docWithFonts([{ family: 'Futura', sourceName: 'Futura Bold Italic.otf', kind: 'bundled' }]),
      [
        registered('Futura', 'Futura Bold Italic.otf', '700', 'italic'),
        registered('Futura', 'Futura Regular.ttf', '400', 'normal'),
        registered('Futura', 'Futura Book.otf', '400', 'normal'),
      ],
      loaders,
    );

    await load(textItem('Futura'));

    expect(loaders.loadBundledBytes).toHaveBeenCalledWith('Futura Book.otf');
  });

  it('loads the uploaded file that matches the variant', async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(
      docWithFonts([{ family: 'Session Sans', sourceName: 'SessionSans-Bold.ttf', kind: 'uploaded' }]),
      [
        registered('Session Sans', 'SessionSans-Bold.ttf', '700', 'normal', 'uploaded'),
        registered('Session Sans', 'SessionSans-Regular.ttf', '400', 'normal', 'uploaded'),
      ],
      loaders,
    );

    expect(await load(textItem('Session Sans'))).toEqual({
      kind: 'uploaded',
      bytes: loaders.bytesFor('SessionSans-Regular.ttf'),
    });
    expect(await load(textItem('Session Sans', 'bold'))).toEqual({
      kind: 'uploaded',
      bytes: loaders.bytesFor('SessionSans-Bold.ttf'),
    });
    expect(loaders.loadUploadedBytes.mock.calls.map(([ref]) => ref)).toEqual([
      { family: 'Session Sans', sourceName: 'SessionSans-Regular.ttf', kind: 'uploaded' },
      { family: 'Session Sans', sourceName: 'SessionSans-Bold.ttf', kind: 'uploaded' },
    ]);
    expect(loaders.loadBundledBytes).not.toHaveBeenCalled();
  });

  it('resolves the variant the same way when the document references every uploaded file of the family', async () => {
    const boldRef: DocumentFontReference = {
      family: 'Session Sans',
      sourceName: 'SessionSans-Bold.ttf',
      kind: 'uploaded',
    };
    const regularRef: DocumentFontReference = {
      family: 'Session Sans',
      sourceName: 'SessionSans-Regular.ttf',
      kind: 'uploaded',
    };
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(
      docWithFonts([boldRef, regularRef]),
      [
        registered('Session Sans', 'SessionSans-Bold.ttf', '700', 'normal', 'uploaded'),
        registered('Session Sans', 'SessionSans-Regular.ttf', '400', 'normal', 'uploaded'),
      ],
      loaders,
    );

    expect(await load(textItem('Session Sans'))).toEqual({
      kind: 'uploaded',
      bytes: loaders.bytesFor('SessionSans-Regular.ttf'),
    });
    expect(await load(textItem('Session Sans', 'bold'))).toEqual({
      kind: 'uploaded',
      bytes: loaders.bytesFor('SessionSans-Bold.ttf'),
    });
    expect(loaders.loadUploadedBytes.mock.calls.map(([ref]) => ref)).toEqual([regularRef, boldRef]);
  });

  it('loads an uploaded file that overrides a bundled one of the same family and variant', async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(
      docWithFonts([helveticaNeueRef]),
      [
        ...helveticaNeue,
        registered('Helvetica Neue', 'HelveticaNeue-Bold.ttf', '700', 'normal', 'uploaded'),
      ],
      loaders,
    );

    expect(await load(textItem('Helvetica Neue', 'bold'))).toEqual({
      kind: 'uploaded',
      bytes: loaders.bytesFor('HelveticaNeue-Bold.ttf'),
    });
    expect(await load(textItem('Helvetica Neue'))).toEqual({
      kind: 'bundled',
      bytes: loaders.bytesFor('HelveticaNeueRoman.otf'),
    });
  });

  it("falls back to the document's own reference when none of the family's files are registered", async () => {
    const loaders = trackingLoaders();
    const load = createDocumentFontLoader(
      docWithFonts([
        audiowideRef,
        { family: 'Ghost Sans', sourceName: 'GhostSans-Italic.ttf', kind: 'uploaded' },
      ]),
      helveticaNeue,
      loaders,
    );

    expect(await load(textItem('Audiowide', 'bold'))).toEqual({
      kind: 'bundled',
      bytes: loaders.bytesFor('Audiowide-Regular.ttf'),
    });
    expect(await load(textItem('Ghost Sans'))).toEqual({
      kind: 'uploaded',
      bytes: loaders.bytesFor('GhostSans-Italic.ttf'),
    });
    expect(loaders.loadUploadedBytes).toHaveBeenCalledWith({
      family: 'Ghost Sans',
      sourceName: 'GhostSans-Italic.ttf',
      kind: 'uploaded',
    });
  });

  it('degrades to null bytes (never throws) when a loader fails', async () => {
    const load = createDocumentFontLoader(docWithFonts([audiowideRef]), [audiowide], {
      loadBundledBytes: vi.fn(async () => {
        throw new Error('network');
      }),
      loadUploadedBytes: vi.fn(),
    });
    expect(await load(textItem('Audiowide'))).toEqual({ kind: 'bundled', bytes: null });
  });
});
