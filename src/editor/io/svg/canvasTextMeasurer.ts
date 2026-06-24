import type { TextCanvasItem } from '../../document/documentTypes';
import { getRenderableCanvasFontDeclaration } from '../../fonts/fontStyles';
import type { TextMeasurer } from './svgExportTypes';

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
      const metrics = ctx.measureText('M');
      const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      return Number.isFinite(ascent) && ascent > 0 ? ascent : item.fontSize * 0.8;
    },
  };
}
