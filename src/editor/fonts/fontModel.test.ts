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

  it.each([
    ['Roboto-SemiBold.ttf', 'Roboto SemiBold', 'normal'],
    ['Roboto-DemiBold.ttf', 'Roboto DemiBold', 'normal'],
    ['Roboto-ExtraBold.ttf', 'Roboto ExtraBold', 'normal'],
    ['Roboto-UltraBold.ttf', 'Roboto UltraBold', 'normal'],
    ['Roboto-SemiBoldItalic.ttf', 'Roboto SemiBold', 'italic'],
    ['Roboto-ExtraBoldItalic.ttf', 'Roboto ExtraBold', 'italic'],
    ['RobotoCondensed-ExtraBoldItalic.ttf', 'Roboto Condensed ExtraBold', 'italic'],
  ] as const)(
    'reads %s as a regular-weight face of its own entry, not as a bold',
    (sourceName, family, style) => {
      expect(parseFontSourceName(sourceName)).toEqual({
        family,
        sourceName,
        weight: '400',
        style,
      });
    }
  );

  it.each([
    ['Roboto Extra Bold.ttf', 'Roboto ExtraBold', 'normal'],
    ['Roboto-Semi-Bold.ttf', 'Roboto SemiBold', 'normal'],
    ['Roboto_Ultra_Bold_Italic.otf', 'Roboto UltraBold', 'italic'],
    ['roboto demi bold oblique.woff2', 'roboto demibold', 'italic'],
  ] as const)(
    'joins the weight word of %s into one word of the family name',
    (sourceName, family, style) => {
      expect(parseFontSourceName(sourceName)).toEqual({
        family,
        sourceName,
        weight: '400',
        style,
      });
    }
  );

  it('still reads "Bold" as bold when no word before it changes the weight', () => {
    expect(parseFontSourceName('Roboto-Bold.ttf')).toMatchObject({
      family: 'Roboto',
      weight: '700',
    });
    // "Semi" and "Extra" belong to the width here, not to "Bold".
    expect(parseFontSourceName('BarlowSemiCondensed-Bold.ttf')).toMatchObject({
      family: 'Barlow Semi Condensed',
      weight: '700',
    });
    expect(parseFontSourceName('FiraSansExtraCondensed-BoldItalic.ttf')).toMatchObject({
      family: 'Fira Sans Extra Condensed',
      weight: '700',
      style: 'italic',
    });
    expect(parseFontSourceName('BarlowSemiCondensed-SemiBold.ttf')).toMatchObject({
      family: 'Barlow Semi Condensed SemiBold',
      weight: '400',
    });
  });

  it('leaves weight words that are already one word, or do not end in "Bold", as they were', () => {
    expect(parseFontSourceName('Barlow-Extrabold.ttf')).toMatchObject({
      family: 'Barlow Extrabold',
      weight: '400',
    });
    expect(parseFontSourceName('Kodchasan-SemiboldItalic.ttf')).toMatchObject({
      family: 'Kodchasan Semibold',
      weight: '400',
      style: 'italic',
    });
    expect(parseFontSourceName('Barlow-ExtraLight.ttf')).toMatchObject({
      family: 'Barlow Extra Light',
      weight: '400',
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
