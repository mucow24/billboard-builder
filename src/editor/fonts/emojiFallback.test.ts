import { describe, expect, it } from 'vitest';

import {
  EMOJI_FALLBACK_FAMILY,
  EMOJI_FALLBACK_UNICODE_RANGE,
  EMOJI_KEYCAP_FAMILY,
  EMOJI_KEYCAP_UNICODE_RANGE,
  drawnText,
  emojiFallbackRangeOf,
  getTextFontRegistrationCount,
  hasEmojiCharacter,
  hasKeycap,
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
    expect(textFontFamilies('Barlow', `Sale 50 ${GRINNING_FACE}`)).toEqual(['Barlow', 'Noto Emoji']);
  });

  it('does not name Noto Emoji twice for text set in it, whatever its case', () => {
    expect(textFontFamilies('Noto Emoji', GRINNING_FACE)).toEqual(['Noto Emoji']);
    expect(textFontFamilies(' noto emoji ', GRINNING_FACE)).toEqual([' noto emoji ']);
  });

  it('names the keycap family last, and only for text with a keycap', () => {
    expect(EMOJI_KEYCAP_FAMILY).toBe('Noto Emoji Keycaps');
    expect(textFontFamilies('Barlow', `Call ${KEYCAP_ONE}`)).toEqual(['Barlow', 'Noto Emoji', 'Noto Emoji Keycaps']);
    // Typed without the presentation selector, or as drawn.
    expect(textFontFamilies('Barlow', drawnText(KEYCAP_ONE))).toEqual(['Barlow', 'Noto Emoji', 'Noto Emoji Keycaps']);
    expect(textFontFamilies('Noto Emoji', KEYCAP_ONE)).toEqual(['Noto Emoji', 'Noto Emoji Keycaps']);
    expect(hasKeycap('Call 1 #* now')).toBe(false);
  });

  it('lets the fallback draw the characters of keycaps only in text with a keycap', () => {
    const plain = emojiFallbackRangeOf('Sale 50');
    const withKeycap = emojiFallbackRangeOf(`Sale 50 ${KEYCAP_ONE}`);

    for (const ch of ['0', '5', '9', '#', '*']) {
      expect(plain(ch), JSON.stringify(ch)).toBe(false);
      expect(withKeycap(ch), JSON.stringify(ch)).toBe(true);
    }
    for (const ch of [' ', 'A', '/', ':', '+']) {
      expect(withKeycap(ch), JSON.stringify(ch)).toBe(false);
    }
    for (const ch of [chars(0x20e3), GRINNING_FACE]) {
      expect(plain(ch), JSON.stringify(ch)).toBe(true);
      expect(withKeycap(ch), JSON.stringify(ch)).toBe(true);
    }
  });

  it('routes ASCII in a text with a keycap exactly as the keycap faces\' unicode-range has it', () => {
    // Every code point the CSS range names, from its "U+X" and "U+X-Y" parts.
    const inCssRange = new Set<number>();
    for (const part of EMOJI_KEYCAP_UNICODE_RANGE.split(',')) {
      const [first, last = first] = part.trim().replace(/^U\+/, '').split('-').map((hex) => parseInt(hex, 16));
      for (let codePoint = first; codePoint <= last; codePoint += 1) inCssRange.add(codePoint);
    }
    expect(inCssRange.has(0x20e3)).toBe(true);

    const withKeycap = emojiFallbackRangeOf(KEYCAP_ONE);
    for (let codePoint = 0; codePoint < 0x80; codePoint += 1) {
      expect(withKeycap(chars(codePoint)), `U+${codePoint.toString(16)}`).toBe(inCssRange.has(codePoint));
    }
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
    expect(drawnText(KEYCAP_ONE)).toBe(chars(0x31, 0x20e3));
    expect(drawnText(RAINBOW_FLAG)).toBe(chars(0x1f3f3, 0x200d, 0x1f308));
  });

  it('keeps every other character, the text presentation selector and joiners included', () => {
    const text = `Plain text ${GRINNING_FACE} ${chars(0x2764, 0xfe0e)} ${chars(0x1f468, 0x200d, 0x1f469)}\nline 2`;
    expect(drawnText(text)).toBe(text);
  });
});
