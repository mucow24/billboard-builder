import type { TextCanvasItem } from '../../document/documentTypes';
import { getRenderableCanvasFontDeclaration } from '../../fonts/fontStyles';
import { measureFirstBaseline } from '../../rendering/textBaseline';
import type { TextMeasurer } from './svgExportTypes';

/**
 * Width of the ink of a measured text, the way Pixi's
 * `CanvasTextMetrics._measureText` works it out: how far the ink reaches left of
 * the pen (`actualBoundingBoxLeft`, negative when the ink starts right of the
 * pen) plus how far it reaches right of it. A bound the browser does not report
 * counts as 0. Pure so it can be unit-tested without a canvas.
 */
export function inkWidthOf(
  metrics: Pick<TextMetrics, 'actualBoundingBoxLeft' | 'actualBoundingBoxRight'>,
): number {
  const left = Number.isFinite(metrics.actualBoundingBoxLeft) ? metrics.actualBoundingBoxLeft : 0;
  const right = Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxRight : 0;
  return left + right;
}

/**
 * Canvas-2D backed measurer — the SAME engine Pixi rasterizes text with, so widths
 * (kerning included) match what's on screen by construction, and the baseline
 * comes from the function the canvas places its text by. Falls back to rough
 * estimates when no 2D context is available (e.g. jsdom).
 */
export function createCanvasTextMeasurer(): TextMeasurer {
  const ctx = document.createElement('canvas').getContext('2d');

  return {
    measureWidth(item: TextCanvasItem, text: string): number {
      if (!ctx) return text.length * item.fontSize * 0.6;
      ctx.font = getRenderableCanvasFontDeclaration(item);
      return ctx.measureText(text).width;
    },
    measureInkWidth(item: TextCanvasItem, text: string): number {
      if (!ctx) return text.length * item.fontSize * 0.6;
      ctx.font = getRenderableCanvasFontDeclaration(item);
      return inkWidthOf(ctx.measureText(text));
    },
    firstBaseline(item: TextCanvasItem): number {
      // The same function the canvas places its text by.
      return measureFirstBaseline(item);
    },
  };
}
