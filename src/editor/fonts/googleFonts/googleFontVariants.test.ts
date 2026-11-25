import { describe, expect, it } from 'vitest';

import { groupFontOptions } from '../fontFamilyGroups';
import {
  describeGoogleFontVariant,
  googleFontEntryName,
  parseGoogleFontVariant,
  sortGoogleFontVariants,
  toImportedFontMetadata,
  type GoogleFontVariant,
} from './googleFontVariants';

function variant(key: string): GoogleFontVariant {
  const parsed = parseGoogleFontVariant(key);
  if (!parsed) {
    throw new Error(`Not a style key: ${key}`);
  }
  return parsed;
}

describe('parseGoogleFontVariant', () => {
  it('reads the keys Google lists a family by', () => {
    expect(parseGoogleFontVariant('regular')).toEqual({ key: 'regular', weight: 400, italic: false });
    expect(parseGoogleFontVariant('italic')).toEqual({ key: 'italic', weight: 400, italic: true });
    expect(parseGoogleFontVariant('300')).toEqual({ key: '300', weight: 300, italic: false });
    expect(parseGoogleFontVariant('900italic')).toEqual({
      key: '900italic',
      weight: 900,
      italic: true,
    });
  });

  it('rejects what is not a style key', () => {
    expect(parseGoogleFontVariant('')).toBeNull();
    expect(parseGoogleFontVariant('bold')).toBeNull();
    expect(parseGoogleFontVariant('300regular')).toBeNull();
    expect(parseGoogleFontVariant('0')).toBeNull();
    expect(parseGoogleFontVariant('1200')).toBeNull();
  });
});

describe('sortGoogleFontVariants', () => {
  it('orders by weight, each upright style before its italic', () => {
    const sorted = sortGoogleFontVariants(
      ['regular', '700italic', '100', 'italic', '700', '100italic'].map(variant),
    );

    expect(sorted.map((entry) => entry.key)).toEqual([
      '100',
      '100italic',
      'regular',
      'italic',
      '700',
      '700italic',
    ]);
  });
});

describe('describeGoogleFontVariant', () => {
  it('names a style the way Google does', () => {
    expect(describeGoogleFontVariant(variant('regular'))).toBe('Regular');
    expect(describeGoogleFontVariant(variant('italic'))).toBe('Italic');
    expect(describeGoogleFontVariant(variant('200'))).toBe('ExtraLight');
    expect(describeGoogleFontVariant(variant('600italic'))).toBe('SemiBold Italic');
    expect(describeGoogleFontVariant(variant('700'))).toBe('Bold');
    expect(describeGoogleFontVariant(variant('700italic'))).toBe('Bold Italic');
    expect(describeGoogleFontVariant(variant('950'))).toBe('Weight 950');
  });
});

describe('toImportedFontMetadata', () => {
  it('makes the regular and bold styles, and their italics, the four faces of the family', () => {
    expect(toImportedFontMetadata('Playfair Display', variant('regular'))).toEqual({
      family: 'Playfair Display',
      sourceName: 'PlayfairDisplay-Regular.ttf',
      weight: '400',
      style: 'normal',
    });
    expect(toImportedFontMetadata('Playfair Display', variant('italic'))).toEqual({
      family: 'Playfair Display',
      sourceName: 'PlayfairDisplay-Italic.ttf',
      weight: '400',
      style: 'italic',
    });
    expect(toImportedFontMetadata('Playfair Display', variant('700'))).toEqual({
      family: 'Playfair Display',
      sourceName: 'PlayfairDisplay-Bold.ttf',
      weight: '700',
      style: 'normal',
    });
    expect(toImportedFontMetadata('Playfair Display', variant('700italic'))).toEqual({
      family: 'Playfair Display',
      sourceName: 'PlayfairDisplay-BoldItalic.ttf',
      weight: '700',
      style: 'italic',
    });
  });

  it('makes any other weight an entry of its own, with its italic as that entry’s italic face', () => {
    expect(toImportedFontMetadata('Roboto', variant('300'))).toEqual({
      family: 'Roboto Light',
      sourceName: 'Roboto-Light.ttf',
      weight: '400',
      style: 'normal',
    });
    expect(toImportedFontMetadata('Roboto', variant('800italic'))).toEqual({
      family: 'Roboto ExtraBold',
      sourceName: 'Roboto-ExtraBoldItalic.ttf',
      weight: '400',
      style: 'italic',
    });
  });

  it('names the entries so that the font menu gathers them under the family again', () => {
    const keys = ['100', '200', '300', 'regular', '500', '600', '700', '800', '900'];
    const names = [...new Set(keys.map((key) => googleFontEntryName('Roboto', variant(key))))];

    const entries = groupFontOptions(names.sort().map((family) => ({ family })));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'family', label: 'Roboto' });
    expect(entries[0].kind === 'family' && entries[0].members.map((member) => member.label)).toEqual(
      ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'ExtraBold', 'Black'],
    );
  });
});
