import * as opentype from 'opentype.js';

import type { OutlineFont } from './svgExportTypes';

/**
 * Parse font bytes into an {@link OutlineFont} via opentype.js. The font is used
 * purely as a SHAPE source — `glyphPath` returns a glyph contour placed at the
 * caller's pen position; advances/kerning come from canvas measurement upstream.
 *
 * Returns null when the bytes cannot be parsed (corrupt, unsupported, or e.g. a
 * woff2 face opentype.js cannot decompress), so the caller can fall back to the
 * block+warn path instead of throwing.
 */
export function parseOutlineFont(bytes: ArrayBuffer): OutlineFont | null {
  let font: opentype.Font;
  try {
    font = opentype.parse(bytes);
  } catch {
    return null;
  }

  return {
    unitsPerEm: font.unitsPerEm,
    glyphPath(ch, fontSizePx, penX, baselineY) {
      const glyph = font.charToGlyph(ch);
      if (!glyph) return null;
      // opentype places glyphs by baseline origin (x, y) = (penX, baselineY).
      const d = glyph.getPath(penX, baselineY, fontSizePx).toPathData(2);
      return d.length > 0 ? d : null;
    },
  };
}
