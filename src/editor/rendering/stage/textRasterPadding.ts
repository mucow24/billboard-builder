import {
  CanvasTextMetrics,
  TextStyle,
  fontStringFromTextStyle,
  generateTextStyleKey,
} from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';

import { measureInkOverhang, rasterPaddingForOverhang } from '../textInkOverhang';
import type { TextRunMetrics } from '../textInkOverhang';

// Every render of a text layer asks again, mostly for a text and style it has
// asked for before: a zoom step re-renders all of them.
const CACHE_LIMIT = 500;
const paddingCache = new Map<string, number>();

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

const finiteOrZero = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * The room, in px, to give `style` as `padding` so that Pixi's text texture
 * holds all of the ink of `text`, including what leaves the advance box the
 * texture is sized from (see `textInkOverhang`). 0 when the ink already fits,
 * which leaves the texture exactly as it is without padding. Fit the result to
 * the text's resolution with `snapPaddingToTexels` before using it.
 *
 * Lines and their widths are Pixi's own measurement of `style`, so the result
 * follows the wrapping and alignment Pixi renders with. The ink of each line is
 * measured with the same 2D canvas font Pixi rasterises with.
 *
 * `style` is the style without `padding` and without a fill; neither changes
 * where the ink falls.
 */
export function measureTextRasterPadding(text: string, style: TextStyleOptions): number {
  const context = getMeasuringContext();
  if (!context) return 0;

  const textStyle = new TextStyle({ ...style, padding: 0 });
  // Pixi rasterises an empty text as a single space.
  const content = text || ' ';
  // By value: `TextStyle.styleKey` is different for every instance. The number
  // of registered faces is part of the key because a family measures differently
  // once its own font has arrived.
  const cacheKey = `${document.fonts?.size ?? 0}\n${generateTextStyleKey(textStyle)}\n${content}`;
  const cached = paddingCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const measured = CanvasTextMetrics.measureText(content, textStyle);
  context.font = fontStringFromTextStyle(textStyle);
  const measureRun = (run: string): TextRunMetrics => {
    const metrics = context.measureText(run);
    return {
      width: metrics.width,
      inkLeft: finiteOrZero(metrics.actualBoundingBoxLeft),
      inkRight: finiteOrZero(metrics.actualBoundingBoxRight),
      inkAscent: finiteOrZero(metrics.actualBoundingBoxAscent),
      inkDescent: finiteOrZero(metrics.actualBoundingBoxDescent),
    };
  };

  const padding = rasterPaddingForOverhang(
    measureInkOverhang(
      {
        lines: measured.lines,
        lineWidths: measured.lineWidths,
        maxLineWidth: measured.maxLineWidth,
        lineHeight: measured.lineHeight,
        fontAscent: measured.fontProperties.ascent,
        fontHeight: measured.fontProperties.fontSize,
        width: measured.width,
        height: measured.height,
        align: textStyle.align,
        wordWrap: textStyle.wordWrap,
        wordWrapWidth: textStyle.wordWrapWidth,
        letterSpacing: textStyle.letterSpacing,
      },
      measureRun,
      CanvasTextMetrics.graphemeSegmenter,
    ),
    textStyle.fontSize,
  );

  if (paddingCache.size >= CACHE_LIMIT) paddingCache.clear();
  paddingCache.set(cacheKey, padding);
  return padding;
}
