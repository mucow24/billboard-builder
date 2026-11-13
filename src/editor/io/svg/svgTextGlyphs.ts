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
