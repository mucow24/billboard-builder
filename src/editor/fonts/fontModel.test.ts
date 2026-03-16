import { describe, expect, it } from 'vitest';

import {
  createBundledFont,
  createUploadedFont,
  fontFamilyFromSourceName,
  parseFontSourceName,
  toFontReference,
} from './fontModel';

describe('font model', () => {
  it('derives a readable font family from a source file name', () => {
    expect(fontFamilyFromSourceName('Acme-Sans_Bold.otf')).toBe('Acme Sans');
  });

  it('parses font family, weight, and style from source names', () => {
    expect(parseFontSourceName('InstrumentSerif-Regular.ttf')).toEqual({
      family: 'Instrument Serif',
      sourceName: 'InstrumentSerif-Regular.ttf',
      weight: '400',
      style: 'normal',
    });
    expect(parseFontSourceName('InstrumentSerif-BoldItalic.ttf')).toEqual({
      family: 'Instrument Serif',
      sourceName: 'InstrumentSerif-BoldItalic.ttf',
      weight: '700',
      style: 'italic',
    });
  });

  it('creates bundled and uploaded runtime fonts with explicit provenance', () => {
    const metadata = parseFontSourceName('PosterSans-Bold.ttf');

    expect(createBundledFont(metadata)).toEqual({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Bold.ttf',
      weight: '700',
      style: 'normal',
      kind: 'bundled',
    });
    expect(createUploadedFont(metadata)).toEqual({
      family: 'Poster Sans',
      sourceName: 'PosterSans-Bold.ttf',
      weight: '700',
      style: 'normal',
      kind: 'uploaded',
    });
  });

  it('creates document font references that preserve runtime provenance', () => {
    expect(
      toFontReference({
        family: 'Session Sans',
        sourceName: 'SessionSans.ttf',
        weight: '400',
        style: 'normal',
        kind: 'uploaded',
      })
    ).toEqual({
      family: 'Session Sans',
      sourceName: 'SessionSans.ttf',
      kind: 'uploaded',
    });

    expect(
      toFontReference({
        family: 'Arizonia',
        sourceName: 'Arizonia-Regular.ttf',
        weight: '400',
        style: 'normal',
        kind: 'bundled',
      })
    ).toEqual({
      family: 'Arizonia',
      sourceName: 'Arizonia-Regular.ttf',
      kind: 'bundled',
    });
  });
});
