import { describe, expect, it } from 'vitest';

import {
  EMOJI_FALLBACK_FAMILY,
  EMOJI_FALLBACK_UNICODE_RANGE,
  FIRST_KEYCAP_CODE_POINT,
  KEYCAP_BASES,
  drawnText,
  getTextFontRegistrationCount,
  hasEmojiCharacter,
  isInEmojiFallbackRange,
  textFontFamilies,
} from './emojiFallback';
import { announceFontRegistration } from './fontRegistrations';

const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const GRINNING_FACE = chars(0x1f600);
const RED_HEART = chars(0x2764, 0xfe0f);
const KEYCAP_ONE = chars(0x31, 0xfe0f, 0x20e3);
const RAINBOW_FLAG = chars(0x1f3f3, 0xfe0f, 0x200d, 0x1f308);

describe('emojiFallback', () => {
  it('draws text in its own family, then in Noto Emoji', () => {
    expect(EMOJI_FALLBACK_FAMILY).toBe('Noto Emoji');
    expect(textFontFamilies('Barlow')).toEqual(['Barlow', 'Noto Emoji']);
  });

  it('does not name Noto Emoji twice for text set in it, whatever its case', () => {
    expect(textFontFamilies('Noto Emoji')).toEqual(['Noto Emoji']);
    expect(textFontFamilies(' noto emoji ')).toEqual([' noto emoji ']);
  });

  it('gives a new registration count when the family or the fallback gets a face, and only then', () => {
    const before = getTextFontRegistrationCount('Emoji Fallback Test Family');

    announceFontRegistration('Some Other Family');
    expect(getTextFontRegistrationCount('Emoji Fallback Test Family')).toBe(before);

    announceFontRegistration('Emoji Fallback Test Family');
    const afterOwn = getTextFontRegistrationCount('Emoji Fallback Test Family');
    expect(afterOwn).not.toBe(before);

    announceFontRegistration(EMOJI_FALLBACK_FAMILY);
    expect(getTextFontRegistrationCount('Emoji Fallback Test Family')).not.toBe(afterOwn);
  });

  it('is used for no ASCII character', () => {
    expect(EMOJI_FALLBACK_UNICODE_RANGE).toBe('U+80-10FFFF');
    for (const ch of [' ', '0', '9', '#', '*', 'A', String.fromCharCode(0x7f)]) {
      expect(isInEmojiFallbackRange(ch), JSON.stringify(ch)).toBe(false);
    }
    for (const ch of [chars(0x80), chars(0xa9), chars(0x2764), chars(0x20e3), chars(0x200d), GRINNING_FACE]) {
      expect(isInEmojiFallbackRange(ch), JSON.stringify(ch)).toBe(true);
    }
  });

  it('tells text with emoji from text without', () => {
    expect(hasEmojiCharacter(`Sale ${GRINNING_FACE}`)).toBe(true);
    expect(hasEmojiCharacter(RED_HEART)).toBe(true);
    expect(hasEmojiCharacter(KEYCAP_ONE)).toBe(true);
    expect(hasEmojiCharacter(chars(0x1f1fa, 0x1f1f8))).toBe(true);
    expect(hasEmojiCharacter(chars(0x1f44d, 0x1f3fd))).toBe(true);

    // Symbols that text fonts have, and that are emoji only when asked for.
    expect(hasEmojiCharacter('Open 24/7 #1 * 50% off')).toBe(false);
    expect(hasEmojiCharacter(`${chars(0xa9)} 2026 Brand${chars(0x2122)} ${chars(0x2764)}`)).toBe(false);
  });

  it('leaves the emoji presentation selector out of the text it draws', () => {
    expect(drawnText(`I ${RED_HEART} NY`)).toBe(`I ${chars(0x2764)} NY`);
    expect(drawnText(RAINBOW_FLAG)).toBe(chars(0x1f3f3, 0x200d, 0x1f308));
  });

  it('draws each keycap as one private-use character, typed with the selector or without', () => {
    expect(KEYCAP_BASES).toBe('0123456789#*');
    expect(FIRST_KEYCAP_CODE_POINT).toBe(0x100000);

    expect(drawnText(KEYCAP_ONE)).toBe(chars(0x100001));
    expect(drawnText(chars(0x31, 0x20e3))).toBe(chars(0x100001));
    const allKeycaps = [...KEYCAP_BASES].map((base) => `${base}${chars(0xfe0f, 0x20e3)}`).join('');
    expect(drawnText(allKeycaps)).toBe(chars(...[...KEYCAP_BASES].map((_, index) => 0x100000 + index)));
    expect(drawnText(`Call ${KEYCAP_ONE} or 555-0100`)).toBe(`Call ${chars(0x100001)} or 555-0100`);
  });

  it('leaves the keycap mark alone after anything but a digit, "#" or "*"', () => {
    const mark = chars(0x20e3);
    expect(drawnText(`A${mark}`)).toBe(`A${mark}`);
    expect(drawnText(`${mark}1`)).toBe(`${mark}1`);
    expect(drawnText(`1${mark}${mark}`)).toBe(`${chars(0x100001)}${mark}`);
  });

  it('keeps every other character, the text presentation selector and joiners included', () => {
    const text = `Plain text ${GRINNING_FACE} ${chars(0x2764, 0xfe0e)} ${chars(0x1f468, 0x200d, 0x1f469)}\nline 2`;
    expect(drawnText(text)).toBe(text);
  });
});
