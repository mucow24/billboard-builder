import { CanvasTextMetrics, TextStyle, fontStringFromTextStyle } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';

import type { TextCanvasItem } from '../../document/documentTypes';
import { capCentredBaseline, measureCapHeight, pixiFirstBaseline } from '../textBaseline';

/**
 * How far down, in px, to move the Pixi text of `item` so that its baselines
 * are where the layer wants them (see `textBaseline`) instead of where Pixi
 * draws them inside its texture. Negative moves it up. `style` is the Pixi
 * style the text is rendered with.
 *
 * Pixi offers no way to say where the baseline goes: it takes the ascent of a
 * font from the ink of "|ÉqÅM" and draws the first line that far down. The
 * texture is left as Pixi makes it and the whole text is moved instead. Ink
 * that the texture would cut off is the business of `textRasterPadding`, which
 * goes by the texture and so is not affected.
 *
 * 0 where there is no canvas to measure with.
 */
export function measureTextBaselineShift(item: TextCanvasItem, style: TextStyleOptions): number {
  const capHeight = measureCapHeight(item);
  if (capHeight === null) return 0;

  const textStyle = new TextStyle({ ...style, padding: 0 });
  const font = CanvasTextMetrics.measureFont(fontStringFromTextStyle(textStyle));
  // A font that measures as nothing counts as all ascent (`CanvasTextMetrics.measureText`).
  const measuresAsNothing = font.ascent + font.descent === 0;
  const ascent = measuresAsNothing ? textStyle.fontSize : font.ascent;
  const descent = measuresAsNothing ? 0 : font.descent;
  const lineHeight = textStyle.lineHeight;

  return capCentredBaseline(lineHeight, capHeight) - pixiFirstBaseline(ascent, descent, lineHeight);
}
