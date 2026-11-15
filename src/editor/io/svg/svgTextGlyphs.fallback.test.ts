// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { drawnText } from '../../fonts/emojiFallback';
import { parseOutlineFont } from './glyphOutline';
import type { OutlineFont } from './svgExportTypes';
import { hasGlyphsFor, lineGlyphs } from './svgTextGlyphs';

function loadFont(file: string): OutlineFont {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  const font = parseOutlineFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (!font) throw new Error(`could not parse ${file}`);
  return font;
}

const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const barlow = loadFont('Barlow-Regular.ttf');
const notoEmoji = loadFont('NotoEmoji-Regular.ttf');

/**
 * What `lineGlyphs` draws for `text` (as the canvas is given it), grapheme by
 * grapheme: which font, and how many glyphs.
 */
function drawnPerGrapheme(text: string, letterSpacing = 0) {
  const line = drawnText(text);
  const glyphs = lineGlyphs(barlow, notoEmoji, line, letterSpacing);
  const result: string[] = [];
  let index = 0;
  for (const { segment } of new Intl.Segmenter().segment(line)) {
    const entries = glyphs.slice(index, index + [...segment].length);
    index += [...segment].length;
    const from = entries.every((entry) => entry.fallback) ? 'emoji' : entries.some((entry) => entry.fallback) ? 'mixed' : 'own';
    const count = entries.reduce(
      (total, entry) => total + (typeof entry.drawn === 'string' ? 1 : entry.drawn.length),
      0,
    );
    result.push(`${from}:${count}`);
  }
  return result;
}

describe('lineGlyphs with Barlow and Noto Emoji', () => {
  it('has the bundled Noto Emoji draw the emoji Barlow lacks', () => {
    expect(hasGlyphsFor(barlow, chars(0x1f600))).toBe(false);
    expect(hasGlyphsFor(notoEmoji, chars(0x1f600))).toBe(true);
    // Joiners and selectors are never drawn, so no font needs them.
    expect(hasGlyphsFor(barlow, chars(0x200d, 0xfe0f))).toBe(true);
  });

  it('keeps letters in Barlow and draws each emoji, sequences included, as one Noto Emoji glyph', () => {
    const family = chars(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    const flag = chars(0x1f1fa, 0x1f1f8);
    const thumbsUpMediumSkin = chars(0x1f44d, 0x1f3fd);
    const heartOnFire = chars(0x2764, 0xfe0f, 0x200d, 0x1f525);

    expect(drawnPerGrapheme(`Hi ${family} ${flag}${thumbsUpMediumSkin} ${heartOnFire}`)).toEqual([
      'own:1',
      'own:1',
      'own:1',
      'emoji:1',
      'own:1',
      'emoji:1',
      'emoji:1',
      'own:1',
      'emoji:1',
    ]);
  });

  it('draws a keycap from Noto Emoji although Barlow has its digit', () => {
    expect(drawnPerGrapheme(`1${chars(0xfe0f, 0x20e3)} 1`)).toEqual(['emoji:1', 'own:1', 'own:1']);
  });

  it('joins the same sequences when the text is letter spaced, one grapheme at a time', () => {
    const family = chars(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    expect(drawnPerGrapheme(`A${family}${chars(0x1f600)}`, 5)).toEqual(['own:1', 'emoji:1', 'emoji:1']);
  });
});
