// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as opentype from 'opentype.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseOutlineFont } from './glyphOutline';

function loadBytes(file: string): ArrayBuffer {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const ALBERTUS = 'Albertus MT Std Regular.otf';
/** U+FB01, the fi ligature as a character of its own: Albertus maps it to its f_i glyph. */
const FI_CHARACTER = String.fromCodePoint(0xfb01);

describe('parseOutlineFont: substituted glyphs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the fi ligature of a line, with its advance, and null for untouched characters', () => {
    const font = parseOutlineFont(loadBytes(ALBERTUS))!;
    const reference = opentype.parse(loadBytes(ALBERTUS));
    const ligature = reference.charToGlyph(FI_CHARACTER);

    const shaped = font.substitutions!('office');
    expect(shaped).toHaveLength(6);
    // o f fi(-) c e: only the second f and the i are touched
    expect(shaped!.map((entry) => entry?.length ?? null)).toEqual([null, null, 1, 0, null, null]);
    expect(shaped![2]![0].glyph).toBe(ligature.index);
    expect(shaped![2]![0].advance).toBeCloseTo(ligature.advanceWidth! / reference.unitsPerEm, 6);
  });

  it('returns null for text without a substitution', () => {
    const font = parseOutlineFont(loadBytes(ALBERTUS))!;
    expect(font.substitutions!('Hamburg')).toBeNull();
    expect(font.substitutions!('f')).toBeNull();
    expect(font.substitutions!('i')).toBeNull();
  });

  it('returns null for every text in a font without substitution rules', () => {
    const font = parseOutlineFont(loadBytes('Futura Light Condensed.otf'))!;
    expect(font.substitutions!('office fluff')).toBeNull();
  });

  it('outlines a substituted glyph by its index, a different shape from the letters it replaces', () => {
    const font = parseOutlineFont(loadBytes(ALBERTUS))!;
    const ligature = font.substitutions!('fi')![0]![0].glyph;

    const outline = font.glyphPath(ligature, 100, 12, 80);
    expect(outline).toBeTruthy();
    expect(outline).not.toBe(font.glyphPath('f', 100, 12, 80));
    // Albertus also maps the character U+FB01 to this glyph: the same outline either way.
    expect(outline).toBe(font.glyphPath(FI_CHARACTER, 100, 12, 80));
  });

  it('returns null for a glyph index the font does not have', () => {
    const font = parseOutlineFont(loadBytes(ALBERTUS))!;
    expect(font.glyphPath(60000, 100, 0, 80)).toBeNull();
  });

  it('still outlines a character as before', () => {
    const font = parseOutlineFont(loadBytes(ALBERTUS))!;
    const reference = opentype.parse(loadBytes(ALBERTUS));
    expect(font.glyphPath('f', 100, 12, 80)).toBe(font.glyphPath(reference.charToGlyphIndex('f'), 100, 12, 80));
  });

  it('uses the rules the font has for the language of the browser', () => {
    // Barlow keeps f and i apart in Turkish; the canvas takes the language from the browser.
    vi.stubGlobal('navigator', { language: 'tr-TR' });
    const turkish = parseOutlineFont(loadBytes('Barlow-Regular.ttf'))!;
    const shaped = turkish.substitutions!('fi');
    // The i becomes the Turkish i (one glyph for one character); no ligature.
    expect(shaped!.map((entry) => entry?.length ?? null)).toEqual([null, 1]);

    vi.stubGlobal('navigator', { language: 'en-US' });
    const english = parseOutlineFont(loadBytes('Barlow-Regular.ttf'))!;
    expect(english.substitutions!('fi')!.map((entry) => entry?.length ?? null)).toEqual([1, 0]);
  });
});
