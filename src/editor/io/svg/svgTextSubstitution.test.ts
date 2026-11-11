import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import type { TextCanvasItem } from '../../document/documentTypes';
import { fakeOutlineFont, makeSvgDeps } from '../../../test/svgExportFakes';
import { documentToSvg } from './documentToSvg';
import type { OutlineFont, SubstituteGlyph, TextSubstitutions } from './svgExportTypes';

// The fake measurer gives every character 10px, so character i of a line starts
// at 10 * i (plus i * letterSpacing). The fake glyphs below are boxes whose width
// tells which glyph was drawn: 10 for a character's own glyph, the glyph index
// for a substituted one.

const FI = 77; // one glyph for f + i
const LONG_S = 9; // drawn for an s, even on its own
const HALF_A = 5; // an x splits into two glyphs
const HALF_B = 6;
const NO_OUTLINE = 99;

/** Text given to `substitutions`, in call order. */
type Calls = string[];

/**
 * A font that joins "fi", gives every "s" another glyph and splits every "x" in
 * two, when it is asked about a text that contains them.
 */
function substitutingFont(calls: Calls = []): OutlineFont {
  return {
    unitsPerEm: 1000,
    glyphPath: (glyph: string | number, _size: number, penX: number, baselineY: number) => {
      if (glyph === ' ' || glyph === NO_OUTLINE) return null;
      const width = typeof glyph === 'number' ? glyph : 10;
      return `M${penX} ${baselineY}h${width}v-10h-${width}Z`;
    },
    substitutions(text): TextSubstitutions | null {
      calls.push(text);
      const chars = [...text];
      const out: (SubstituteGlyph[] | null)[] = chars.map(() => null);
      let any = false;
      chars.forEach((ch, index) => {
        if (ch === 'f' && chars[index + 1] === 'i') {
          out[index] = [{ glyph: FI, advance: 0.5 }];
          out[index + 1] = [];
          any = true;
        } else if (ch === 's') {
          out[index] = [{ glyph: LONG_S, advance: 0.25 }];
          any = true;
        } else if (ch === 'x') {
          out[index] = [
            { glyph: HALF_A, advance: 0.5 },
            { glyph: HALF_B, advance: 0.25 },
          ];
          any = true;
        } else if (ch === 'q') {
          out[index] = [{ glyph: NO_OUTLINE, advance: 0.5 }];
          any = true;
        }
      });
      return any ? out : null;
    },
  };
}

function exportText(font: OutlineFont, overrides: Partial<TextCanvasItem>): string {
  const doc = { ...createDefaultProjectDocument(), nodes: [createTextItem(overrides)] };
  return documentToSvg(doc, makeSvgDeps({ fontOutlines: { getOutlineFont: () => ({ ok: true, font }) } })).svg;
}

/** Every glyph box of the exported text: where it starts and how wide it is. */
function glyphBoxes(svg: string): { penX: number; baselineY: number; width: number }[] {
  const d = svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
  return [...d.matchAll(/M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)h(\d+(?:\.\d+)?)/g)].map((m) => ({
    penX: Number(m[1]),
    baselineY: Number(m[2]),
    width: Number(m[3]),
  }));
}

const drawn = (svg: string) => glyphBoxes(svg).map((box) => [box.penX, box.width]);

describe('text export: glyphs a font substitutes', () => {
  it('draws a ligature once, where its first character starts, and nothing for the characters it covers', () => {
    const svg = exportText(substitutingFont(), { text: 'afib' });
    // a at 0, fi at 10 (the f), nothing at 20 (the i), b at 30
    expect(drawn(svg)).toEqual([
      [0, 10],
      [10, FI],
      [30, 10],
    ]);
  });

  it('asks the font about each line as a whole when letter spacing is 0, as the canvas draws it', () => {
    const calls: Calls = [];
    exportText(substitutingFont(calls), {
      text: 'fig fit',
      width: 40,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(calls.map((text) => text.trim())).toEqual(['fig', 'fit']);
  });

  it('draws the ligature of every line', () => {
    const svg = exportText(substitutingFont(), {
      text: 'fig fit',
      width: 40,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const ligatures = glyphBoxes(svg).filter((box) => box.width === FI);
    expect(ligatures).toHaveLength(2);
    expect(ligatures[0].penX).toBe(0);
    expect(ligatures[1].penX).toBe(0);
    expect(ligatures[1].baselineY).toBeGreaterThan(ligatures[0].baselineY);
  });

  it('forms no ligature with letter spacing, where the canvas draws character by character', () => {
    const calls: Calls = [];
    const svg = exportText(substitutingFont(calls), { text: 'afib', letterSpacing: 5 });
    expect(drawn(svg)).toEqual([
      [0, 10],
      [15, 10],
      [30, 10],
      [45, 10],
    ]);
    // The font is asked about one character at a time, never about "fi".
    expect(calls).toEqual(['a', 'f', 'i', 'b']);
  });

  it('forms no ligature with negative letter spacing either', () => {
    const svg = exportText(substitutingFont(), { text: 'fi', letterSpacing: -2 });
    expect(drawn(svg)).toEqual([
      [0, 10],
      [8, 10],
    ]);
  });

  it('still draws the glyph a font gives a single character, with and without letter spacing', () => {
    expect(drawn(exportText(substitutingFont(), { text: 'as' }))).toEqual([
      [0, 10],
      [10, LONG_S],
    ]);
    expect(drawn(exportText(substitutingFont(), { text: 'as', letterSpacing: 5 }))).toEqual([
      [0, 10],
      [15, LONG_S],
    ]);
  });

  it('draws the glyphs of one character one after another, each moved on by the advance before it', () => {
    // fontSize 40: the first half advances 0.5 em = 20px
    const svg = exportText(substitutingFont(), { text: 'axb', fontSize: 40 });
    expect(drawn(svg)).toEqual([
      [0, 10],
      [10, HALF_A],
      [30, HALF_B],
      [20, 10],
    ]);
  });

  it('keeps the characters after a ligature where the measurer puts them', () => {
    const svg = exportText(substitutingFont(), { text: 'fib', align: 'right' });
    // line width 30 in a 320 box: f at 290, b at 310
    expect(drawn(svg)).toEqual([
      [290, FI],
      [310, 10],
    ]);
  });

  it('draws nothing for a substituted glyph without an outline', () => {
    expect(drawn(exportText(substitutingFont(), { text: 'aqb' }))).toEqual([
      [0, 10],
      [20, 10],
    ]);
  });

  it('exports text the font substitutes nothing in exactly as a font that cannot substitute', () => {
    const overrides = { text: 'Hamburg', letterSpacing: 0 };
    expect(exportText(substitutingFont(), overrides)).toBe(exportText(fakeOutlineFont, overrides));
    const spaced = { text: 'Hamburg', letterSpacing: 3 };
    expect(exportText(substitutingFont(), spaced)).toBe(exportText(fakeOutlineFont, spaced));
  });
});
