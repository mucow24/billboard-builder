// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import opentype from 'opentype.js';
import { describe, expect, it } from 'vitest';

import { parseOutlineFont } from '../io/svg/glyphOutline';
import { FIRST_KEYCAP_CODE_POINT, KEYCAP_BASES } from './emojiFallback';

/**
 * The bundled Noto Emoji is patched (scripts/patch-noto-emoji-keycaps.py) so
 * that the private-use characters `drawnText` turns keycaps into map to its
 * keycap glyphs. This checks the file against the numbering in the code, so
 * that a font updated without the patch, or a change to either numbering,
 * fails here rather than on the canvas.
 */

const bytes = (() => {
  const buf = readFileSync(resolve('src/assets/fonts/NotoEmoji-Regular.ttf'));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
})();
const font = opentype.parse(bytes);
const outline = parseOutlineFont(bytes);

describe('the bundled Noto Emoji', () => {
  it('maps each keycap character to the glyph its keycap ligature makes', () => {
    expect(outline?.substitutions).toBeDefined();

    [...KEYCAP_BASES].forEach((base, index) => {
      const ligature = outline!.substitutions!(`${base}${String.fromCodePoint(0x20e3)}`);
      // The base becomes the keycap glyph; the mark becomes nothing.
      expect(ligature?.[1], base).toEqual([]);
      const keycapGlyph = ligature?.[0]?.[0]?.glyph;
      expect(keycapGlyph, base).toBeGreaterThan(0);

      const privateCharacter = String.fromCodePoint(FIRST_KEYCAP_CODE_POINT + index);
      expect(font.charToGlyphIndex(privateCharacter), base).toBe(keycapGlyph);
    });
  });

  it('has nothing else in the private-use characters around them', () => {
    expect(font.hasChar(String.fromCodePoint(FIRST_KEYCAP_CODE_POINT - 1))).toBe(false);
    expect(font.hasChar(String.fromCodePoint(FIRST_KEYCAP_CODE_POINT + KEYCAP_BASES.length))).toBe(false);
  });
});
