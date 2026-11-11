import { describe, expect, it } from 'vitest';

import {
  measureInkOverhang,
  rasterPaddingForOverhang,
  snapPaddingToTexels,
  type RasterTextLayout,
  type TextRunMetrics,
} from './textInkOverhang';

/** A glyph with an advance of 60, standing on the baseline, 70 tall, with a 5 px bearing on both sides. */
const UPRIGHT: TextRunMetrics = { width: 60, inkLeft: -5, inkRight: 55, inkAscent: 70, inkDescent: 0 };

const run = (overrides: Partial<TextRunMetrics> = {}): TextRunMetrics => ({ ...UPRIGHT, ...overrides });

/** A font whose ascent is 80 and descent 20, set on a 100 px line box, left aligned, one line. */
function layout(overrides: Partial<RasterTextLayout> = {}): RasterTextLayout {
  const lines = overrides.lines ?? ['H'];
  const lineWidths = overrides.lineWidths ?? lines.map(() => 60);
  const maxLineWidth = Math.max(...lineWidths);
  const lineHeight = overrides.lineHeight ?? 100;
  return {
    lines,
    lineWidths,
    maxLineWidth,
    lineHeight,
    fontAscent: 80,
    fontHeight: 100,
    width: maxLineWidth,
    height: 100 + (lines.length - 1) * lineHeight,
    align: 'left',
    wordWrap: true,
    wordWrapWidth: 300,
    letterSpacing: 0,
    ...overrides,
  };
}

const measureWith =
  (runs: Record<string, TextRunMetrics>) =>
  (text: string): TextRunMetrics => {
    const metrics = runs[text];
    if (!metrics) throw new Error(`unexpected measurement of ${JSON.stringify(text)}`);
    return metrics;
  };

const NO_INK: TextRunMetrics = { width: 0, inkLeft: 0, inkRight: 0, inkAscent: 0, inkDescent: 0 };
const splitCharacters = (text: string) => [...text];

const NONE = { left: 0, right: 0, top: 0, bottom: 0 };

describe('measureInkOverhang', () => {
  it('reports nothing while the ink stays inside the texture', () => {
    expect(measureInkOverhang(layout(), measureWith({ H: UPRIGHT }), splitCharacters)).toEqual(NONE);
  });

  it('reports how far the last glyph leans past the end of its line', () => {
    const leaning = run({ inkRight: 67.5 });

    expect(measureInkOverhang(layout(), measureWith({ H: leaning }), splitCharacters)).toEqual({
      ...NONE,
      right: 7.5,
    });
  });

  it('measures against the texture as Pixi rounds it up', () => {
    // A 59.2 px line gets a 60 px texture, which takes the first 0.8 px of the lean.
    const narrow = layout({ lineWidths: [59.2], width: 59.2 });

    expect(
      measureInkOverhang(narrow, measureWith({ H: run({ width: 59.2, inkRight: 62 }) }), splitCharacters).right,
    ).toBeCloseTo(2);
  });

  it('reports ink to the left of the origin of the first glyph', () => {
    const tail = run({ inkLeft: 12 });

    expect(measureInkOverhang(layout(), measureWith({ H: tail }), splitCharacters)).toEqual({ ...NONE, left: 12 });
  });

  it('ends a right-aligned line at the wrap width, so its lean leaves the texture', () => {
    const rightAligned = layout({ align: 'right', width: 300 });

    expect(
      measureInkOverhang(rightAligned, measureWith({ H: run({ inkRight: 67.5 }) }), splitCharacters),
    ).toEqual({ ...NONE, right: 7.5 });
  });

  it('gives a centred line the rest of the wrap width to lean into', () => {
    const centred = layout({ align: 'center', width: 300 });

    expect(measureInkOverhang(centred, measureWith({ H: run({ inkLeft: 12, inkRight: 67.5 }) }), splitCharacters)).toEqual(
      NONE,
    );
  });

  it('aligns to the longest line when a line is wider than the wrap width', () => {
    // Pixi widens the texture to the longest line; the short line is still set right in it.
    const overflowing = layout({
      lines: ['long', 'H'],
      lineWidths: [340, 60],
      align: 'right',
      width: 340,
    });
    const measure = measureWith({
      long: run({ width: 340, inkLeft: -5, inkRight: 335 }),
      H: run({ inkRight: 67.5 }),
    });

    expect(measureInkOverhang(overflowing, measure, splitCharacters).right).toBeCloseTo(7.5);
  });

  it('reports ink above the font ascent on the first line', () => {
    expect(measureInkOverhang(layout(), measureWith({ H: run({ inkAscent: 86 }) }), splitCharacters)).toEqual({
      ...NONE,
      top: 6,
    });
  });

  it('reports ink below the font descent on the last line', () => {
    expect(measureInkOverhang(layout(), measureWith({ H: run({ inkDescent: 31 }) }), splitCharacters)).toEqual({
      ...NONE,
      bottom: 11,
    });
  });

  it('lets a tall glyph on a later line reach into the line above it', () => {
    const twoLines = layout({ lines: ['H', 'É'] });
    const measure = measureWith({ H: UPRIGHT, É: run({ inkAscent: 95, inkDescent: 15 }) });

    expect(measureInkOverhang(twoLines, measure, splitCharacters)).toEqual(NONE);
  });

  it('splits a line box taller than the font evenly above and below the text', () => {
    // 140 px line box, 100 px font: the baseline moves down 20 px, and the texture is 140 px tall.
    const airy = layout({ lineHeight: 140, height: 140 });

    expect(
      measureInkOverhang(airy, measureWith({ H: run({ inkAscent: 106, inkDescent: 45 }) }), splitCharacters),
    ).toEqual({ ...NONE, top: 6, bottom: 5 });
  });

  it('does not shift the text when the line box is shorter than the font', () => {
    // Lines 80 px apart: baselines at 80 and 160, texture 180 px tall.
    const tight = layout({ lines: ['H', 'g'], lineHeight: 80, height: 180 });
    const measure = measureWith({ H: run({ inkAscent: 84 }), g: run({ inkDescent: 27 }) });

    expect(measureInkOverhang(tight, measure, splitCharacters)).toEqual({ ...NONE, top: 4, bottom: 7 });
  });

  it('takes the furthest reach over all lines', () => {
    const threeLines = layout({ lines: ['a', 'b', 'c'], lineWidths: [60, 60, 60] });
    const measure = measureWith({
      a: run({ inkRight: 63 }),
      b: run({ inkRight: 71, inkLeft: 2 }),
      c: run({ inkLeft: 9 }),
    });

    expect(measureInkOverhang(threeLines, measure, splitCharacters)).toEqual({ ...NONE, left: 9, right: 11 });
  });

  it('skips lines that have no ink', () => {
    const withBlank = layout({ lines: ['', '  ', 'H'], lineWidths: [0, 20, 60] });
    const measure = measureWith({ '': NO_INK, '  ': { ...NO_INK, width: 20 }, H: UPRIGHT });

    expect(measureInkOverhang(withBlank, measure, splitCharacters)).toEqual(NONE);
  });

  describe('with letter spacing', () => {
    // Pixi then draws one glyph at a time, advancing each by what it adds to the
    // width of the rest of the line, plus the spacing.
    const spaced = (overrides: Partial<RasterTextLayout> = {}) =>
      layout({ lines: ['ab'], lineWidths: [130], width: 130, letterSpacing: 10, ...overrides });

    it('places each glyph by the width it adds to the rest of the line', () => {
      // "ab" is 120 px wide without spacing, "b" alone 60: the b is drawn at 60 + 10.
      const measure = measureWith({
        ab: run({ width: 120, inkRight: 115 }),
        a: UPRIGHT,
        b: run({ inkRight: 67.5 }),
        '': NO_INK,
      });

      expect(measureInkOverhang(spaced(), measure, splitCharacters)).toEqual({ ...NONE, right: 7.5 });
    });

    it('carries kerning between a pair into the position of the second glyph', () => {
      // The pair is kerned 8 px tighter than its two advances.
      const measure = measureWith({
        ab: run({ width: 112, inkRight: 107 }),
        a: UPRIGHT,
        b: run({ inkRight: 67.5 }),
        '': NO_INK,
      });

      // b at 112 - 60 + 10 = 62; its ink ends at 129.5 in a 122 px line.
      const kerned = spaced({ lineWidths: [122], width: 122 });
      expect(measureInkOverhang(kerned, measure, splitCharacters).right).toBeCloseTo(7.5);
    });

    it('lets negative spacing pull the ink of a later glyph left of the line start', () => {
      const tight = spaced({ lineWidths: [50], width: 50, letterSpacing: -70 });
      const measure = measureWith({
        ab: run({ width: 120, inkRight: 115 }),
        a: UPRIGHT,
        b: UPRIGHT,
        '': NO_INK,
      });

      // b is drawn at 60 - 70 = -10, so its ink starts at -5; a ends at 55 in a 50 px texture.
      expect(measureInkOverhang(tight, measure, splitCharacters)).toEqual({ ...NONE, left: 5, right: 5 });
    });

    it('measures a glyph cluster as one piece', () => {
      // An e followed by a combining acute accent: two code points, one grapheme.
      const cluster = String.fromCharCode(0x65, 0x301);
      const measure = measureWith({
        [cluster]: run({ inkAscent: 92 }),
        '': NO_INK,
      });
      const oneCluster = layout({ lines: [cluster], letterSpacing: 10 });

      expect(measureInkOverhang(oneCluster, measure, () => [cluster]).top).toBe(12);
    });
  });
});

describe('rasterPaddingForOverhang', () => {
  it('needs no padding without overhang, whatever the font size', () => {
    expect(rasterPaddingForOverhang(NONE, 100)).toBe(0);
    expect(rasterPaddingForOverhang(NONE, 1000)).toBe(0);
  });

  it('covers the furthest side plus 3 px and 2% of the font size, in whole pixels', () => {
    // 7.2 + 3 + 2
    expect(rasterPaddingForOverhang({ left: 2, right: 7.2, top: 0, bottom: 3 }, 100)).toBe(13);
    // 12 + 3 + 1
    expect(rasterPaddingForOverhang({ left: 12, right: 0, top: 0, bottom: 0 }, 50)).toBe(16);
    // 3 + 3 + 0.2
    expect(rasterPaddingForOverhang({ left: 0, right: 0, top: 3, bottom: 0 }, 10)).toBe(7);
  });

  it('ignores overhang too small to show', () => {
    expect(rasterPaddingForOverhang({ left: 0, right: 1e-9, top: 0, bottom: 0.004 }, 100)).toBe(0);
  });

  it('treats unusable measurements as no overhang', () => {
    // 4.5 + 3 + 2
    expect(rasterPaddingForOverhang({ left: Number.NaN, right: 4.5, top: Number.NaN, bottom: 0 }, 100)).toBe(10);
    expect(rasterPaddingForOverhang({ left: Number.NaN, right: Number.NaN, top: 0, bottom: 0 }, 100)).toBe(0);
    // 4.5 + 3, without a usable font size
    expect(rasterPaddingForOverhang({ left: 0, right: 4.5, top: 0, bottom: 0 }, Number.NaN)).toBe(8);
  });
});

describe('snapPaddingToTexels', () => {
  it('rounds up to whole blocks of 16 texels', () => {
    expect(snapPaddingToTexels(9, 1)).toBe(16);
    expect(snapPaddingToTexels(16, 1)).toBe(16);
    expect(snapPaddingToTexels(17, 1)).toBe(32);
    // 18 texels become 32, which is 16 px again
    expect(snapPaddingToTexels(9, 2)).toBe(16);
    // 11.25 texels become 16
    expect(snapPaddingToTexels(9, 1.25)).toBeCloseTo(12.8, 10);
    // 27.4 texels become 32
    expect(snapPaddingToTexels(17, 1.609375)).toBeCloseTo(32 / 1.609375, 10);
    // below 1: 2.25 texels become 16
    expect(snapPaddingToTexels(9, 0.25)).toBe(64);
  });

  it.each([1, 1.1, 1.25, 4 / 3, 1.5, 1.609375, 1.75, 2, 2.2, 2.625, 3.7, 0.3, 1 / 64])(
    'gives whole blocks, never less than asked for, at resolution %f',
    (resolution) => {
      for (const padding of [1, 2, 5, 9, 12, 16, 31, 58, 293]) {
        const snapped = snapPaddingToTexels(padding, resolution);
        const blocks = (snapped * resolution) / 16;

        expect(snapped).toBeGreaterThanOrEqual(padding - 1e-9);
        expect(Math.abs(blocks - Math.round(blocks))).toBeLessThan(1e-9);
        // and less than one block over
        expect(snapped * resolution - padding * resolution).toBeLessThan(16);
      }
    },
  );

  it('does not add a block for floating-point noise', () => {
    // 0.1 + 0.2 is 0.30000000000000004: still 48 texels, three blocks, at resolution 160
    expect(snapPaddingToTexels(0.1 + 0.2, 160)).toBeCloseTo(0.3, 10);
  });

  it('keeps no padding as none', () => {
    expect(snapPaddingToTexels(0, 1.25)).toBe(0);
    expect(snapPaddingToTexels(-3, 1.25)).toBe(0);
    expect(snapPaddingToTexels(Number.NaN, 1.25)).toBe(0);
  });

  it('leaves the padding alone without a usable resolution', () => {
    expect(snapPaddingToTexels(9, 0)).toBe(9);
    expect(snapPaddingToTexels(9, Number.NaN)).toBe(9);
    expect(snapPaddingToTexels(9, Number.POSITIVE_INFINITY)).toBe(9);
  });
});
