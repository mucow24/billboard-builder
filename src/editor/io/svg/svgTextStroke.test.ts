import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import type { TextCanvasItem } from '../../document/documentTypes';
import { fakeMeasurer, fakeOutlineFont, makeSvgDeps } from '../../../test/svgExportFakes';
import { documentToSvg } from './documentToSvg';
import type { GlyphPathStyle, SyntheticFontStyle } from './svgExportTypes';

/**
 * The outline of a text layer as `svgText` writes it. That it looks like the
 * canvas is proven against a real browser in e2e (`editor.text-stroke`); these
 * tests pin down what is written, and in which order.
 */

function exportText(overrides: Partial<TextCanvasItem>, synthetic?: SyntheticFontStyle): string {
  const item = createTextItem({ id: 'layer', text: 'AB', fontSize: 64, ...overrides });
  return documentToSvg(
    { ...createDefaultProjectDocument(), nodes: [item] },
    makeSvgDeps({
      fontOutlines: { getOutlineFont: () => ({ ok: true, font: fakeOutlineFont, synthetic }) },
      measurer: fakeMeasurer,
    }),
  ).svg;
}

const pathTags = (svg: string): string[] => svg.match(/<path [^>]*>/g) ?? [];
const isOutline = (tag: string) => tag.includes('fill="none"');
const pathData = (tag: string) => tag.match(/ d="([^"]+)"/)?.[1];

const OUTLINED = { stroke: '#ff0000ff', strokeWidth: 8 };

describe('text with an outline', () => {
  it('writes nothing extra while the width is 0', () => {
    const tags = pathTags(exportText({ stroke: '#ff0000ff', strokeWidth: 0 }));
    expect(tags).toHaveLength(1);
    expect(tags[0]).not.toContain('stroke');
  });

  it('strokes the glyph outlines in the outline colour, with round joins and caps', () => {
    const [outline] = pathTags(exportText(OUTLINED));
    expect(outline).toContain('fill="none" stroke="#ff0000" stroke-width="8"');
    expect(outline).toContain('stroke-linejoin="round" stroke-linecap="round"');
  });

  it('puts the outline under the fill, around the same glyphs', () => {
    const tags = pathTags(exportText({ ...OUTLINED, fill: '#336699' }));
    expect(tags.map(isOutline)).toEqual([true, false]);
    expect(tags[1]).toContain('fill="#336699"');
    expect(tags[1]).not.toContain('stroke');
    expect(pathData(tags[0])).toBe(pathData(tags[1]));
  });

  it('leaves the fill as it is without an outline', () => {
    const [, fill] = pathTags(exportText(OUTLINED));
    const [plain] = pathTags(exportText({}));
    // Closed contours fill the same; only the stroke needs them.
    expect(pathData(fill)?.replace(/Z/g, '')).toBe(pathData(plain)?.replace(/Z/g, ''));
  });

  it('asks for closed contours, or the stroke has a gap in every glyph', () => {
    const styles: Array<GlyphPathStyle | undefined> = [];
    const item = createTextItem({ id: 'layer', text: 'AB', fontSize: 64, ...OUTLINED });
    documentToSvg(
      { ...createDefaultProjectDocument(), nodes: [item] },
      makeSvgDeps({
        fontOutlines: {
          getOutlineFont: () => ({
            ok: true,
            font: {
              ...fakeOutlineFont,
              glyphPath: (ch, size, penX, baselineY, style) => {
                styles.push(style);
                return fakeOutlineFont.glyphPath(String(ch), size, penX, baselineY);
              },
            },
          }),
        },
        measurer: fakeMeasurer,
      }),
    );
    expect(styles.map((style) => style?.closed)).toEqual([true, true]);
  });

  it('paints a see-through outline opaque and makes it see-through as a whole', () => {
    const svg = exportText({ stroke: '#ff000080', strokeWidth: 8 });
    const group = svg.match(/<g opacity="([\d.]+)"><path [^>]*><\/g>/);
    expect(Number(group?.[1])).toBeCloseTo(128 / 255, 2);
    const [outline] = pathTags(svg);
    expect(outline).toContain('stroke="#ff0000"');
    expect(outline).not.toContain('opacity');
  });

  it('draws no outline in a colour that shows nothing', () => {
    expect(pathTags(exportText({ stroke: '#ff000000', strokeWidth: 8 }))).toHaveLength(1);
  });

  // The browser grows faked bold by a stroke 1/32 of the font size wide, and
  // the canvas outlines the grown glyphs.
  it('widens the outline by the stroke that fakes bold', () => {
    const tags = pathTags(exportText(OUTLINED, { bold: true, italic: false }));
    expect(tags.map(isOutline)).toEqual([true, false]);
    expect(tags[0]).toContain('stroke-width="10"');
    expect(tags[1]).toContain('stroke-width="2" stroke-linejoin="miter"');
  });

  it('casts the shadow from outline and fill together', () => {
    const svg = exportText({
      ...OUTLINED,
      shadow: { color: '#000000', blur: 4, offsetX: 3, offsetY: 3, opacity: 0.5 },
    });
    const filtered = svg.match(/<g[^>]* filter="url\(#fx-layer\)"[^>]*>(.*?)<\/g>/s)?.[1] ?? '';
    expect(pathTags(filtered).map(isOutline)).toEqual([true, false]);
  });
});

/** The region of the item's filter, and the corners of the glyph paths under it. */
function filterRegionAndInk(svg: string) {
  const tag = svg.match(/<filter [^>]*>/)?.[0] ?? '';
  const attr = (name: string) => Number(tag.match(new RegExp(` ${name}="([-\\d.]+)"`))?.[1]);
  const region = { x: attr('x'), y: attr('y'), right: attr('x') + attr('width'), bottom: attr('y') + attr('height') };
  const numbers = pathTags(svg).flatMap((path) =>
    [...(pathData(path) ?? '').matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]),
  );
  const xs = numbers.map(([x]) => x);
  const ys = numbers.map(([, y]) => y);
  return {
    tag,
    region,
    ink: { x: Math.min(...xs), y: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) },
  };
}

describe('the filter region of text with an outline', () => {
  const SHADOW = { color: '#000000', blur: 10, offsetX: 40, offsetY: -25, opacity: 0.5 };
  // Wider than the glyphs are tall: more than the default region has room for.
  const WIDE = { stroke: '#ff0000ff', strokeWidth: 90 };

  it('is given in the coordinates of the item, not as a share of the glyphs', () => {
    const { tag } = filterRegionAndInk(exportText({ ...WIDE, shadow: SHADOW }));
    expect(tag).toContain('filterUnits="userSpaceOnUse"');
    expect(tag).not.toContain('%');
  });

  it('holds the ink, half the outline around it, and the shadow where it falls', () => {
    const { region, ink } = filterRegionAndInk(exportText({ ...WIDE, shadow: SHADOW }));
    const half = WIDE.strokeWidth / 2;
    // Three standard deviations of the shadow's blur, which is half its blur.
    const soft = 3 * (SHADOW.blur / 2);
    expect(region.x).toBeLessThanOrEqual(ink.x - half - soft);
    expect(region.y).toBeLessThanOrEqual(ink.y - half - soft + SHADOW.offsetY);
    expect(region.right).toBeGreaterThanOrEqual(ink.right + half + soft + SHADOW.offsetX);
    expect(region.bottom).toBeGreaterThanOrEqual(ink.bottom + half + soft);
  });

  it('holds what a layer blur spreads', () => {
    const sharp = filterRegionAndInk(exportText({ ...WIDE, shadow: SHADOW })).region;
    const blurred = filterRegionAndInk(exportText({ ...WIDE, shadow: SHADOW, blurRadius: 8 })).region;
    // Three standard deviations of the blur, which is half its radius.
    expect(sharp.x - blurred.x).toBeCloseTo(12, 5);
    expect(blurred.bottom - sharp.bottom).toBeCloseTo(12, 5);
  });

  it('grows with the outline', () => {
    const thin = filterRegionAndInk(exportText({ stroke: '#ff0000ff', strokeWidth: 10, shadow: SHADOW })).region;
    const wide = filterRegionAndInk(exportText({ ...WIDE, shadow: SHADOW })).region;
    expect(thin.x - wide.x).toBeCloseTo(40, 5);
    expect(wide.right - thin.right).toBeCloseTo(40, 5);
  });

  it('covers every fragment of text with tags', () => {
    const { region, ink } = filterRegionAndInk(
      exportText({ ...WIDE, shadow: SHADOW, text: 'A<b>B</b>\n<color=#00ff00>AB</color>' }),
    );
    const half = WIDE.strokeWidth / 2;
    expect(region.x).toBeLessThanOrEqual(ink.x - half);
    expect(region.y).toBeLessThanOrEqual(ink.y - half + SHADOW.offsetY);
    expect(region.right).toBeGreaterThanOrEqual(ink.right + half + SHADOW.offsetX);
    expect(region.bottom).toBeGreaterThanOrEqual(ink.bottom + half);
  });
});

describe('text with tags and an outline', () => {
  it('puts the outline of every fragment under the fill of every fragment', () => {
    const tags = pathTags(exportText({ ...OUTLINED, text: 'A<b>B</b><color=#00ff00>A</color>' }));
    expect(tags.map(isOutline)).toEqual([true, true, true, false, false, false]);
    // In the same order, around the same glyphs.
    expect(tags.slice(0, 3).map(pathData)).toEqual(tags.slice(3).map(pathData));
  });

  it('makes the outlines of all fragments see-through together', () => {
    const svg = exportText({ stroke: '#ff000080', strokeWidth: 8, text: 'A<b>B</b>' });
    expect(svg).toMatch(/<g opacity="[\d.]+">(<path [^>]*fill="none"[^>]*>){2}<\/g>/);
  });
});
