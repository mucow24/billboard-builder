import { getFontRegistrationCount } from './fontRegistrations';

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
 * character, come from the same file under a family of their own
 * (`EMOJI_KEYCAP_FAMILY`).
 */
export const EMOJI_FALLBACK_FAMILY = 'Noto Emoji';

/** Whether `family` names the emoji fallback. The browser matches family names without regard to case. */
export function isEmojiFallbackFamily(family: string): boolean {
  return family.trim().toLowerCase() === EMOJI_FALLBACK_FAMILY.toLowerCase();
}

/**
 * The characters the emoji fallback's faces are used for, as a CSS
 * `unicode-range`: none in ASCII (below U+80).
 *
 * Noto Emoji has the space, the digits, "#" and "*", as the bases of keycaps,
 * and draws them as wide as an emoji (an advance of 1.27 em). Without the range
 * they would take the place of those of a font that lacks them (several bundled
 * fonts have no digits), and of every space and digit of text whose font is
 * missing. Noto Emoji would also become the first available font of such text,
 * the one whose metrics set its line height, which the browser takes to be the
 * first font that is used for the space.
 *
 * That leaves out the bases of keycaps (a digit, "#" or "*" with U+20E3 after
 * it), which `EMOJI_KEYCAP_FAMILY` is for.
 *
 * SVG export routes characters to the fallback by the same ranges
 * (`emojiFallbackRangeOf`), so the two must change together.
 */
export const EMOJI_FALLBACK_UNICODE_RANGE = 'U+80-10FFFF';

/** The first code point of `EMOJI_FALLBACK_UNICODE_RANGE`. */
const FIRST_EMOJI_FALLBACK_CODE_POINT = 0x80;

/** Whether the emoji fallback is used for `ch` (one character) at all: see `EMOJI_FALLBACK_UNICODE_RANGE`. */
export function isInEmojiFallbackRange(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) >= FIRST_EMOJI_FALLBACK_CODE_POINT;
}

/**
 * A second family for the emoji fallback's files, used for keycaps alone: a
 * digit, "#" or "*" followed by U+20E3 (the combining enclosing keycap). Its
 * faces cover just those characters (`EMOJI_KEYCAP_UNICODE_RANGE`), so Noto
 * Emoji can draw a keycap whole although `EMOJI_FALLBACK_UNICODE_RANGE` keeps
 * the keycap's base out of the fallback's own faces. The browser picks one font
 * for the base and its mark together, and this is the one that has both.
 *
 * Text names this family only when it has a keycap (`textFontFamilies`). A
 * unicode-range cannot tell a keycap's digit from any other, so in such a text,
 * every digit, "#" and "*" its own font lacks comes from Noto Emoji too, as wide
 * as an emoji, and so do those of such a text in a missing font. Text without a
 * keycap is not affected.
 *
 * The loader adds a face of this family beside every face of the fallback's
 * family, without recording it as a font file, so the picker never lists it.
 */
export const EMOJI_KEYCAP_FAMILY = 'Noto Emoji Keycaps';

/** The characters of keycaps, as the CSS `unicode-range` of the `EMOJI_KEYCAP_FAMILY` faces. */
export const EMOJI_KEYCAP_UNICODE_RANGE = 'U+23, U+2A, U+30-39, U+20E3';

/** U+20E3 COMBINING ENCLOSING KEYCAP, the mark that makes the character before it a keycap. */
const KEYCAP_MARK = 0x20e3;

/** Whether `ch` (one character) is in `EMOJI_KEYCAP_UNICODE_RANGE`. */
function isKeycapCharacter(ch: string): boolean {
  const codePoint = ch.codePointAt(0) ?? 0;
  return (
    codePoint === 0x23 ||
    codePoint === 0x2a ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    codePoint === KEYCAP_MARK
  );
}

/** Whether `text` has a keycap, and so names `EMOJI_KEYCAP_FAMILY` (see there). */
export function hasKeycap(text: string): boolean {
  return text.includes(String.fromCodePoint(KEYCAP_MARK));
}

/**
 * Which characters of `text` the emoji fallback may draw, as the canvas has
 * it: those in `EMOJI_FALLBACK_UNICODE_RANGE`, and in a text with a keycap
 * those in `EMOJI_KEYCAP_UNICODE_RANGE` too. SVG export routes characters by
 * this.
 */
export function emojiFallbackRangeOf(text: string): (ch: string) => boolean {
  const keycaps = hasKeycap(text);
  return (ch) => isInEmojiFallbackRange(ch) || (keycaps && isKeycapCharacter(ch));
}

/**
 * The families `text` set in `family` is drawn with, in the order the browser
 * tries them for each character: its own, then the emoji fallback, then, when
 * the text has a keycap, the keycap family (see `EMOJI_KEYCAP_FAMILY`).
 */
export function textFontFamilies(family: string, text: string): string[] {
  const families = isEmojiFallbackFamily(family) ? [family] : [family, EMOJI_FALLBACK_FAMILY];
  return hasKeycap(text) ? [...families, EMOJI_KEYCAP_FAMILY] : families;
}

/**
 * How many faces have been registered for the families text set in `family` is
 * drawn with (see `getFontRegistrationCount`). It changes whenever what the
 * browser draws such text with may have changed: when a file of its own family
 * arrives, and when the emoji fallback does. (Keycap faces join the browser's
 * font set together with the fallback's own, so its announcements cover them.)
 */
export function getTextFontRegistrationCount(family: string): number {
  return textFontFamilies(family, '').reduce((count, member) => count + getFontRegistrationCount(member), 0);
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

/**
 * `text` as the canvas is given it: without emoji presentation selectors
 * (U+FE0F). Everything that lays out, measures or draws a text item's text goes
 * through this, so that all of them see the same characters.
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
 * Keycaps (1 U+FE0F U+20E3) lose it too, and come from Noto Emoji through
 * `EMOJI_KEYCAP_FAMILY`.
 */
export function drawnText(text: string): string {
  return text.includes(EMOJI_PRESENTATION_SELECTOR) ? text.split(EMOJI_PRESENTATION_SELECTOR).join('') : text;
}
