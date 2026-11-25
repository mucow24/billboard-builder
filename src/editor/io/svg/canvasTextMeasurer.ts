import type { TextCanvasItem } from '../../document/documentTypes';
import { subscribeToFontRegistrations } from '../../fonts/fontRegistrations';
import { getRenderableCanvasFontDeclaration } from '../../fonts/fontStyles';
import { measureFirstBaseline } from '../../rendering/textBaseline';
import { inkWidthOf } from '../../rendering/textMeasurement';
import type { TextMeasurer } from './svgExportTypes';

/**
 * The size `drawsBoldAsRegular` draws its sample at, and the side of the canvas
 * it draws on. At this size faked bold grows a glyph by 1.5 px or smears it 1 px
 * (see syntheticFontStyle): far more than it takes to change a pixel.
 */
const BOLD_PROBE_FONT_SIZE = 48;
const BOLD_PROBE_CANVAS_SIZE = BOLD_PROBE_FONT_SIZE * 2;

// What `drawsBoldAsRegular` has drawn and compared, by the bold declaration
// and the sample. A file registered later may be the one the browser draws
// with from then on, so a registration forgets all of it.
const drawnAsRegular = new Map<string, boolean>();
subscribeToFontRegistrations(() => drawnAsRegular.clear());
let probe: CanvasRenderingContext2D | null | undefined;
/** The pixels of `sample` drawn with `font`, on a canvas of its own. */
const drawn = (font: string, sample: string): Uint8ClampedArray | null => {
  if (probe === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = BOLD_PROBE_CANVAS_SIZE;
    canvas.height = BOLD_PROBE_CANVAS_SIZE;
    probe = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, BOLD_PROBE_CANVAS_SIZE, BOLD_PROBE_CANVAS_SIZE);
  probe.font = font;
  probe.fillText(sample, BOLD_PROBE_FONT_SIZE / 2, BOLD_PROBE_FONT_SIZE * 1.5);
  return probe.getImageData(0, 0, BOLD_PROBE_CANVAS_SIZE, BOLD_PROBE_CANVAS_SIZE).data;
};

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
    drawsBoldAsRegular(item: TextCanvasItem, sample: string): boolean {
      // Whether bold is faked does not go by the size, so one size does for all.
      const probed = { ...item, fontSize: BOLD_PROBE_FONT_SIZE };
      const bold = getRenderableCanvasFontDeclaration(probed);
      const key = `${bold}\n${sample}`;
      let same = drawnAsRegular.get(key);
      if (same === undefined) {
        const boldPixels = drawn(bold, sample);
        const regularPixels = drawn(getRenderableCanvasFontDeclaration({ ...probed, fontWeight: 'normal' }), sample);
        // Nothing to draw with: it cannot be told, and bold is taken as faked.
        same =
          boldPixels !== null &&
          regularPixels !== null &&
          boldPixels.every((value, index) => value === regularPixels[index]);
        drawnAsRegular.set(key, same);
      }
      return same;
    },
    firstBaseline(item: TextCanvasItem): number {
      // The same function the canvas places its text by.
      return measureFirstBaseline(item);
    },
  };
}
