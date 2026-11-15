import { describe, expect, it } from 'vitest';

import {
  EMOJI_FALLBACK_FAMILY,
  drawnText,
  getTextFontRegistrationCount,
  hasEmojiCharacter,
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
