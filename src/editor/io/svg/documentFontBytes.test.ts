import { describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import type { DocumentFontReference, ProjectDocument } from '../../document/documentTypes';
import { createDocumentFontLoader } from './documentFontBytes';

function docWithFonts(fonts: DocumentFontReference[]): ProjectDocument {
  return { ...createDefaultProjectDocument(), fonts };
}

const bundledRef: DocumentFontReference = {
  family: 'Audiowide',
  sourceName: 'Audiowide-Regular.ttf',
  kind: 'bundled',
};

describe('createDocumentFontLoader', () => {
  it('treats a family absent from the document as a system font', async () => {
    const load = createDocumentFontLoader(docWithFonts([]), {
      loadBundledBytes: vi.fn(),
      loadUploadedBytes: vi.fn(),
    });
    expect(await load(createTextItem({ fontFamily: 'Arial' }))).toEqual({ kind: 'system', bytes: null });
  });

  it('loads bundled bytes by source name', async () => {
    const bytes = new Uint8Array([1, 2]).buffer;
    const loadBundledBytes = vi.fn(async () => bytes);
    const load = createDocumentFontLoader(docWithFonts([bundledRef]), {
      loadBundledBytes,
      loadUploadedBytes: vi.fn(),
    });

    expect(await load(createTextItem({ fontFamily: 'Audiowide' }))).toEqual({ kind: 'bundled', bytes });
    expect(loadBundledBytes).toHaveBeenCalledWith('Audiowide-Regular.ttf');
  });

  it('degrades to null bytes (never throws) when a loader fails', async () => {
    const load = createDocumentFontLoader(docWithFonts([bundledRef]), {
      loadBundledBytes: vi.fn(async () => {
        throw new Error('network');
      }),
      loadUploadedBytes: vi.fn(),
    });
    expect(await load(createTextItem({ fontFamily: 'Audiowide' }))).toEqual({ kind: 'bundled', bytes: null });
  });
});
