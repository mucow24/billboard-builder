import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import type { TextCanvasItem } from '../../document/documentTypes';
import { fakeMeasurer, fakeOutlineFont, makeSvgDeps } from '../../../test/svgExportFakes';
import { documentToSvg } from './documentToSvg';
import type { GlyphPathStyle, OutlineFont, SyntheticFontStyle, TextMeasurer } from './svgExportTypes';

/**
 * Bold and italic the browser fakes for want of a font file, as `svgText` writes
 * them. That each construction looks like the canvas is proven against a real
 * browser in e2e; these tests pin down what is written, and when.
 */

function exportText(
  overrides: Partial<TextCanvasItem>,
  synthetic: SyntheticFontStyle | undefined,
  options: { font?: OutlineFont; measurer?: TextMeasurer } = {},
): string {
  const item = createTextItem({ id: 'layer', text: 'AB', fontSize: 64, ...overrides });
  return documentToSvg(
    { ...createDefaultProjectDocument(), nodes: [item] },
    makeSvgDeps({
      fontOutlines: {
        getOutlineFont: () => ({ ok: true, font: options.font ?? fakeOutlineFont, synthetic }),
      },
      measurer: options.measurer ?? fakeMeasurer,
    }),
  ).svg;
}

/** The attributes of the one `<path>` that holds the text's glyphs. */
function glyphPathTag(svg: string): string {
  const tags = svg.match(/<path [^>]*>/g) ?? [];
  expect(tags).toHaveLength(1);
  return tags[0] ?? '';
}

function penPositions(svg: string): number[] {
  const d = glyphPathTag(svg).match(/ d="([^"]+)"/)?.[1] ?? '';
  return [...d.matchAll(/M(-?\d+(?:\.\d+)?) /g)].map((match) => Number(match[1]));
}

const BOLD = { bold: true, italic: false };
const ITALIC = { bold: false, italic: true };
const SMEARING: TextMeasurer = { ...fakeMeasurer, syntheticBoldAdvance: () => 2 };

/** The style each glyph of "AB" is asked for when exported with `synthetic` faked. */
function stylesAskedFor(
  synthetic: SyntheticFontStyle | undefined,
  measurer?: TextMeasurer,
): Array<GlyphPathStyle | undefined> {
  const styles: Array<GlyphPathStyle | undefined> = [];
  const glyphPath = (ch: string | number, size: number, penX: number, baselineY: number, style?: GlyphPathStyle) => {
    styles.push(style);
    return fakeOutlineFont.glyphPath(String(ch), size, penX, baselineY);
  };
  exportText({}, synthetic, { font: { ...fakeOutlineFont, glyphPath }, measurer });
  return styles;
}

describe('text whose italic the browser fakes', () => {
  const slantsAskedFor = (synthetic: SyntheticFontStyle | undefined) =>
    stylesAskedFor(synthetic).map((style) => style?.slant);

  it('leans every glyph by a quarter of its height', () => {
    expect(slantsAskedFor(ITALIC)).toEqual([0.25, 0.25]);
    expect(slantsAskedFor({ bold: true, italic: true })).toEqual([0.25, 0.25]);
  });

  it('leaves the glyphs upright when italic is not faked', () => {
    expect(slantsAskedFor(undefined)).toEqual([0, 0]);
    expect(slantsAskedFor(BOLD)).toEqual([0, 0]);
  });

  it('adds no stroke', () => {
    expect(glyphPathTag(exportText({}, ITALIC))).not.toContain('stroke');
  });
});

describe('text whose bold the browser fakes by growing the outline', () => {
  it('strokes the glyphs in their fill colour, 1/32 of the font size wide, with mitered joins', () => {
    const tag = glyphPathTag(exportText({ fill: '#336699' }, BOLD));
    expect(tag).toContain('fill="#336699" stroke="#336699"');
    expect(tag).toContain('stroke-width="2" stroke-linejoin="miter" stroke-miterlimit="4"');
    expect(tag).not.toContain('opacity');
  });

  it('draws each glyph once, where it would be without the bold', () => {
    expect(penPositions(exportText({}, BOLD))).toEqual(penPositions(exportText({}, undefined)));
  });

  // A stroke follows the contour as written. Left open, a contour has no stroke
  // on its closing edge and a notch at the corner it starts from.
  it('asks for closed contours, which only stroked glyphs need', () => {
    const closed = (synthetic: SyntheticFontStyle | undefined, measurer?: TextMeasurer) =>
      stylesAskedFor(synthetic, measurer).map((style) => style?.closed);

    expect(closed(BOLD)).toEqual([true, true]);
    expect(closed({ bold: true, italic: true })).toEqual([true, true]);
    expect(closed(undefined)).toEqual([false, false]);
    expect(closed(ITALIC)).toEqual([false, false]);
    // Smeared bold is filled only.
    expect(new Set(closed(BOLD, SMEARING))).toEqual(new Set([false]));
  });

  it('adds no stroke when bold is not faked', () => {
    expect(glyphPathTag(exportText({}, undefined))).not.toContain('stroke');
  });

  // Fill and stroke overlap along the outline. See-through each on its own, they
  // would show through one another there and darken that band.
  it('makes a see-through colour opaque and the element see-through instead', () => {
    const tag = glyphPathTag(exportText({ fill: '#33669980' }, BOLD));
    expect(tag).toContain('fill="#336699" stroke="#336699"');
    expect(tag).toContain(' opacity="0.502"');
    expect(tag).not.toContain('fill-opacity');
    expect(tag).not.toContain('stroke-opacity');
  });

  it('strokes a gradient fill with the same gradient', () => {
    const svg = exportText(
      { gradientEnabled: true, gradientAngle: 90, fill: '#ff0000', secondaryFill: '#0000ff' },
      BOLD,
    );
    expect(glyphPathTag(svg)).toContain('fill="url(#grad-layer)" stroke="url(#grad-layer)" stroke-width="2"');
    expect(svg).not.toContain('<mask');
  });

  it('paints a gradient with a see-through stop through a mask of the grown glyphs', () => {
    const svg = exportText(
      { gradientEnabled: true, gradientAngle: 90, fill: '#ff000080', secondaryFill: '#0000ff', width: 300, height: 100 },
      BOLD,
    );

    // The mask holds the glyphs, filled and stroked in white.
    const mask = svg.match(/<mask id="bold-layer" maskUnits="userSpaceOnUse" ([^>]*)>(.*?)<\/mask>/);
    expect(mask).not.toBeNull();
    expect(mask![2]).toMatch(/^<path d="[^"]+" fill="#fff" stroke="#fff" stroke-width="2" /);
    // The gradient is painted once, over the same area as the mask covers...
    expect(svg).toContain(`<rect ${mask![1]} fill="url(#grad-layer)" mask="url(#bold-layer)"/>`);
    // ...which is the item's box with a font size of room on every side.
    expect(mask![1]).toBe('x="-64" y="-64" width="428" height="228"');
  });
});

describe('text whose bold the browser fakes by smearing the glyphs', () => {
  it('draws every glyph again at steps across the distance the browser smears it', () => {
    // 2 px at 64 px: steps of at most 64/192 px, so seven copies of each glyph.
    const step = 2 / 6;
    const copies = (penX: number) => Array.from({ length: 7 }, (_, index) => penX + index * step);
    const positions = penPositions(exportText({}, BOLD, { measurer: SMEARING }));

    expect(positions).toHaveLength(14);
    [...copies(0), ...copies(10)].forEach((expected, index) => {
      expect(positions[index]).toBeCloseTo(expected, 2);
    });
  });

  it('adds no stroke, and keeps the fill as it is without the bold', () => {
    const tag = glyphPathTag(exportText({ fill: '#33669980' }, BOLD, { measurer: SMEARING }));
    expect(tag).not.toContain('stroke');
    expect(tag).toContain('fill="#336699" fill-opacity="0.502"');
  });

  it('does not smear text whose bold is not faked', () => {
    expect(penPositions(exportText({}, ITALIC, { measurer: SMEARING }))).toEqual([0, 10]);
  });
});
