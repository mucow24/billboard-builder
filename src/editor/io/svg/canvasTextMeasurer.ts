import type { TextCanvasItem } from '../../document/documentTypes';
import { getRenderableCanvasFontDeclaration } from '../../fonts/fontStyles';
import { measureFirstBaseline } from '../../rendering/textBaseline';
import { inkWidthOf } from '../../rendering/textMeasurement';
import type { TextMeasurer } from './svgExportTypes';

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
    syntheticBoldAdvance(item: TextCanvasItem, sample: string): number {
      if (!ctx) return 0;
      ctx.font = getRenderableCanvasFontDeclaration(item);
      const bold = ctx.measureText(sample).width;
      ctx.font = getRenderableCanvasFontDeclaration({ ...item, fontWeight: 'normal' });
      return Math.max(0, bold - ctx.measureText(sample).width);
    },
    firstBaseline(item: TextCanvasItem): number {
      // The same function the canvas places its text by.
      return measureFirstBaseline(item);
    },
  };
}
