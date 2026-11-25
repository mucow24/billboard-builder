import { describe, expect, it } from 'vitest';

import type { UploadedFont } from '../document/documentTypes';
import {
  drawnFontFamiliesOf,
  drawnFontOf,
  fontFamilyGroupKey,
  fontFamilyUseOf,
  resolveBoldFont,
  usesBold,
} from './boldWeight';

type FontFile = Pick<UploadedFont, 'family' | 'weight' | 'style'>;

const file = (family: string, weight: '400' | '700' = '400', style: 'normal' | 'italic' = 'normal'): FontFile => ({
  family,
  weight,
  style,
});

/** A typeface with every weight: each an entry of its own, Bold the 700 face of the plain entry. */
const BARLOW: FontFile[] = [
  file('Barlow Thin'),
  file('Barlow ExtraLight'),
  file('Barlow Light'),
  file('Barlow'),
  file('Barlow', '700'),
  file('Barlow Medium'),
  file('Barlow SemiBold'),
  file('Barlow ExtraBold'),
  file('Barlow Black'),
];

describe('resolveBoldFont', () => {
  it.each([
    ['Barlow Thin', 'Barlow', 'normal'],
    ['Barlow ExtraLight', 'Barlow Medium', 'normal'],
    ['Barlow Light', 'Barlow SemiBold', 'normal'],
    ['Barlow', 'Barlow', 'bold'],
    ['Barlow Medium', 'Barlow ExtraBold', 'normal'],
    ['Barlow SemiBold', 'Barlow Black', 'normal'],
    ['Barlow ExtraBold', 'Barlow Black', 'normal'],
  ])('draws bold %s as %s (%s)', (family, fontFamily, fontWeight) => {
    expect(resolveBoldFont(family, 'normal', BARLOW)).toEqual({ fontFamily, fontWeight });
  });

  it('leaves the heaviest weight to the browser', () => {
    expect(resolveBoldFont('Barlow Black', 'normal', BARLOW)).toBeNull();
  });

  it('leaves a font with one weight, and a font that is not registered, to the browser', () => {
    expect(resolveBoldFont('Lobster', 'normal', [file('Lobster'), ...BARLOW])).toBeNull();
    expect(resolveBoldFont('Arial', 'normal', BARLOW)).toBeNull();
  });

  it('takes the nearest heavier weight when the one 300 above is missing', () => {
    const fonts = [file('Foo Light'), file('Foo'), file('Foo Black')];
    // 600 is wanted: 400 is nearer to it than 900.
    expect(resolveBoldFont('Foo Light', 'normal', fonts)).toEqual({ fontFamily: 'Foo', fontWeight: 'normal' });
    // 700 is wanted and only 900 is heavier.
    expect(resolveBoldFont('Foo', 'normal', fonts)).toEqual({ fontFamily: 'Foo Black', fontWeight: 'normal' });
  });

  it('takes the heavier of two weights that are equally near', () => {
    const fonts = [file('Foo'), file('Foo Medium'), file('Foo Black')];
    expect(resolveBoldFont('Foo', 'normal', fonts)).toEqual({ fontFamily: 'Foo Black', fontWeight: 'normal' });
  });

  it('never takes a lighter weight or the same one', () => {
    expect(resolveBoldFont('Foo Black', 'normal', [file('Foo Light'), file('Foo'), file('Foo Black')])).toBeNull();
  });

  it('matches the weights of a typeface without regard to case', () => {
    const fonts = [file('foo light'), file('Foo SemiBold')];
    expect(resolveBoldFont('foo light', 'normal', fonts)).toEqual({
      fontFamily: 'Foo SemiBold',
      fontWeight: 'normal',
    });
  });

  it('does not count the bold face of a weight entry as a weight of the typeface', () => {
    const fonts = [file('Foo Light'), file('Foo Light', '700')];
    expect(resolveBoldFont('Foo Light', 'normal', fonts)).toBeNull();
  });

  it('keeps real italic: only weights with an italic file are taken for italic text that has one', () => {
    const fonts = [
      file('Foo Light'),
      file('Foo Light', '400', 'italic'),
      file('Foo SemiBold'),
      file('Foo Black'),
      file('Foo Black', '400', 'italic'),
    ];
    expect(resolveBoldFont('Foo Light', 'italic', fonts)).toEqual({ fontFamily: 'Foo Black', fontWeight: 'normal' });
    expect(resolveBoldFont('Foo Light', 'normal', fonts)).toEqual({
      fontFamily: 'Foo SemiBold',
      fontWeight: 'normal',
    });
    // No heavier weight has an italic file: the bold is faked on the real italic.
    expect(resolveBoldFont('Foo Light', 'italic', fonts.slice(0, 3))).toBeNull();
  });

  it('takes any heavier weight for italic text whose own italic is faked anyway', () => {
    const fonts = [file('Foo Light'), file('Foo SemiBold')];
    expect(resolveBoldFont('Foo Light', 'italic', fonts)).toEqual({
      fontFamily: 'Foo SemiBold',
      fontWeight: 'normal',
    });
  });

  it('does not depend on the order of the fonts', () => {
    for (const family of ['Barlow Thin', 'Barlow Light', 'Barlow', 'Barlow SemiBold']) {
      expect(resolveBoldFont(family, 'normal', [...BARLOW].reverse())).toEqual(
        resolveBoldFont(family, 'normal', BARLOW),
      );
    }
  });
});

describe('drawnFontOf', () => {
  const light = { fontFamily: 'Barlow Light', fontWeight: 'bold', fontStyle: 'normal' } as const;

  it('leaves text that is not bold as it is', () => {
    const item = { ...light, fontWeight: 'normal' } as const;
    expect(drawnFontOf(item, BARLOW)).toBe(item);
  });

  it('draws bold text in the heavier weight, in its regular weight', () => {
    expect(drawnFontOf(light, BARLOW)).toEqual({
      fontFamily: 'Barlow SemiBold',
      fontWeight: 'normal',
      fontStyle: 'normal',
    });
  });

  it('leaves bold text as it is where its bold is its own bold file, or the browser fakes it', () => {
    const regular = { ...light, fontFamily: 'Barlow' };
    const black = { ...light, fontFamily: 'Barlow Black' };
    expect(drawnFontOf(regular, BARLOW)).toBe(regular);
    expect(drawnFontOf(black, BARLOW)).toBe(black);
  });

  it('draws what it returns the same again', () => {
    for (const { family } of BARLOW) {
      const drawn = drawnFontOf({ ...light, fontFamily: family }, BARLOW);
      expect(drawnFontOf(drawn, BARLOW)).toEqual(drawn);
    }
  });
});

describe('usesBold', () => {
  it('is true for bold text and for text with a bold run', () => {
    expect(usesBold({ fontWeight: 'bold', text: 'a' })).toBe(true);
    expect(usesBold({ fontWeight: 'normal', text: 'a <b>b</b>' })).toBe(true);
    expect(usesBold({ fontWeight: 'normal', text: 'a <i>b</i>' })).toBe(false);
    expect(usesBold({ fontWeight: 'normal', text: 'a < b' })).toBe(false);
    expect(usesBold({ fontWeight: 'normal', text: '<noparse><b>b</b></noparse>' })).toBe(false);
  });
});

describe('drawnFontFamiliesOf', () => {
  it('is the family text is set in, and the heavier weight its bold is drawn in', () => {
    const text = { fontFamily: 'Barlow Light', fontWeight: 'normal', text: 'a' } as const;
    expect(drawnFontFamiliesOf(text, BARLOW)).toEqual(['Barlow Light']);
    expect(drawnFontFamiliesOf({ ...text, fontWeight: 'bold' }, BARLOW)).toEqual(['Barlow Light', 'Barlow SemiBold']);
    expect(drawnFontFamiliesOf({ ...text, text: 'a <b>b</b>' }, BARLOW)).toEqual(['Barlow Light', 'Barlow SemiBold']);
    expect(drawnFontFamiliesOf({ ...text, fontFamily: 'Barlow', fontWeight: 'bold' }, BARLOW)).toEqual(['Barlow']);
  });
});

describe('fontFamilyUseOf', () => {
  it('keeps the families text is set in and the heavier weights of bold text', () => {
    const isUsed = fontFamilyUseOf([
      { fontFamily: 'Barlow Light', fontWeight: 'bold', text: 'a' },
      { fontFamily: 'Lobster', fontWeight: 'normal', text: 'a' },
      { fontFamily: 'Foo Light', fontWeight: 'normal', text: 'a' },
    ]);
    expect(isUsed('Barlow Light')).toBe(true);
    expect(isUsed('Barlow SemiBold')).toBe(true);
    expect(isUsed('Barlow Thin')).toBe(false);
    expect(isUsed('Lobster')).toBe(true);
    // Not bold: nothing but the family itself.
    expect(isUsed('Foo SemiBold')).toBe(false);
    expect(isUsed('Arial')).toBe(false);
  });
});

describe('fontFamilyGroupKey', () => {
  it('is the same for every weight of a typeface', () => {
    expect(fontFamilyGroupKey('Barlow Extra Light')).toBe('barlow');
    expect(fontFamilyGroupKey('Barlow')).toBe('barlow');
    expect(fontFamilyGroupKey('Barlow Condensed')).toBe('barlow condensed');
  });
});
