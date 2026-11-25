import { getFontRegistrationCount, getTypefaceRegistrationCount } from './fontRegistrations';

/**
 * Emoji that a text's own font does not have are drawn from the bundled Noto
 * Emoji, a black-and-white emoji font, rather than from whatever the system
 * would pick (a colour emoji font on most systems). Its glyphs are outlines like
 * any letter's, so they take the text's fill, gradient, shadow and outline, and
 * SVG export can draw them too.
 *
 * Text names this family after its own, so the browser looks here for every
 * character its own font has no glyph for, before it turns to the system's
 * fonts. Noto Emoji has emoji and the characters emoji sequences are made of
 * (joiners, variation selectors, skin tones, regional indicators, tags). It is
 * used for no character below U+80 (see `EMOJI_FALLBACK_UNICODE_RANGE`), so
 * every ASCII character a font lacks falls back as before, as does every other
 * character Noto Emoji does not have. Keycaps, which start with an ASCII
 * character, reach it as private-use characters (see `KEYCAP_BASES`).
 *
 * Known limit, Firefox: it still draws an emoji followed by a skin tone (such
 * as U+1F44D U+1F3FD) from the system's colour emoji font, at a different
 * width, although the text names Noto Emoji and Noto Emoji has the sequence
 * (Firefox 146; Chromium 145 and WebKit 26 draw it from Noto Emoji). There,
 * such emoji stay in colour on the canvas, and SVG export, which outlines Noto
 * Emoji's glyph, does not match them.
 */
export const EMOJI_FALLBACK_FAMILY = 'Noto Emoji';

/** Whether `family` names the emoji fallback. The browser matches family names without regard to case. */
export function isEmojiFallbackFamily(family: string): boolean {
  return family.trim().toLowerCase() === EMOJI_FALLBACK_FAMILY.toLowerCase();
}

/**
 * The first character the emoji fallback's faces are used for, so that they
 * are used for none in ASCII (below U+80). Their CSS `unicode-range` is
 * `EMOJI_FALLBACK_UNICODE_RANGE`, made from this.
 *
 * Noto Emoji has the space, the digits, "#" and "*", as the bases of keycaps,
 * and draws them as wide as an emoji (an advance of 1.27 em). Without the range
 * they would take the place of those of a font that lacks them (several bundled
 * fonts have no digits), and of every space and digit of text whose font is
 * missing. Noto Emoji would also become the first available font of such text,
 * the one whose metrics set its line height, which the browser takes to be the
 * first font that is used for the space.
 *
 * That leaves out the base of a keycap (a digit, "#" or "*" before U+20E3),
 * so keycaps are drawn as characters of their own: see `KEYCAP_BASES`.
 *
 * SVG export routes characters to the fallback by the same range
 * (`isInEmojiFallbackRange`), so the two must change together.
 */
const FIRST_EMOJI_FALLBACK_CODE_POINT = 0x80;

/** See `FIRST_EMOJI_FALLBACK_CODE_POINT`: everything from there to the last code point. */
export const EMOJI_FALLBACK_UNICODE_RANGE = `U+${FIRST_EMOJI_FALLBACK_CODE_POINT.toString(16).toUpperCase()}-10FFFF`;

/** Whether the emoji fallback is used for `ch` (one character) at all: see `EMOJI_FALLBACK_UNICODE_RANGE`. */
export function isInEmojiFallbackRange(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) >= FIRST_EMOJI_FALLBACK_CODE_POINT;
}

/**
 * The families text set in `family` is drawn with, in the order the browser
 * tries them for each character: its own, then the emoji fallback.
 */
export function textFontFamilies(family: string): string[] {
  return isEmojiFallbackFamily(family) ? [family] : [family, EMOJI_FALLBACK_FAMILY];
}

/**
 * How many faces have been registered for the families text set in `family`
 * may be drawn with. It changes whenever what the browser draws such text with
 * may have changed: when a file of its own family arrives, or of a heavier
 * weight of its typeface, which its bold text is drawn in (see `boldWeight`),
 * and when the emoji fallback does.
 */
export function getTextFontRegistrationCount(family: string): number {
  const fallback = isEmojiFallbackFamily(family) ? 0 : getFontRegistrationCount(EMOJI_FALLBACK_FAMILY);
  return getTypefaceRegistrationCount(family) + fallback;
}

/**
 * Characters that only an emoji font draws: the ones shown as emoji by default
 * (not such symbols as the copyright and trade mark signs, which text fonts
 * have), the regional indicators that flags are made of, skin tones, the keycap
 * mark, and the selector that asks for a character's emoji form. Text with any
 * of them is likely to need the emoji fallback, whatever font it is set in.
 */
const EMOJI_CHARACTER =
  /[\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\u{20E3}\u{FE0F}]/u;

/** Whether `text` has a character that is likely to be drawn from the emoji fallback. */
export function hasEmojiCharacter(text: string): boolean {
  return EMOJI_CHARACTER.test(text);
}

/** U+FE0F VARIATION SELECTOR-16, which asks for a character's emoji (colour) form. */
const EMOJI_PRESENTATION_SELECTOR = String.fromCodePoint(0xfe0f);

/** U+20E3 COMBINING ENCLOSING KEYCAP, which makes the character before it a keycap. */
const KEYCAP_MARK = String.fromCodePoint(0x20e3);

/**
 * The bases of keycaps, in the order of the private-use characters they are
 * drawn as: U+100000 (`FIRST_KEYCAP_CODE_POINT`) for "0" up to U+100009 for
 * "9", then U+10000A for "#" and U+10000B for "*".
 *
 * A keycap is its base, usually U+FE0F, and U+20E3, which Noto Emoji joins into
 * one glyph. The base is ASCII, though, which the emoji fallback is never used
 * for (`EMOJI_FALLBACK_UNICODE_RANGE`), so the fallback could not draw the
 * keycap. `drawnText` therefore swaps each keycap for one private-use
 * character, and the bundled Noto Emoji maps those straight to its keycap
 * glyphs: `scripts/patch-noto-emoji-keycaps.py` added them to its cmap, with
 * this numbering (`emojiKeycapFont.test.ts` checks the two agree).
 *
 * The browser asks the text's own font for them first, so they must be
 * characters fonts leave alone. They are at the start of Supplementary Private
 * Use Area-B, which no bundled font uses. (Area-A is not safe: Nerd Fonts put
 * their Material Design icons from U+F0001 on.) A Noto Emoji that was not
 * patched (one a user uploads in place of the bundled file) has none of them,
 * and keycaps then come out as missing glyphs.
 */
export const KEYCAP_BASES = '0123456789#*';

/** The private-use character the first of `KEYCAP_BASES` is drawn as. */
export const FIRST_KEYCAP_CODE_POINT = 0x100000;

/** `text` with each keycap (a base and U+20E3, no selector) as its private-use character (see `KEYCAP_BASES`). */
function keycapsAsPrivateCharacters(text: string): string {
  const chars = [...text];
  const drawn: string[] = [];
  for (let index = 0; index < chars.length; index += 1) {
    const base = KEYCAP_BASES.indexOf(chars[index]);
    if (base >= 0 && chars[index + 1] === KEYCAP_MARK) {
      drawn.push(String.fromCodePoint(FIRST_KEYCAP_CODE_POINT + base));
      index += 1;
    } else {
      drawn.push(chars[index]);
    }
  }
  return drawn.join('');
}

/**
 * `text` as the canvas is given it: without emoji presentation selectors
 * (U+FE0F), and with each keycap as one private-use character (see
 * `KEYCAP_BASES`). Everything that lays out, measures or draws a text item's
 * text goes through this, so that all of them see the same characters.
 *
 * The selector asks for an emoji in colour, and Chromium honours it by drawing
 * the emoji from a colour emoji font of the system's, passing over every family
 * the text names, the emoji fallback included. Many emoji are typed with one:
 * the red heart (U+2764 U+FE0F), the check mark and sequences such as the
 * rainbow flag (U+1F3F3 U+FE0F U+200D U+1F308). Without it the browser looks
 * for them in the text's own font and then in the fallback, as it does for any
 * other character. The selector draws nothing itself, and Noto Emoji joins the
 * sequences it is part of just the same without it (measured in Chromium 156).
 *
 * Keycaps (1 U+FE0F U+20E3) lose it too, before they become private-use
 * characters, so a keycap typed with or without it comes out the same.
 *
 * Firefox draws an emoji with a skin tone in colour all the same (see
 * `EMOJI_FALLBACK_FAMILY`); nothing here changes that.
 */
export function drawnText(text: string): string {
  const withoutSelectors = text.includes(EMOJI_PRESENTATION_SELECTOR)
    ? text.split(EMOJI_PRESENTATION_SELECTOR).join('')
    : text;
  return withoutSelectors.includes(KEYCAP_MARK) ? keycapsAsPrivateCharacters(withoutSelectors) : withoutSelectors;
}
