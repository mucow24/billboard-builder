import type { GeneratorCanvasItem, TextCanvasItem } from '../../document/documentTypes';

/**
 * Injected boundary for SVG export. The core serializer (`documentToSvg`) is pure
 * and synchronous; everything browser-dependent — glyph outlines, text
 * measurement, generator rasterization — is provided through these interfaces so
 * the serializer can be unit-tested in jsdom with deterministic fakes.
 *
 * opentype is a SHAPE provider only: `OutlineFont.glyphPath` returns a glyph
 * contour; it never reports advances. All positioning comes from the
 * `TextMeasurer` (canvas `measureText`, the source Pixi lays text out with).
 * Measuring does not by itself get kerning right: the widths of single
 * characters leave it out. `svgText` therefore places each glyph from the
 * measured width of the rest of its line, which is the rule the canvas follows.
 */
export interface OutlineFont {
  readonly unitsPerEm: number;
  /**
   * SVG path `d` for `ch` placed with its baseline origin at (penX, baselineY), or null
   * if there is nothing to draw: the glyph has no outline, or its position or size is
   * not a finite number.
   */
  glyphPath(ch: string, fontSizePx: number, penX: number, baselineY: number): string | null;
  /** The same for a glyph the font puts in place of characters, given by its index in the font (see `substitutions`). */
  glyphPath(glyphIndex: number, fontSizePx: number, penX: number, baselineY: number): string | null;
  /**
   * The glyphs the canvas draws in place of the characters' own when it draws
   * `text` in one piece: ligatures (f + i as one glyph) and the other substitutions
   * a font applies to all text. Null when `text` has none. A font that cannot
   * tell (the test fakes) leaves this out, and is drawn one character at a time.
   */
  substitutions?(text: string): TextSubstitutions | null;
}

/** A glyph a font draws in place of one or more characters. */
export interface SubstituteGlyph {
  /** Its index in the font, for `OutlineFont.glyphPath`. */
  glyph: number;
  /** How far it moves the pen, in em: where a second glyph for the same character starts. */
  advance: number;
}

/**
 * What a font draws for a text, one entry per character (code point): null for a
 * character that keeps its own glyph, otherwise the glyphs drawn at its position
 * instead, one after another. The list is empty for a character that an earlier
 * glyph already covers, such as the i of an fi ligature.
 */
export type TextSubstitutions = readonly (readonly SubstituteGlyph[] | null)[];

export type OutlineUnavailableReason = 'system-font' | 'no-bytes' | 'parse-failed';

/** Either the resolved outline font, or why it could not be obtained (drives the block+warn path). */
export type OutlineResult =
  | { ok: true; font: OutlineFont }
  | { ok: false; reason: OutlineUnavailableReason };

export interface FontOutlineProvider {
  getOutlineFont(item: TextCanvasItem): OutlineResult;
}

export interface TextMeasurer {
  /**
   * Width in px of `text` at the item's resolved font, EXCLUDING letterSpacing
   * and INCLUDING the kerning between its characters, as canvas `measureText`
   * reports it. Glyph placement depends on the kerning being in here.
   */
  measureWidth(item: TextCanvasItem, text: string): number;
  /**
   * Width in px of the ink of `text`, from its leftmost to its rightmost painted
   * point (canvas `actualBoundingBoxLeft + actualBoundingBoxRight`), EXCLUDING
   * letterSpacing. Usually a little narrower than `measureWidth`; wider where a
   * glyph at either end of the text reaches past its advance, as slanted and
   * swashed glyphs do. Pixi aligns a line by the larger of the two widths, so
   * `svgText` needs both to put centred and right-aligned lines where the canvas
   * does.
   *
   * Optional: lines measured without it are aligned by their advance width.
   */
  measureInkWidth?(item: TextCanvasItem, text: string): number;
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
