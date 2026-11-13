/**
 * Where the baselines of a text layer go.
 *
 * A layer's text is a stack of line boxes, each `fontSize * lineHeight` tall,
 * starting at the top of the layer's content box. Inside its line box a line is
 * placed so that the font's capitals are centred: the space above the top of an
 * "H" equals the space below the baseline.
 *
 * The rule uses one measurement, the height of the font's own "H", so the same
 * text sits at the same height whichever font it is set in. The font's ascent
 * and descent are left out on purpose: display fonts declare them loosely, and
 * the ink of accented capitals, which Pixi goes by, has nothing to do with
 * where unaccented text looks centred.
 *
 * The canvas and the SVG export both take the baseline from here.
 */
import type { TextCanvasItem } from '../document/documentTypes';
import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';

/** The capital whose height stands for the font's cap height: flat at the top, standing on the baseline. */
const CAP_HEIGHT_GLYPH = 'H';

/** Cap height as a share of the font size where it cannot be measured; typical of text faces. */
const ESTIMATED_CAP_HEIGHT_PER_FONT_SIZE = 0.7;

/**
 * Distance from the top of a line box `lineHeight` tall to the baseline that
 * centres capitals `capHeight` tall in it. All in px.
 */
export function capCentredBaseline(lineHeight: number, capHeight: number): number {
  return (lineHeight + capHeight) / 2;
}

/**
 * Distance from the top of a Pixi text to its first baseline
 * (`CanvasTextGenerator._renderTextToCanvas`): the ascent of the font as
 * `CanvasTextMetrics.measureFont` reports it, the ink of "|ÉqÅM", plus half of
 * whatever the line box has left over once that ink's ascent and descent are
 * taken out. A line box shorter than the ink leaves the baseline at the ascent.
 */
export function pixiFirstBaseline(ascent: number, descent: number, lineHeight: number): number {
  return ascent + Math.max(0, (lineHeight - (ascent + descent)) / 2);
}

/**
 * The cap height a measurement of "H" gives for a font of `fontSize`: how far
 * its ink rises above the baseline. Estimated from the font size where the
 * browser reports nothing usable.
 */
export function capHeightOf(
  metrics: Pick<TextMetrics, 'actualBoundingBoxAscent'>,
  fontSize: number,
): number {
  const height = metrics.actualBoundingBoxAscent;
  return Number.isFinite(height) && height > 0
    ? height
    : fontSize * ESTIMATED_CAP_HEIGHT_PER_FONT_SIZE;
}

/**
 * `offset` rounded to whole texels at `resolution`, the number of texels per px
 * the text is rasterised at. Text moved by a fraction of a texel is drawn
 * between the pixels its texture was rasterised for and turns soft.
 */
export function snapOffsetToTexels(offset: number, resolution: number): number {
  if (!Number.isFinite(offset)) return 0;
  if (!(resolution > 0) || !Number.isFinite(resolution)) return offset;
  return Math.round(offset * resolution) / resolution;
}

let measuringContext: CanvasRenderingContext2D | null | undefined;

function getMeasuringContext(): CanvasRenderingContext2D | null {
  if (measuringContext === undefined) {
    // jsdom has no 2D context and logs an error when asked for one.
    const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
    measuringContext =
      typeof document !== 'undefined' && !isJsdom
        ? document.createElement('canvas').getContext('2d')
        : null;
  }
  return measuringContext;
}

/**
 * Cap height of the font `item` renders with, in px, or null where there is no
 * canvas to measure with. A font without an "H" is measured by the fallback
 * font's, the glyph the browser would draw for one.
 */
export function measureCapHeight(item: TextCanvasItem): number | null {
  const context = getMeasuringContext();
  if (!context) return null;
  context.font = getRenderableCanvasFontDeclaration(item);
  return capHeightOf(context.measureText(CAP_HEIGHT_GLYPH), item.fontSize);
}

/**
 * Distance in px from the top of `item`'s first line box to its baseline. Each
 * further line is one `fontSize * lineHeight` lower.
 */
export function measureFirstBaseline(item: TextCanvasItem): number {
  const capHeight = measureCapHeight(item) ?? item.fontSize * ESTIMATED_CAP_HEIGHT_PER_FONT_SIZE;
  return capCentredBaseline(item.fontSize * item.lineHeight, capHeight);
}
