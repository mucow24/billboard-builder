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
 * fonts. Noto Emoji has emoji, the characters emoji sequences are made of
 * (joiners, variation selectors, skin tones, regional indicators, the keycap
 * mark, tags) and, as the bases of keycaps, the digits, "#", "*" and the space.
 * A font that lacks any of those therefore gets them from Noto Emoji as well.
 * Every other character a font lacks falls back as before.
 */
export const EMOJI_FALLBACK_FAMILY = 'Noto Emoji';

/** The browser matches family names without regard to case. */
function isEmojiFallbackFamily(family: string): boolean {
  return family.trim().toLowerCase() === EMOJI_FALLBACK_FAMILY.toLowerCase();
}

/**
 * The families text set in `family` is drawn with, in the order the browser
 * tries them for each character: its own, then the emoji fallback.
 */
export function textFontFamilies(family: string): string[] {
  return isEmojiFallbackFamily(family) ? [family] : [family, EMOJI_FALLBACK_FAMILY];
}

/**
 * How many faces have been registered for the families text set in `family` is
 * drawn with (see `getFontRegistrationCount`). It changes whenever what the
 * browser draws such text with may have changed: when a file of its own family
 * arrives, and when the emoji fallback does.
 */
export function getTextFontRegistrationCount(family: string): number {
  return textFontFamilies(family).reduce((count, member) => count + getFontRegistrationCount(member), 0);
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
 * the red heart (U+2764 U+FE0F), the check mark, the keycaps (1 U+FE0F U+20E3)
 * and sequences such as the rainbow flag (U+1F3F3 U+FE0F U+200D U+1F308).
 * Without it the browser looks for them in the text's own font and then in the
 * fallback, as it does for any other character. The selector draws nothing
 * itself, and Noto Emoji joins the sequences it is part of just the same
 * without it (measured in Chromium 156).
 */
export function drawnText(text: string): string {
  return text.includes(EMOJI_PRESENTATION_SELECTOR) ? text.split(EMOJI_PRESENTATION_SELECTOR).join('') : text;
}
