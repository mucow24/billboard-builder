// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { drawnText } from '../../fonts/emojiFallback';
import { parseOutlineFont } from './glyphOutline';
import type { OutlineFont } from './svgExportTypes';
import { emojiFallbackOutline, hasGlyphsFor, lineGlyphs } from './svgTextGlyphs';

function loadFont(file: string): OutlineFont {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  const font = parseOutlineFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (!font) throw new Error(`could not parse ${file}`);
  return font;
}

const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const barlow = loadFont('Barlow-Regular.ttf');
// The fallback as the export uses it: for nothing below U+80.
const notoEmoji = emojiFallbackOutline(loadFont('NotoEmoji-Regular.ttf'));

/**
 * What `lineGlyphs` draws for `text` (as the canvas is given it), grapheme by
 * grapheme: which font, and how many glyphs.
 */
function drawnPerGrapheme(text: string, letterSpacing = 0, font = barlow) {
  const line = drawnText(text);
  const glyphs = lineGlyphs(font, notoEmoji, line, letterSpacing);
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
    // Joiners, selectors and line breaks are never drawn, so no font needs them.
    expect(hasGlyphsFor(barlow, chars(0x200d, 0xfe0f))).toBe(true);
    expect(hasGlyphsFor(barlow, 'Two\nlines\r\n\tand a tab')).toBe(true);
  });

  it('has Noto Emoji draw no ASCII, although it has the space, the digits, "#" and "*"', () => {
    const noto = loadFont('NotoEmoji-Regular.ttf');
    expect(hasGlyphsFor(noto, ' 0123456789#*')).toBe(true);
    for (const ch of ' 0123456789#*') expect(hasGlyphsFor(notoEmoji, ch), JSON.stringify(ch)).toBe(false);
    expect(hasGlyphsFor(notoEmoji, chars(0x1f600, 0x20e3))).toBe(true);
  });

  it('leaves the digits, "#" and "*" of a font that lacks them to the system, as the canvas does', () => {
    const dashEarly = loadFont('DASH-Early.ttf');
    expect(hasGlyphsFor(dashEarly, '5')).toBe(false);

    expect(drawnPerGrapheme(`50# ${chars(0x1f600)}`, 0, dashEarly)).toEqual([
      'own:1',
      'own:1',
      'own:1',
      'own:1',
      'emoji:1',
    ]);
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

  it('draws each keycap as one Noto Emoji glyph, and keeps the digits Barlow has', () => {
    const keycaps = ['1', '#', '*'].map((base) => `${base}${chars(0xfe0f, 0x20e3)}`).join('');
    expect(drawnPerGrapheme(`${keycaps} 1#*`)).toEqual([
      'emoji:1',
      'emoji:1',
      'emoji:1',
      'own:1',
      'own:1',
      'own:1',
      'own:1',
    ]);
  });

  it('keeps the digits a font lacks out of Noto Emoji in text with a keycap too', () => {
    const dashEarly = loadFont('DASH-Early.ttf');
    expect(drawnPerGrapheme(`5 1${chars(0xfe0f, 0x20e3)}`, 0, dashEarly)).toEqual(['own:1', 'own:1', 'emoji:1']);
  });

  it('joins the same sequences when the text is letter spaced, one grapheme at a time', () => {
    const family = chars(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    expect(drawnPerGrapheme(`A${family}${chars(0x1f600)}`, 5)).toEqual(['own:1', 'emoji:1', 'emoji:1']);
  });
});
