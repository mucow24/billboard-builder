/**
 * How far a text layer's ink reaches outside the texture Pixi rasterises it into.
 *
 * Pixi sizes a text texture from advance metrics: the advance width of the
 * longest line across (or the wrap width, for centred and right-aligned text),
 * and the font's ascent and descent down. Every line is drawn from its pen
 * position inside that box, and whatever falls outside is cut off. Glyph ink
 * regularly does fall outside: an italic glyph leans past its advance width, a
 * script "j" swings left of its origin, a cedilla hangs below the font's descent.
 * A drop shadow falls outside too: Pixi widens the texture by the length of the
 * shadow's offset, to the right and downwards only, and not at all for its blur.
 *
 * `measureInkOverhang` repeats Pixi's placement of each line
 * (`CanvasTextGenerator._renderTextToCanvas`) and reports how far the ink, and
 * its shadow when there is one, leave the texture on each side. `rasterPaddingForOverhang` turns that into the room
 * to give the text style as `padding`, and `snapPaddingToTexels` fits it to the
 * resolution the text is rasterised at. Pixi adds the padding around the texture
 * and shifts the quad back by the same amount, so the text gains room without
 * moving.
 *
 * Pure: the measurements come in through `measureRun`, so this is testable
 * without a canvas.
 */

/** A run of text as `CanvasRenderingContext2D.measureText` reports it. */
export interface TextRunMetrics {
  /** Advance width. */
  width: number;
  /**
   * Reach of the ink from the pen position: `actualBoundingBoxLeft`,
   * `actualBoundingBoxRight`, `actualBoundingBoxAscent` and
   * `actualBoundingBoxDescent`. Left and descent count positive away from the
   * pen, so a glyph with a left side bearing has a negative `inkLeft`.
   */
  inkLeft: number;
  inkRight: number;
  inkAscent: number;
  inkDescent: number;
}

/** What Pixi measured for the text (`CanvasTextMetrics`), plus the style fields that place its lines. */
export interface RasterTextLayout {
  lines: readonly string[];
  /** Width Pixi aligns each line by. */
  lineWidths: readonly number[];
  maxLineWidth: number;
  /** Distance between baselines. */
  lineHeight: number;
  /** The ascent Pixi places the first baseline by, and ascent plus descent. */
  fontAscent: number;
  fontHeight: number;
  /** Size of the texture without padding, before Pixi rounds it up to whole pixels. */
  width: number;
  height: number;
  align: 'left' | 'center' | 'right' | 'justify';
  wordWrap: boolean;
  wordWrapWidth: number;
  letterSpacing: number;
}

/**
 * A drop shadow as Pixi draws it under the text (`_setupDropShadow`): the ink
 * again, moved by the offset and blurred. In px of the text.
 */
export interface RasterShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
}

export interface InkOverhang {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Ink extent of one line, measured from the line's pen position and baseline. */
interface LineInk {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

function hasInk(metrics: TextRunMetrics): boolean {
  return metrics.inkLeft + metrics.inkRight > 0 && metrics.inkAscent + metrics.inkDescent > 0;
}

/**
 * With letter spacing Pixi draws a line one grapheme at a time
 * (`_drawLetterSpacing`): each is advanced by what it adds to the width of the
 * rest of the line, which keeps kerning, plus the spacing.
 */
function measureSpacedLineInk(
  line: string,
  letterSpacing: number,
  measureRun: (text: string) => TextRunMetrics,
  splitGraphemes: (text: string) => string[],
): LineInk | null {
  const graphemes = splitGraphemes(line);
  let ink: LineInk | null = null;
  let position = 0;
  let remainingWidth = measureRun(line).width;

  for (let index = 0; index < graphemes.length; index += 1) {
    const metrics = measureRun(graphemes[index]);
    if (hasInk(metrics)) {
      const reach: LineInk = {
        left: metrics.inkLeft - position,
        right: position + metrics.inkRight,
        ascent: metrics.inkAscent,
        descent: metrics.inkDescent,
      };
      ink = ink
        ? {
            left: Math.max(ink.left, reach.left),
            right: Math.max(ink.right, reach.right),
            ascent: Math.max(ink.ascent, reach.ascent),
            descent: Math.max(ink.descent, reach.descent),
          }
        : reach;
    }
    const rest = graphemes.slice(index + 1).join('');
    const widthAfter = rest ? measureRun(rest).width : 0;
    position += remainingWidth - widthAfter + letterSpacing;
    remainingWidth = widthAfter;
  }

  return ink;
}

function measureLineInk(
  line: string,
  letterSpacing: number,
  measureRun: (text: string) => TextRunMetrics,
  splitGraphemes: (text: string) => string[],
): LineInk | null {
  if (line.length === 0) return null;
  if (letterSpacing !== 0) {
    return measureSpacedLineInk(line, letterSpacing, measureRun, splitGraphemes);
  }
  const metrics = measureRun(line);
  if (!hasInk(metrics)) return null;
  return {
    left: metrics.inkLeft,
    right: metrics.inkRight,
    ascent: metrics.inkAscent,
    descent: metrics.inkDescent,
  };
}

/**
 * A canvas shadow shows this many px past the ink it is cast from, per px of
 * `shadowBlur`, and this many more whatever the blur.
 *
 * Measured, not taken from the Gaussian the blur stands for: the shadow of a
 * straight edge, which no glyph's shadow reaches past, read back down to the
 * last alpha level that is not zero. Over blurs from 0.1 to 256 texels it shows
 * up to 1.5 texels per texel of blur in Chromium, on a GPU canvas and on a
 * software one, and 1.2 in Firefox. Half of that distance is fainter than 3% of
 * the shadow's opacity, but cutting it still leaves a straight edge in the
 * falloff. An edge or an offset at a fraction of a texel adds up to 0.75 of a
 * texel. Text is rasterised at one texel per px or finer, so a px covers that.
 */
const SHADOW_REACH_PER_BLUR = 1.5;
const SHADOW_REACH_PX = 1;

/** How far past the ink, in px, a shadow of this `blur` still shows. */
export function shadowBlurReach(blur: number): number {
  const usableBlur = Number.isFinite(blur) ? Math.max(0, blur) : 0;
  return SHADOW_REACH_PER_BLUR * usableBlur + SHADOW_REACH_PX;
}

/**
 * How far the ink of `layout`'s lines reaches past each edge of the unpadded
 * texture, in px; 0 for a side the ink stays inside. With a `shadow`, how far
 * the ink or its shadow reaches, whichever is further: `layout` is then Pixi's
 * measurement of the style with its drop shadow, whose width and height
 * include the length of the offset.
 */
export function measureInkOverhang(
  layout: RasterTextLayout,
  measureRun: (text: string) => TextRunMetrics,
  splitGraphemes: (text: string) => string[],
  shadow?: RasterShadow,
): InkOverhang {
  const textureWidth = Math.ceil(Math.max(1, layout.width));
  const textureHeight = Math.ceil(Math.max(1, layout.height));
  // Lines are aligned inside the wrap width, or inside the longest line when
  // that is wider.
  const alignWidth = layout.wordWrap
    ? Math.max(layout.wordWrapWidth, layout.maxLineWidth)
    : layout.maxLineWidth;
  // A line box taller than the font is split evenly above and below the text.
  const lineShift = Math.max(0, (layout.lineHeight - layout.fontHeight) / 2);

  // The shadow is the ink moved by the offset and grown by the blur on every
  // side, so on each side it reaches this much further than the ink, or less far.
  const reach = shadow ? shadowBlurReach(shadow.blur) : 0;
  const shadowLeft = shadow ? Math.max(0, reach - shadow.offsetX) : 0;
  const shadowRight = shadow ? Math.max(0, reach + shadow.offsetX) : 0;
  const shadowTop = shadow ? Math.max(0, reach - shadow.offsetY) : 0;
  const shadowBottom = shadow ? Math.max(0, reach + shadow.offsetY) : 0;

  const overhang: InkOverhang = { left: 0, right: 0, top: 0, bottom: 0 };

  layout.lines.forEach((line, index) => {
    const ink = measureLineInk(line, layout.letterSpacing, measureRun, splitGraphemes);
    if (!ink) return;

    const lineWidth = layout.lineWidths[index] ?? 0;
    let penX = 0;
    if (layout.align === 'right') {
      penX = alignWidth - lineWidth;
    } else if (layout.align === 'center') {
      penX = (alignWidth - lineWidth) / 2;
    }
    const baseline = index * layout.lineHeight + layout.fontAscent + lineShift;

    overhang.left = Math.max(overhang.left, ink.left - penX + shadowLeft);
    overhang.right = Math.max(overhang.right, penX + ink.right - textureWidth + shadowRight);
    overhang.top = Math.max(overhang.top, ink.ascent - baseline + shadowTop);
    overhang.bottom = Math.max(overhang.bottom, baseline + ink.descent - textureHeight + shadowBottom);
  });

  return overhang;
}

/** Overhang below this many px is less than a hundredth of a pixel's coverage: nothing to show. */
const NEGLIGIBLE_OVERHANG = 0.01;

/**
 * Drawn ink reaches a little further than the bounds `measureText` reports. The
 * bounds are for the layer's own font size at whole-pixel positions; the texture
 * is rasterised at the zoom level and at fractional pen positions, where hinting
 * places outlines differently and anti-aliasing touches one more texel. Firefox
 * also leaves synthesised bold out of the bounds, which grows with the font.
 * Over every bundled and web-safe family in Chromium and Firefox the difference
 * stayed within this many px plus this share of the font size.
 */
const INK_MARGIN_PX = 3;
const INK_MARGIN_PER_FONT_SIZE = 0.02;

/**
 * The room, in px, a Pixi text style needs as `padding` so that none of
 * `overhang` is cut off, and 0 when the ink already fits. Pixi applies one
 * padding to all four sides, so the furthest side decides.
 */
export function rasterPaddingForOverhang(overhang: InkOverhang, fontSize: number): number {
  const furthest = Math.max(
    0,
    ...[overhang.left, overhang.right, overhang.top, overhang.bottom].filter(Number.isFinite),
  );
  if (furthest <= NEGLIGIBLE_OVERHANG) return 0;
  const usableFontSize = Number.isFinite(fontSize) ? Math.max(0, fontSize) : 0;
  return Math.ceil(furthest + INK_MARGIN_PX + INK_MARGIN_PER_FONT_SIZE * usableFontSize);
}

/**
 * Text textures have mipmaps, and mip level n is made of blocks of 2^n texels.
 * Glyphs moved by a whole number of these blocks sit in every level up to the
 * fourth exactly as before, which covers the text shown at 1/16 of its raster
 * size.
 */
const TEXEL_BLOCK = 16;

/**
 * `padding` rounded up to whole blocks of texels at `resolution`, the number of
 * texels per px the text is rasterised at.
 *
 * Pixi draws the text `padding` px into its texture and moves the quad back by
 * as much, so the text is in the same place whatever the padding. What the
 * padding can change is the anti-aliasing. A fraction of a texel puts every
 * glyph between the texels it would land on without padding. A whole number of
 * texels keeps the texture itself the same, but regroups the texels in its
 * mipmaps, which shows wherever the text is drawn smaller than it was
 * rasterised: zoomed out, and in an export from a high-density display. With
 * whole blocks the text renders pixel for pixel as it does without padding.
 */
export function snapPaddingToTexels(padding: number, resolution: number): number {
  if (!(padding > 0)) return 0;
  if (!(resolution > 0) || !Number.isFinite(resolution)) return padding;
  // The epsilon keeps floating-point noise in the product from adding a block.
  const blocks = Math.ceil((padding * resolution) / TEXEL_BLOCK - 1e-6);
  return (blocks * TEXEL_BLOCK) / resolution;
}
