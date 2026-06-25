import type { TextCanvasItem } from '../../document/documentTypes';
import { getRenderableCanvasFontDeclaration } from '../../fonts/fontStyles';
import type { TextMeasurer } from './svgExportTypes';

/**
 * The string Pixi's `CanvasTextMetrics.measureFont` measures to derive font
 * ascent/descent: `METRICS_STRING` (`|ÉqÅ`) + `BASELINE_SYMBOL` (`M`). The ascent
 * is the ACTUAL ink top of these glyphs, NOT the font's nominal
 * `fontBoundingBoxAscent` — on decorative faces (e.g. Modernia, whose accented
 * caps tower far above the nominal ascent) the two differ by tens of pixels, and
 * Pixi positions the baseline by the former. Matching it here keeps the exported
 * baseline aligned with the on-screen render.
 */
const PIXI_FONT_METRICS_STRING = '|ÉqÅM';

/**
 * Pixi's `linePositionYShift`: when the line box is taller than the font's ink
 * height, the extra leading is split evenly above/below, nudging the baseline
 * down. When the line box is shorter (the common case for tight line heights),
 * there is no shift. Pure so it can be unit-tested without a canvas.
 */
export function pixiLinePositionYShift(
  ascent: number,
  descent: number,
  lineHeight: number,
): number {
  const fontSize = ascent + descent;
  return lineHeight - fontSize < 0 ? 0 : (lineHeight - fontSize) / 2;
}

/**
 * Canvas-2D backed measurer — the SAME engine Pixi rasterizes text with, so widths
 * (kerning included) and baseline match what's on screen by construction. Falls
 * back to rough estimates when no 2D context is available (e.g. jsdom).
 */
export function createCanvasTextMeasurer(): TextMeasurer {
  const ctx = document.createElement('canvas').getContext('2d');

  return {
    measureWidth(item: TextCanvasItem, text: string): number {
      if (!ctx) return text.length * item.fontSize * 0.6;
      ctx.font = getRenderableCanvasFontDeclaration(item);
      return ctx.measureText(text).width;
    },
    fontAscent(item: TextCanvasItem): number {
      if (!ctx) return item.fontSize * 0.8;
      ctx.font = getRenderableCanvasFontDeclaration(item);
      // Replicate Pixi's CanvasTextMetrics.measureFont exactly: ascent/descent are
      // the ink bounds of PIXI_FONT_METRICS_STRING, and the baseline within the
      // line box is `ascent + linePositionYShift`.
      const metrics = ctx.measureText(PIXI_FONT_METRICS_STRING);
      let ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
        ? metrics.actualBoundingBoxAscent
        : 0;
      let descent = Number.isFinite(metrics.actualBoundingBoxDescent)
        ? metrics.actualBoundingBoxDescent
        : 0;
      // Pixi's `fontSize === 0` fallback (font failed to measure).
      if (ascent + descent === 0) {
        ascent = item.fontSize;
        descent = 0;
      }
      const lineHeight = item.fontSize * item.lineHeight;
      return ascent + pixiLinePositionYShift(ascent, descent, lineHeight);
    },
  };
}
