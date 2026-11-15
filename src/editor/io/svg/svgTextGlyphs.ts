import type { GlyphPathStyle, OutlineFont, SubstituteGlyph, TextSubstitutions } from './svgExportTypes';

/**
 * Split a text the way Pixi does before it draws character by character
 * (`CanvasTextMetrics.graphemeSegmenter`): into what a reader sees as one
 * character, where the browser can tell, into code points otherwise.
 */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter().segment(text)].map((part) => part.segment);
  }
  return [...text];
}

/**
 * The glyphs a font substitutes in a line, as the canvas draws that line: one
 * entry per character (code point), null where there are none at all.
 *
 * With letter spacing 0, Pixi draws a line with one `fillText`, so the browser
 * shapes it as a whole and neighbouring characters can join (ligatures). With
 * any other letter spacing Pixi draws each character with a `fillText` of its
 * own, so a character only gets what the font does to it standing alone.
 * (`CanvasTextGenerator._drawLetterSpacing`, Pixi 8.)
 */
export function lineSubstitutions(font: OutlineFont, line: string, letterSpacing: number): TextSubstitutions | null {
  if (!font.substitutions) return null;
  if (letterSpacing === 0) return font.substitutions(line);

  const entries: (readonly SubstituteGlyph[] | null)[] = [];
  let any = false;
  for (const piece of graphemes(line)) {
    const substitutions = font.substitutions(piece);
    if (substitutions) {
      any = true;
      entries.push(...substitutions);
    } else {
      for (let count = [...piece].length; count > 0; count -= 1) entries.push(null);
    }
  }
  return any ? entries : null;
}

/** Characters that are never drawn, so a font needs no glyph for them. */
const DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;

/** Whether `font` has a glyph for every character of `text` that is drawn at all. */
export function hasGlyphsFor(font: OutlineFont, text: string): boolean {
  return [...text].every((ch) => DEFAULT_IGNORABLE.test(ch) || (font.hasGlyph?.(ch) ?? true));
}

/**
 * Whether the browser draws `piece` (one grapheme) from the fallback font rather
 * than from `font`: when `font` lacks a glyph for any of its characters and the
 * fallback has them all. The browser chooses a font for a whole grapheme, so a
 * keycap (a digit and U+20E3) comes from the fallback even with a font that has
 * the digit. Where neither has them all, the system draws it; the export cannot,
 * and keeps it in `font`.
 */
function drawnFromFallback(font: OutlineFont, fallback: OutlineFont, piece: string): boolean {
  return !hasGlyphsFor(font, piece) && hasGlyphsFor(fallback, piece);
}

/** What is drawn at one character of a line: see `glyphsPath`. */
export interface DrawnGlyphs {
  /** Drawn from the fallback font rather than the text's own. */
  fallback: boolean;
  drawn: string | readonly SubstituteGlyph[];
}

/**
 * What the canvas draws at each character (code point) of a line, and from
 * which font: the text's own, or `fallback` for the graphemes it has and the
 * text's own font lacks (the emoji fallback, see `fonts/emojiFallback`).
 *
 * The browser shapes the line with the text's own font, then shapes again with
 * the fallback each run of graphemes that came out with a missing glyph. Both
 * apply their substitutions to what they shape (see `lineSubstitutions`), which
 * is how the fallback joins the characters of an emoji sequence into one glyph.
 */
export function lineGlyphs(
  font: OutlineFont,
  fallback: OutlineFont | undefined,
  line: string,
  letterSpacing: number,
): DrawnGlyphs[] {
  const chars = [...line];
  const own = lineSubstitutions(font, line, letterSpacing);
  const glyphs: DrawnGlyphs[] = chars.map((ch, index) => ({ fallback: false, drawn: own?.[index] ?? ch }));
  if (!fallback) return glyphs;

  const pieces = graphemes(line);
  const fromFallback = pieces.map((piece) => drawnFromFallback(font, fallback, piece));
  let charIndex = 0;
  for (let pieceIndex = 0; pieceIndex < pieces.length; ) {
    if (!fromFallback[pieceIndex]) {
      charIndex += [...pieces[pieceIndex]].length;
      pieceIndex += 1;
      continue;
    }
    // A run of graphemes the fallback draws, shaped together.
    let run = '';
    for (; pieceIndex < pieces.length && fromFallback[pieceIndex]; pieceIndex += 1) run += pieces[pieceIndex];
    const substitutions = lineSubstitutions(fallback, run, letterSpacing);
    [...run].forEach((ch, offset) => {
      glyphs[charIndex + offset] = { fallback: true, drawn: substitutions?.[offset] ?? ch };
    });
    charIndex += [...run].length;
  }
  return glyphs;
}

/**
 * SVG path data for what is drawn at one character of a line: the character's own
 * glyph, or the glyphs substituted for it, the first at the pen position and each
 * further one moved on by the advance of the one before. Null when nothing is
 * drawn there. `style` applies to every glyph (see `GlyphPathStyle`).
 */
export function glyphsPath(
  font: OutlineFont,
  drawn: string | readonly SubstituteGlyph[],
  fontSizePx: number,
  penX: number,
  baselineY: number,
  style?: GlyphPathStyle,
): string | null {
  if (typeof drawn === 'string') return font.glyphPath(drawn, fontSizePx, penX, baselineY, style);
  const paths: string[] = [];
  let x = penX;
  for (const { glyph, advance } of drawn) {
    const path = font.glyphPath(glyph, fontSizePx, x, baselineY, style);
    if (path) paths.push(path);
    x += advance * fontSizePx;
  }
  return paths.length > 0 ? paths.join(' ') : null;
}
