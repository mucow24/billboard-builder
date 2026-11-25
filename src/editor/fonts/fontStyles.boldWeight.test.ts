import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTextItem } from '../document/documentDefaults';
import type { UploadedFont } from '../document/documentTypes';
import { announceFontRegistration } from './fontRegistrations';
import { getDrawnFontItem, getRenderableCanvasFontDeclaration, getRenderableCombinedFontStyle } from './fontStyles';

const registered: UploadedFont[] = [];

vi.mock('./browserFontLoader', () => ({
  listRegisteredFonts: () => registered,
}));

function register(family: string, weight: UploadedFont['weight'] = '400') {
  registered.push({ family, sourceName: `${family}.ttf`, weight, style: 'normal', kind: 'bundled' });
  announceFontRegistration(family);
}

describe('the font bold text is drawn with', () => {
  beforeEach(() => {
    registered.length = 0;
    // A font set that can be listed and has every variant asked for.
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { check: () => true, addEventListener: () => undefined, [Symbol.iterator]: () => [].values() },
    });
  });

  afterEach(() => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: {} });
  });

  it('is the heavier weight of its typeface, in its regular weight', () => {
    register('Foo Light');
    register('Foo SemiBold');
    const item = createTextItem({ fontFamily: 'Foo Light', fontWeight: 'bold', fontSize: 40 });

    expect(getDrawnFontItem(item)).toMatchObject({ fontFamily: 'Foo SemiBold', fontWeight: 'normal' });
    expect(getRenderableCombinedFontStyle(item)).toBe('normal');
    expect(getRenderableCanvasFontDeclaration(item)).toBe('40px "Foo SemiBold", "Noto Emoji"');
    expect(getRenderableCanvasFontDeclaration({ ...item, fontStyle: 'italic' })).toBe(
      'italic 40px "Foo SemiBold", "Noto Emoji"',
    );
  });

  it('is its own family in bold where that is its bold file, or nothing is heavier', () => {
    register('Foo');
    register('Foo', '700');
    register('Lobster');

    expect(getRenderableCanvasFontDeclaration(createTextItem({ fontFamily: 'Foo', fontWeight: 'bold', fontSize: 40 }))).toBe(
      'bold 40px "Foo", "Noto Emoji"',
    );
    expect(
      getRenderableCanvasFontDeclaration(createTextItem({ fontFamily: 'Lobster', fontWeight: 'bold', fontSize: 40 })),
    ).toBe('bold 40px "Lobster", "Noto Emoji"');
  });

  it('follows the fonts as they are registered', () => {
    register('Foo Light');
    const item = createTextItem({ fontFamily: 'Foo Light', fontWeight: 'bold', fontSize: 40 });
    expect(getRenderableCanvasFontDeclaration(item)).toBe('bold 40px "Foo Light", "Noto Emoji"');

    register('Foo SemiBold');
    expect(getRenderableCanvasFontDeclaration(item)).toBe('40px "Foo SemiBold", "Noto Emoji"');
  });

  it('leaves text that is not bold in its own family', () => {
    register('Foo Light');
    register('Foo SemiBold');
    const item = createTextItem({ fontFamily: 'Foo Light', fontSize: 40 });

    expect(getDrawnFontItem(item)).toBe(item);
    expect(getRenderableCanvasFontDeclaration(item)).toBe('40px "Foo Light", "Noto Emoji"');
  });
});
