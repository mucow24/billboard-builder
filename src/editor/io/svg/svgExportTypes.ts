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
   *
   * `style` changes how the outline is written (see `GlyphPathStyle`). A font that
   * cannot do that (the test fakes) ignores it.
   */
  glyphPath(ch: string, fontSizePx: number, penX: number, baselineY: number, style?: GlyphPathStyle): string | null;
  /** The same for a glyph the font puts in place of characters, given by its index in the font (see `substitutions`). */
  glyphPath(glyphIndex: number, fontSizePx: number, penX: number, baselineY: number, style?: GlyphPathStyle): string | null;
  /**
   * The glyphs the canvas draws in place of the characters' own when it draws
   * `text` in one piece: ligatures (f + i as one glyph) and the other substitutions
   * a font applies to all text. Null when `text` has none. A font that cannot
   * tell (the test fakes) leaves this out, and is drawn one character at a time.
   */
  substitutions?(text: string): TextSubstitutions | null;
}

/** How `OutlineFont.glyphPath` writes a glyph, for the styles the export fakes (see syntheticFontStyle). */
export interface GlyphPathStyle {
  /**
   * Leans the glyph to the right about its baseline, by this distance for each
   * unit of height: how faked italic is drawn.
   */
  slant?: number;
  /**
   * Ends every contour with a closepath (`Z`). Filling does not need it: an open
   * contour is filled as if it were closed. Stroking does: an open contour gets no
   * stroke along the edge that would close it and no join at the corner where it
   * starts. Asked for where the glyphs are stroked (faked bold).
   */
  closed?: boolean;
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

/**
 * What the browser fakes when it draws a text with the font file resolved for it:
 * bold when the text is bold and the file is not, italic likewise. The export
 * fakes the same (see syntheticFontStyle).
 */
export interface SyntheticFontStyle {
  bold: boolean;
  italic: boolean;
}

/** Either the resolved outline font, or why it could not be obtained (drives the block+warn path). */
export type OutlineResult =
  | { ok: true; font: OutlineFont; synthetic?: SyntheticFontStyle }
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
   * How much wider the browser draws `sample` (one character) in the item's bold
   * than in the same font at regular weight, in px; 0 when it is no wider. Only
   * meaningful for an item whose bold is faked: both weights then come from one
   * file, and a difference means the browser fakes bold by smearing the glyph
   * that far (Firefox) rather than by growing its outline.
   *
   * Optional: without it faked bold is exported as a grown outline.
   */
  syntheticBoldAdvance?(item: TextCanvasItem, sample: string): number;
  /**
   * Distance in px from the top of the item's first line box to its baseline,
   * where the canvas draws it: the font's capitals centred in the line box (see
   * `rendering/textBaseline`). `svgText` adds `lineIndex * lineHeight` for later
   * lines.
   */
  firstBaseline(item: TextCanvasItem): number;
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
