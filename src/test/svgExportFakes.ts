import type {
  FontOutlineProvider,
  NodeRasterizer,
  OutlineFont,
  SvgExportDeps,
  TextMeasurer,
} from '../editor/io/svg/svgExportTypes';

/**
 * Deterministic injected fakes for SVG-export unit tests. jsdom has no working 2D
 * canvas, so real measurement/rasterization is impossible here — these stand in
 * with predictable numbers so glyph positions and emitted markup are assertable.
 * (Real fidelity is covered by the node-env opentype test and the e2e spec.)
 */

// 10px per char advance, 8px ascent => every glyph position is exactly predictable.
export const fakeMeasurer: TextMeasurer = {
  measureWidth: (_item, text) => text.length * 10,
  fontAscent: () => 8,
};

// Each non-space glyph is a 10x10 box whose path encodes the pen position so tests
// can read placement straight out of the `d` attribute.
export const fakeOutlineFont: OutlineFont = {
  unitsPerEm: 1000,
  glyphPath: (ch, _size, penX, baselineY) =>
    ch === ' ' ? null : `M${penX} ${baselineY}h10v-10h-10Z`,
};

export const fakeOutlineProvider: FontOutlineProvider = {
  getOutlineFont: () => ({ ok: true, font: fakeOutlineFont }),
};

// Models a system font (Arial) or an unparseable face: no outline available.
export const nullOutlineProvider: FontOutlineProvider = {
  getOutlineFont: () => ({ ok: false, reason: 'system-font' }),
};

export const fakeRasterizer: NodeRasterizer = {
  rasterizeGenerator: () => 'data:image/png;base64,STUB',
};

export function makeSvgDeps(overrides: Partial<SvgExportDeps> = {}): SvgExportDeps {
  return {
    fontOutlines: fakeOutlineProvider,
    measurer: fakeMeasurer,
    rasterizer: fakeRasterizer,
    ...overrides,
  };
}
