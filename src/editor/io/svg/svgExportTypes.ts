import type { GeneratorCanvasItem, TextCanvasItem } from '../../document/documentTypes';

/**
 * Injected boundary for SVG export. The core serializer (`documentToSvg`) is pure
 * and synchronous; everything browser-dependent — glyph outlines, text
 * measurement, generator rasterization — is provided through these interfaces so
 * the serializer can be unit-tested in jsdom with deterministic fakes.
 *
 * opentype is a SHAPE provider only: `OutlineFont.glyphPath` returns a glyph
 * contour; it never reports advances. All positioning comes from the
 * `TextMeasurer` (canvas `measureText`, the exact source Pixi renders with), so
 * kerning/advance fidelity is correct by construction.
 */
export interface OutlineFont {
  readonly unitsPerEm: number;
  /** SVG path `d` for `ch` placed with its baseline origin at (penX, baselineY), or null if the glyph has no outline. */
  glyphPath(ch: string, fontSizePx: number, penX: number, baselineY: number): string | null;
}

export type OutlineUnavailableReason = 'system-font' | 'no-bytes' | 'parse-failed';

/** Either the resolved outline font, or why it could not be obtained (drives the block+warn path). */
export type OutlineResult =
  | { ok: true; font: OutlineFont }
  | { ok: false; reason: OutlineUnavailableReason };

export interface FontOutlineProvider {
  getOutlineFont(item: TextCanvasItem): OutlineResult;
}

export interface TextMeasurer {
  /** Width in px of `text` at the item's resolved font, EXCLUDING letterSpacing. */
  measureWidth(item: TextCanvasItem, text: string): number;
  /**
   * Baseline offset in px from the line-box top for the first line, matching
   * Pixi's `CanvasTextMetrics`: the actual-ink ascent of `|ÉqÅM` plus
   * `linePositionYShift`. (Deliberately NOT the font's nominal
   * `fontBoundingBoxAscent`, which diverges from the on-screen baseline on
   * decorative faces.) `svgText` adds `lineIndex * lineHeight` for later lines.
   */
  fontAscent(item: TextCanvasItem): number;
}

export interface NodeRasterizer {
  /** Rasterize a full-canvas generator to a PNG data URL. */
  rasterizeGenerator(item: GeneratorCanvasItem, canvasWidth: number, canvasHeight: number): string;
}

export interface SvgExportDeps {
  fontOutlines: FontOutlineProvider;
  measurer: TextMeasurer;
  rasterizer: NodeRasterizer;
}

/**
 * A text layer that could not be vectorized. The serializer omits the layer and
 * records this; the controller's blocking policy refuses the download when any
 * are present (decision: block + warn over degrading fidelity).
 */
export interface SvgExportWarning {
  kind: 'unvectorizable-text';
  itemId: string;
  itemName: string;
  fontFamily: string;
  reason: OutlineUnavailableReason;
}

export interface SvgExportResult {
  svg: string;
  warnings: SvgExportWarning[];
}
